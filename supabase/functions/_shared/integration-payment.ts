import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { dispatchOrderNotifications } from "./apply-payment.ts";
import { isPlainObject } from "./evolution-pairing.ts";
import { isIntegrationUuid } from "./integration-credential-contract.ts";
import { getMyFatoorahConfig, myfatoorahRequest } from "./myfatoorah.ts";

export function paymentAttestation(raw: unknown) {
  if (!isPlainObject(raw) || !isPlainObject(raw.Invoice) || !isPlainObject(raw.Transaction)) {
    throw new Error("payment_response_invalid");
  }
  const invoice = raw.Invoice;
  const transaction = raw.Transaction;
  const external = invoice.ExternalIdentifier || invoice.UserDefinedField;
  if (!isIntegrationUuid(external) || typeof invoice.Id !== "string" || !invoice.Id ||
    typeof transaction.PaymentId !== "string" || !transaction.PaymentId) throw new Error("payment_identity_invalid");
  const card = isPlainObject(transaction.Card) ? transaction.Card : {};
  const failure = isPlainObject(transaction.Error) ? transaction.Error : {};
  const details: Record<string, string> = {};
  const fields = { invoice_reference: invoice.Reference, transaction_id: transaction.Id, reference_id: transaction.ReferenceId,
    track_id: transaction.TrackId, payment_method: transaction.PaymentMethod, card_brand: card.Brand,
    error_code: failure.Code, error_message: failure.Message };
  for (const [name, value] of Object.entries(fields)) if (typeof value === "string") details[name] = value.slice(0, 500);
  const lastFour = String(card.Number ?? "").replace(/\D/g, "").slice(-4);
  if (/^\d{4}$/.test(lastFour)) details.card_last4 = lastFour;
  return { invoice_id: invoice.Id, external_identifier: external, transaction_payment_id: transaction.PaymentId,
    invoice_status: String(invoice.Status ?? ""), transaction_status: String(transaction.Status ?? ""), details };
}

export function verifiedPaymentAttestation(raw: unknown) {
  const status = paymentAttestation(raw);
  if (!isPlainObject(raw) || !isPlainObject(raw.Amount) || raw.Amount.BaseCurrency !== "KWD") {
    throw new Error("payment_amount_invalid");
  }
  // Decimal parsing preserves the three-decimal KWD amount without rounding evidence.
  const decimal = String(raw.Amount.ValueInBaseCurrency);
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(decimal)) throw new Error("payment_amount_invalid");
  const [whole, fraction = ""] = decimal.split(".");
  const millis = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  if (millis <= 0) throw new Error("payment_amount_invalid");
  return { ...status, amount_millis: millis, currency: "KWD" };
}

async function paymentRpc(admin: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data: receipt, error } = await admin.rpc(name, args);
  if (error) throw new Error(error.message || "payment_storage_unavailable");
  return receipt;
}

export async function recordIntegrationPayment(admin: SupabaseClient, raw: unknown, source: "signed_webhook" | "verified_callback") {
  let status;
  try {
    status = source === "signed_webhook" ? paymentAttestation(raw) : verifiedPaymentAttestation(raw);
  } catch (error) {
    if (source === "signed_webhook" && error instanceof Error && error.message === "payment_identity_invalid") {
      return { handled: false, reason: "payment_identity_invalid" } as const;
    }
    throw error;
  }
  const binding = await paymentRpc(admin, "wa_find_canonical_payment_attempt", {
    p_invoice_id: status.invoice_id, p_external_identifier: status.external_identifier,
  });
  if (!isPlainObject(binding) || binding.state !== "found") {
    if (source === "signed_webhook") {
      try {
        await paymentRpc(admin, "wa_record_unbound_payment_status", { p_signed_status: status });
      } catch (error) {
        if (error instanceof Error && error.message === "unbound_success_required") {
          return { handled: false, reason: "unbound_non_success" } as const;
        }
        throw error;
      }
      return null;
    }
    throw new Error("payment_binding_unavailable");
  }
  const receipt = await paymentRpc(admin, "wa_record_provider_payment_outcome", {
    p_order_id: binding.order_id, p_attempt_id: binding.attempt_id, p_provider_status: status, p_source: source,
  });
  if (!isPlainObject(receipt)) throw new Error("payment_receipt_invalid");
  if (receipt.verification_pending === true) {
    // The outcome is already committed. A durable worker retries verification.
    try { await verifyPendingIntegrationPayment(admin, String(binding.order_id)); }
    catch { /* Preserve the committed receipt and notification eligibility. */ }
  }
  return receipt;
}

export async function verifyPendingIntegrationPayment(admin: SupabaseClient, orderId: string | null = null) {
  if (orderId === null) {
    const unbound = await paymentRpc(admin, "wa_list_unbound_payment_statuses", { p_limit: 3 });
    if (!Array.isArray(unbound)) throw new Error("payment_queue_invalid");
    for (const candidate of unbound) {
      const bound = await paymentRpc(admin, "wa_bind_unbound_payment_status", { p_pending_id: candidate.pending_id });
      if (isPlainObject(bound) && isPlainObject(bound.payment_result)) {
        const snapshot = bound.payment_result.owner_snapshot;
        if (isPlainObject(snapshot) && isPlainObject(snapshot.facts)) {
          await notifyPaidOrder(admin, snapshot.facts.order_id);
        }
      }
    }
  }
  const pending = await paymentRpc(admin, "wa_claim_pending_payment_verification", {
    p_order_id: orderId, p_worker_id: crypto.randomUUID(),
  });
  if (!isPlainObject(pending)) return;
  const lease = pending.lease_token;
  let verified;
  try {
    const response = await myfatoorahRequest<unknown>(getMyFatoorahConfig(),
      `/v3/payments/${encodeURIComponent(String(pending.transaction_payment_id))}`, { method: "GET", timeoutMs: 10_000 });
    verified = verifiedPaymentAttestation(response.Data);
  } catch (error) {
    // A failed verification remains durable and bounded by the SQL retry schedule.
    const message = error instanceof Error ? error.message : "";
    const mismatch = message === "payment_amount_invalid" || message === "payment_identity_invalid";
    const code = message === "payment_amount_invalid" ? "payment_amount_mismatch"
      : message === "payment_identity_invalid" ? "payment_identity_mismatch"
      : message === "MyFatoorah request timed out" ? "provider_timeout" : "provider_response_invalid";
    await paymentRpc(admin, "wa_resolve_pending_payment_verification", {
      p_pending_id: pending.id, p_lease_token: lease,
      p_verified_result: { code }, p_terminal_state: mismatch ? "evidence_mismatch" : "retry",
    });
    return;
  }
  await paymentRpc(admin, "wa_resolve_pending_payment_verification", {
    p_pending_id: pending.id, p_lease_token: lease, p_verified_result: verified, p_terminal_state: "resolved",
  });
  await notifyPaidOrder(admin, pending.order_id);
}

async function notifyPaidOrder(admin: SupabaseClient, orderId: unknown) {
  // Notification reads and delivery must never undo a committed payment.
  try {
    if (typeof orderId !== "string") return;
    const { data: order, error } = await admin.from("orders").select("payment_status").eq("id", orderId).maybeSingle();
    if (!error && order?.payment_status === "paid") await dispatchOrderNotifications(admin, orderId);
  } catch { /* The atomic order_notified_at claim protects subsequent attempts. */ }
}
