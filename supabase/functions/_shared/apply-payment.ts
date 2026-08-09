// Shared logic to apply a resolved MyFatoorah payment outcome to an order.
// Used by both verify (callback) and webhook functions so downgrade-protection
// rules stay identical. Success is final and never overwritten.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { mapMyFatoorahStatus, type MappedStatus } from "./payment-status.ts";

export interface ResolvedDetails {
  invoiceId?: string | null;
  invoiceReference?: string | null;
  paymentId?: string | null;
  transactionId?: string | null;
  referenceId?: string | null;
  trackId?: string | null;
  paymentMethod?: string | null;
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
    invoiceReference: invoice.Reference ?? null,
    paymentId: txn.PaymentId ?? null,
    transactionId: txn.Id ?? null,
    referenceId: txn.ReferenceId ?? null,
    trackId: txn.TrackId ?? null,
    paymentMethod: txn.PaymentMethod ?? null,
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
    myfatoorah_invoice_reference: details.invoiceReference ?? undefined,
    myfatoorah_payment_id: details.paymentId ?? undefined,
    myfatoorah_transaction_id: details.transactionId ?? undefined,
    myfatoorah_reference_id: details.referenceId ?? undefined,
    myfatoorah_track_id: details.trackId ?? undefined,
    // Actual method used per the provider response (source of truth over the requested one).
    payment_online_method: details.paymentMethod ?? undefined,
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

  // The result MUST be inspected. A rejected PATCH — e.g. PGRST204 when a
  // column in `patch` is missing because a migration never applied — otherwise
  // fails completely silently: the provider is recorded as SUCCESS, the event
  // row is marked processed, and the order simply never leaves pending_payment.
  // That is exactly what happened between 2026-06-29 and 2026-08-09.
  const { error: updateError } = await admin
    .from("orders")
    .update(patch)
    .eq("id", orderRow.id);

  if (updateError) {
    console.error(
      `apply-payment: order_update_failed order=${orderRow.id} code=${updateError.code} ${updateError.message}`,
    );
    throw new Error(`Failed to apply payment to order ${orderRow.id}: ${updateError.message}`);
  }

  // On first successful payment, fire order notifications (email + WhatsApp).
  if (mapped.isSuccess) {
    await dispatchOrderNotifications(admin, orderRow.id);
  }

  return { mapped, orderId: orderRow.id, alreadyPaid: false, changed: true };
}

/**
 * Best-effort order notifications, dispatched exactly once per order.
 * Idempotency is guaranteed by claiming `order_notified_at` with a conditional
 * update — only the winning caller proceeds to send messages.
 */
export async function dispatchOrderNotifications(
  admin: SupabaseClient,
  orderId: string,
): Promise<void> {
  try {
    // Atomically claim the notification slot (NULL -> now()).
    const claimedAt = new Date().toISOString();
    const { data: claimed } = await admin
      .from("orders")
      .update({ order_notified_at: claimedAt })
      .eq("id", orderId)
      .is("order_notified_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) return; // already notified or column missing

    const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (!order) return;
    const { data: items } = await admin.from("order_items").select("*").eq("order_id", orderId);

    const itemsSummary = (items ?? [])
      .map((i: any) => `• ${i.product_name_snapshot} ×${i.quantity}`)
      .join("\n");
    const total = Number(order.total ?? 0).toFixed(3);

    // WhatsApp settings (admin numbers + storefront url).
    const { data: waRow } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "whatsapp_integration")
      .maybeSingle();
    const wa = (waRow?.value as any) ?? {};
    const adminNumbers: string[] = Array.isArray(wa.admin_numbers) ? wa.admin_numbers : [];

    const { data: emailRow } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "order_email")
      .maybeSingle();
    const emailCfg = (emailRow?.value as any) ?? {};
    const storefront = (emailCfg.storefront_url ?? "").replace(/\/$/, "");
    const invoiceUrl = storefront ? `${storefront}/order/${order.order_number}` : "";

    // send-order-email and send-whatsapp authorize their callers, and this is
    // the caller. Present the service-role credential explicitly rather than
    // relying on supabase-js defaulting the Authorization header to the client
    // key — that default is an implementation detail, and these notifications
    // are dispatched fire-and-forget, so a 401 here would be invisible.
    const invokeHeaders = {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
    };

    const tasks: Promise<unknown>[] = [];

    // 1) Order confirmation email to admin recipients (To + CC).
    tasks.push(
      admin.functions.invoke("send-order-email", {
        headers: invokeHeaders,
        body: { mode: "order", order_id: orderId },
      }),
    );

    // 2) Customer order confirmation (order.paid).
    if (order.customer_phone) {
      tasks.push(
        admin.functions.invoke("send-whatsapp", {
          headers: invokeHeaders,
          body: {
            event: "order.paid",
            to: [order.customer_phone],
            order_id: orderId,
            data: {
              customer_name: order.customer_name,
              order_number: order.order_number,
              total,
              invoice_url: invoiceUrl,
            },
          },
        }),
      );
    }

    // 3) Admin new-order alert to company numbers.
    if (adminNumbers.length > 0) {
      tasks.push(
        admin.functions.invoke("send-whatsapp", {
          headers: invokeHeaders,
          body: {
            event: "admin.new_order",
            to: adminNumbers,
            order_id: orderId,
            data: {
              order_number: order.order_number,
              customer_name: order.customer_name,
              customer_phone: order.customer_phone,
              total,
              items_summary: itemsSummary,
            },
          },
        }),
      );
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    console.error("dispatchOrderNotifications error:", (err as Error).message);
  }
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
