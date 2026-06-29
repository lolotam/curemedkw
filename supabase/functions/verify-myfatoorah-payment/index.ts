// Verify a MyFatoorah payment after redirect (callback). Calls Get Payment
// Details, updates the order with downgrade protection, logs a payment_event.
import { z } from "npm:zod@3";
import { corsHeaders, json } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { getMyFatoorahConfig, myfatoorahRequest, MyFatoorahError } from "../_shared/myfatoorah.ts";
import { applyPaymentToOrder, extractDetails, findOrder } from "../_shared/apply-payment.ts";

const BodySchema = z.object({
  payment_id: z.string().min(3).max(100),
  order_id: z.string().uuid().optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PaymentDetails {
  Invoice?: { Id?: string; Status?: string; ExternalIdentifier?: string; UserDefinedField?: string };
  Transaction?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { payment_id, order_id } = parsed.data;

    const admin = getAdminClient();
    const config = getMyFatoorahConfig();

    // GET payment details with retry (3x / 5s, 30s timeout each).
    let details: PaymentDetails | null = null;
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await myfatoorahRequest<PaymentDetails>(
          config,
          `/v3/payments/${encodeURIComponent(payment_id)}`,
          { method: "GET", timeoutMs: 30_000 },
        );
        details = res.Data;
        break;
      } catch (err) {
        lastErr = err instanceof MyFatoorahError ? err.message : (err as Error).message;
        if (attempt < 2) await sleep(5_000);
      }
    }

    // Resolve the order.
    const ext = details?.Invoice?.ExternalIdentifier || details?.Invoice?.UserDefinedField || null;
    const order = await findOrder(admin, {
      paymentId: payment_id,
      invoiceId: details?.Invoice?.Id ?? null,
      externalId: ext,
      orderId: order_id ?? null,
    });

    // Provider unreachable -> pending_status_update.
    if (!details) {
      if (order && order.payment_status !== "paid") {
        await admin.from("orders").update({ payment_status: "pending_status_update" }).eq("id", order.id);
      }
      return json({
        success: false,
        order_id: order?.id ?? order_id ?? null,
        payment_status: "pending_status_update",
        message: "Payment status is still pending. We will update your order shortly.",
      });
    }

    if (!order) return json({ error: "Order not found for this payment" }, 404);

    const d = extractDetails(details);
    const result = await applyPaymentToOrder(admin, order, details);

    await admin.from("payment_events").insert({
      order_id: order.id,
      provider: "myfatoorah",
      event_source: "callback",
      event_type: "verify",
      event_reference: `callback:${payment_id}`,
      invoice_id: d.invoiceId,
      payment_id: d.paymentId ?? payment_id,
      transaction_id: d.transactionId,
      status: result.mapped.providerStatus,
      is_success: result.mapped.isSuccess,
      raw_payload: details as unknown as Record<string, unknown>,
      signature_valid: null,
      processed: true,
    });

    const finalStatus = result.alreadyPaid ? "paid" : result.mapped.paymentStatus;
    const isPaid = finalStatus === "paid";
    return json({
      success: isPaid,
      order_id: order.id,
      order_number: order.order_number,
      payment_status: finalStatus,
      order_status: isPaid ? "confirmed" : order.order_status,
      message: isPaid
        ? "Payment confirmed successfully."
        : result.mapped.isFinal
          ? "Payment was not completed."
          : "Payment status is still pending. We will update your order shortly.",
    });
  } catch (err) {
    console.error("verify-myfatoorah-payment error:", (err as Error).message);
    return json({ error: "Failed to verify payment" }, 500);
  }
});
