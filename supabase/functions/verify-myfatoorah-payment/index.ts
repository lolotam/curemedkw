// Verify a MyFatoorah payment after redirect (callback). Calls Get Payment
// Details, updates the order with downgrade protection, logs a payment_event.
import { z } from "npm:zod@3";
import { handleOptions, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { getMyFatoorahConfig, myfatoorahRequest, MyFatoorahError } from "../_shared/myfatoorah.ts";
import { applyPaymentToOrder, extractDetails, findOrder } from "../_shared/apply-payment.ts";
import { verifyGuestToken } from "../_shared/hash.ts";

const BodySchema = z.object({
  payment_id: z.string().min(3).max(100),
  order_id: z.string().uuid().optional(),
  payment_session_token: z.string().min(8).max(200).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PaymentDetails {
  Invoice?: { Id?: string; Status?: string; ExternalIdentifier?: string; UserDefinedField?: string };
  Transaction?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") {
      console.error("verify-myfatoorah-payment: method_not_allowed");
      return jsonError(req, "method_not_allowed", "Method not allowed.", 405);
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      console.error("verify-myfatoorah-payment: invalid_request_body");
      return jsonError(req, "invalid_request_body", "Invalid request body.", 400);
    }
    const { payment_id, order_id, payment_session_token } = parsed.data;

    const admin = getAdminClient();
    let config;
    try {
      config = getMyFatoorahConfig();
    } catch {
      console.error(
        "verify-myfatoorah-payment: missing_secret — MYFATOORAH_TOKEN not set",
      );
      return jsonError(req, "missing_secret", "Payment provider is not configured.", 500);
    }

    // Resolve caller identity (optional — supports guest orders).
    let callerId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userRes, error: userErr } = await admin.auth.getUser(token);
      if (!userErr && userRes?.user) {
        callerId = userRes.user.id;
      }
    }

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

    // Authorize access to this order before exposing any status.
    if (order) {
      if (order.user_id) {
        if (!callerId || callerId !== order.user_id) {
          console.error(
            `verify-myfatoorah-payment: unauthorized_order payment_id=${payment_id}`,
          );
          return jsonError(
            req,
            "unauthorized_order",
            "You are not authorized for this order.",
            403,
          );
        }
      } else {
        const tokenError = await verifyGuestToken(
          order.payment_session_token_hash,
          payment_session_token,
        );
        if (tokenError) {
          console.error(
            `verify-myfatoorah-payment: invalid_guest_payment_token payment_id=${payment_id}`,
          );
          return jsonError(
            req,
            "invalid_guest_payment_token",
            tokenError ?? "Invalid payment session token.",
            403,
          );
        }
      }
    }


    // Provider unreachable -> pending_status_update.
    if (!details) {
      if (order && order.payment_status !== "paid") {
        await admin.from("orders").update({ payment_status: "pending_status_update" }).eq("id", order.id);
      }
      return jsonResponse(req, {
        success: false,
        order_id: order?.id ?? order_id ?? null,
        payment_status: "pending_status_update",
        message: "Payment status is still pending. We will update your order shortly.",
      });
    }

    if (!order) {
      console.error(
        `verify-myfatoorah-payment: order_not_found payment_id=${payment_id}`,
      );
      return jsonError(req, "order_not_found", "Order not found for this payment.", 404);
    }

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
    return jsonResponse(req, {
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
  } catch (error) {
    console.error(
      "verify-myfatoorah-payment: unhandled_error:",
      error instanceof Error ? error.message : String(error),
    );
    return jsonError(req, "unhandled_error", "Unexpected server error.", 500);
  }
});
