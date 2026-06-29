// MyFatoorah Webhook v2 receiver (PAYMENT_STATUS_CHANGED).
// Public endpoint (verify_jwt = false) — secured via HMAC-SHA256 signature.
import { corsHeaders, json } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { getMyFatoorahConfig } from "../_shared/myfatoorah.ts";
import { verifyMyFatoorahSignature } from "../_shared/payment-security.ts";
import { applyPaymentToOrder, extractDetails, findOrder } from "../_shared/apply-payment.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const raw = await req.text();
    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return json({ success: false, message: "Invalid JSON" }, 400);
    }

    const data = event?.Data ?? {};
    const eventInfo = event?.Event ?? {};
    const config = getMyFatoorahConfig();

    // Verify signature over the Data object.
    const signature = req.headers.get("myfatoorah-signature");
    const valid = await verifyMyFatoorahSignature(data, signature, config.webhookSecret);
    if (!valid) {
      return json({ success: false, message: "Invalid signature" }, 401);
    }

    // Only handle PAYMENT_STATUS_CHANGED (Code 1).
    const eventName = eventInfo?.Name ?? "";
    if (eventName !== "PAYMENT_STATUS_CHANGED" && eventInfo?.Code !== 1) {
      return json({ success: true, processed: false, ignored: eventName || "unknown" }, 200);
    }

    const admin = getAdminClient();
    const reference = eventInfo?.Reference ? `webhook:${eventInfo.Reference}` : null;
    const d = extractDetails(data);

    // Idempotency: duplicate reference -> 200 without reprocessing.
    if (reference) {
      const { data: dup } = await admin
        .from("payment_events")
        .select("id")
        .eq("provider", "myfatoorah")
        .eq("event_reference", reference)
        .maybeSingle();
      if (dup) {
        return json({ success: true, processed: false, duplicate: true }, 200);
      }
    }

    const ext = data?.Invoice?.ExternalIdentifier || data?.Invoice?.UserDefinedField || null;
    const order = await findOrder(admin, {
      paymentId: d.paymentId,
      invoiceId: d.invoiceId,
      externalId: ext,
    });

    let isSuccess = false;
    let providerStatus = "UNKNOWN";
    if (order) {
      const result = await applyPaymentToOrder(admin, order, data);
      isSuccess = result.mapped.isSuccess;
      providerStatus = result.mapped.providerStatus;
    }

    await admin.from("payment_events").insert({
      order_id: order?.id ?? null,
      provider: "myfatoorah",
      event_source: "webhook",
      event_type: eventName || "PAYMENT_STATUS_CHANGED",
      event_reference: reference,
      invoice_id: d.invoiceId,
      payment_id: d.paymentId,
      transaction_id: d.transactionId,
      status: providerStatus,
      is_success: isSuccess,
      raw_payload: event,
      signature_valid: true,
      processed: !!order,
      processing_error: order ? null : "order_not_found",
    });

    return json({ success: true, processed: !!order }, 200);
  } catch (err) {
    console.error("myfatoorah-webhook error:", (err as Error).message);
    // Return 200 to avoid unnecessary retries on our internal errors? No —
    // signal failure so MyFatoorah retries per dashboard config.
    return json({ success: false, message: "Internal error" }, 500);
  }
});
