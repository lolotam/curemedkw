// Shared logic to apply a resolved MyFatoorah payment outcome to an order.
// Used by both verify (callback) and webhook functions so downgrade-protection
// rules stay identical. Success is final and never overwritten.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { mapMyFatoorahStatus, type MappedStatus } from "./payment-status.ts";

export interface ResolvedDetails {
  invoiceId?: string | null;
  paymentId?: string | null;
  transactionId?: string | null;
  referenceId?: string | null;
  trackId?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/** Extracts a tidy ResolvedDetails from a GET-payments or webhook Data object. */
export function extractDetails(data: unknown): ResolvedDetails {
  const d = (data ?? {}) as Record<string, any>;
  const invoice = d.Invoice ?? {};
  const txn = d.Transaction ?? {};
  const card = txn.Card ?? {};
  const error = txn.Error ?? {};
  const number: string = card.Number ?? "";
  const last4 = number ? number.replace(/[^0-9]/g, "").slice(-4) : null;
  return {
    invoiceId: invoice.Id ?? null,
    paymentId: txn.PaymentId ?? null,
    transactionId: txn.Id ?? null,
    referenceId: txn.ReferenceId ?? null,
    trackId: txn.TrackId ?? null,
    cardBrand: card.Brand ?? null,
    cardLast4: last4,
    errorCode: error.Code || null,
    errorMessage: error.Message || null,
  };
}

export interface ApplyResult {
  mapped: MappedStatus;
  orderId: string;
  alreadyPaid: boolean;
  changed: boolean;
}

/**
 * Applies the mapped status to the order row with downgrade protection.
 * `orderRow` must already be loaded (at least id + payment_status).
 */
export async function applyPaymentToOrder(
  admin: SupabaseClient,
  orderRow: { id: string; payment_status: string | null; order_status?: string | null },
  data: unknown,
): Promise<ApplyResult> {
  const mapped = mapMyFatoorahStatus(data);
  const details = extractDetails(data);
  const alreadyPaid = orderRow.payment_status === "paid";

  // Never downgrade a paid order.
  if (alreadyPaid) {
    return { mapped, orderId: orderRow.id, alreadyPaid: true, changed: false };
  }

  const patch: Record<string, unknown> = {
    payment_status: mapped.paymentStatus,
    payment_verified_at: new Date().toISOString(),
    myfatoorah_invoice_id: details.invoiceId ?? undefined,
    myfatoorah_payment_id: details.paymentId ?? undefined,
    myfatoorah_transaction_id: details.transactionId ?? undefined,
    myfatoorah_reference_id: details.referenceId ?? undefined,
    myfatoorah_track_id: details.trackId ?? undefined,
    myfatoorah_card_brand: details.cardBrand ?? undefined,
    myfatoorah_card_last4: details.cardLast4 ?? undefined,
  };

  if (mapped.isSuccess) {
    patch.paid_at = new Date().toISOString();
    patch.order_status = "confirmed";
    patch.payment_error_code = null;
    patch.payment_error_message = null;
  } else if (mapped.isFinal) {
    patch.failed_at = new Date().toISOString();
    if (details.errorCode) patch.payment_error_code = details.errorCode;
    if (details.errorMessage) patch.payment_error_message = details.errorMessage;
  }

  // Strip undefined so we don't clobber existing columns.
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) delete patch[k];
  }

  await admin.from("orders").update(patch).eq("id", orderRow.id);
  return { mapped, orderId: orderRow.id, alreadyPaid: false, changed: true };
}

/** Find an order by any of the known MyFatoorah references. */
export async function findOrder(
  admin: SupabaseClient,
  opts: { paymentId?: string | null; invoiceId?: string | null; externalId?: string | null; orderId?: string | null },
) {
  const tryGet = async (col: string, value: string | null | undefined) => {
    if (!value) return null;
    const { data } = await admin.from("orders").select("*").eq(col, value).maybeSingle();
    return data ?? null;
  };
  return (
    (await tryGet("myfatoorah_payment_id", opts.paymentId)) ||
    (await tryGet("myfatoorah_invoice_id", opts.invoiceId)) ||
    (await tryGet("id", opts.externalId)) ||
    (await tryGet("id", opts.orderId))
  );
}
