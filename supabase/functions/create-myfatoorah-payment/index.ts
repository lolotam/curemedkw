// Create a MyFatoorah Hosted Payment Page (v3) request for an order.
// Returns a PaymentURL the frontend redirects the customer to.
import { z } from "npm:zod@3";
import { corsHeaders, json, jsonError } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import {
  getMyFatoorahConfig,
  myfatoorahRequest,
  MyFatoorahError,
} from "../_shared/myfatoorah.ts";
import { verifyGuestToken } from "../_shared/hash.ts";

const BodySchema = z.object({
  order_id: z.string().uuid(),
  payment_method: z
    .enum(["KNET", "CARD", "APPLE_PAY", "GOOGLE_PAY"])
    .default("CARD"),
  payment_session_token: z.string().min(8).max(200).optional(),
});

interface CreatePaymentData {
  InvoiceId: string;
  PaymentId: string | null;
  PaymentURL: string;
  PaymentCompleted: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    console.error("create-myfatoorah-payment: method_not_allowed");
    return jsonError("method_not_allowed", "Method not allowed.", 405);
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      console.error("create-myfatoorah-payment: invalid_request_body");
      return jsonError("invalid_request_body", "Invalid request body.", 400);
    }
    const { order_id, payment_method, payment_session_token } = parsed.data;

    const admin = getAdminClient();

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

    // Load order.
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) {
      console.error(`create-myfatoorah-payment: order_not_found order=${order_id}`);
      return jsonError("order_not_found", "Order not found.", 404);
    }

    // Ownership: logged-in user must own the order; guest orders require a valid token.
    if (order.user_id) {
      if (!callerId || callerId !== order.user_id) {
        console.error(`create-myfatoorah-payment: unauthorized_order order=${order_id}`);
        return jsonError(
          "unauthorized_order",
          "You are not authorized to pay for this order.",
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
          `create-myfatoorah-payment: invalid_guest_payment_token order=${order_id}`,
        );
        return jsonError(
          "invalid_guest_payment_token",
          tokenError ?? "Invalid payment session token.",
          403,
        );
      }
    }

    if (order.payment_status === "paid") {
      return jsonError("order_already_paid", "This order has already been paid.", 409);
    }
    if (order.order_status === "cancelled") {
      return jsonError("order_cancelled", "This order has been cancelled.", 409);
    }

    // Recompute amount server-side from order_items + discount (never trust client).
    const { data: items, error: itemsErr } = await admin
      .from("order_items")
      .select("quantity, unit_price")
      .eq("order_id", order_id);
    if (itemsErr) throw itemsErr;
    if (!items || items.length === 0) {
      console.error(`create-myfatoorah-payment: order_has_no_items order=${order_id}`);
      return jsonError("order_has_no_items", "Order has no items.", 400);
    }
    const subtotal = items.reduce(
      (s, i) => s + Number(i.unit_price) * Number(i.quantity),
      0,
    );
    const discount = Number(order.discount_amount ?? 0);
    // Include any future delivery/tax columns when present so the charge always
    // equals the stored order total.
    const deliveryFee = Number((order as Record<string, unknown>).delivery_fee ?? 0);
    const tax = Number((order as Record<string, unknown>).tax_amount ?? 0);
    const computed = Math.max(
      0,
      Math.round((subtotal + deliveryFee + tax - discount) * 1000) / 1000,
    );
    const storedTotal = Math.round(Number(order.total ?? 0) * 1000) / 1000;

    // Source of truth is the stored order total; recomputed amount must match it.
    if (Math.abs(computed - storedTotal) > 0.001) {
      console.error(
        `create-myfatoorah-payment: amount_mismatch order=${order_id} computed=${computed} stored=${storedTotal}`,
      );
      return jsonError("amount_mismatch", "Order amount could not be verified.", 400);
    }
    const amount = storedTotal;
    if (amount <= 0) {
      console.error(
        `create-myfatoorah-payment: invalid_amount order=${order_id} amount=${amount}`,
      );
      return jsonError("invalid_amount", "Invalid order amount.", 400);
    }

    let config;
    try {
      config = getMyFatoorahConfig();
    } catch {
      console.error(
        "create-myfatoorah-payment: missing_secret — MYFATOORAH_TOKEN not set",
      );
      return jsonError("missing_secret", "Payment provider is not configured.", 500);
    }
    const currency = config.currency;
    const idempotencyKey =
      `myfatoorah:create:${order_id}:${payment_method}:${amount.toFixed(3)}`;

    // Reuse an existing successful attempt for the same key (idempotency).
    const { data: existing } = await admin
      .from("payment_attempts")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing && existing.status === "created" && existing.payment_url) {
      return json({
        success: true,
        order_id,
        invoice_id: existing.invoice_id,
        payment_url: existing.payment_url,
        payment_status: "pending_payment",
      });
    }

    const redirection = config.appPublicUrl
      ? `${config.appPublicUrl}/payment/callback?order_id=${order_id}`
      : `${new URL(req.url).origin}/payment/callback?order_id=${order_id}`;

    const customer: Record<string, string> = {};
    if (order.customer_name) customer.Name = order.customer_name;
    if (order.customer_email) customer.Email = order.customer_email;
    const mobile = String(order.customer_phone ?? "").replace(/[\s-]/g, "");
    if (/^\+?\d{8,15}$/.test(mobile)) customer.Mobile = mobile;

    const requestBody: Record<string, unknown> = {
      PaymentMethod: payment_method,
      Order: {
        Amount: Number(amount.toFixed(3)),
        Currency: currency,
        ExternalIdentifier: order.id,
      },
      IntegrationUrls: { Redirection: redirection },
      UserDefinedField: order.id,
    };
    if (Object.keys(customer).length > 0) requestBody.Customer = customer;

    // Insert attempt row (status created) before calling provider.
    const { data: attempt, error: attemptErr } = await admin
      .from("payment_attempts")
      .upsert(
        {
          order_id,
          provider: "myfatoorah",
          payment_method,
          amount,
          currency,
          idempotency_key: idempotencyKey,
          status: "created",
          request_payload: requestBody,
        },
        { onConflict: "idempotency_key" },
      )
      .select("id")
      .single();
    if (attemptErr) throw attemptErr;

    try {
      const result = await myfatoorahRequest<CreatePaymentData>(config, "/v3/payments", {
        method: "POST",
        body: requestBody,
        idempotencyKey,
      });
      const d = result.Data;

      await admin
        .from("payment_attempts")
        .update({
          invoice_id: d.InvoiceId,
          payment_id: d.PaymentId,
          payment_url: d.PaymentURL,
          response_payload: result as unknown as Record<string, unknown>,
          status: "created",
        })
        .eq("id", attempt.id);

      await admin
        .from("orders")
        .update({
          payment_provider: "myfatoorah",
          payment_online_method: payment_method,
          payment_status: "pending_payment",
          payment_amount: amount,
          payment_currency: currency,
          myfatoorah_invoice_id: d.InvoiceId,
          myfatoorah_payment_id: d.PaymentId,
          myfatoorah_payment_url: d.PaymentURL,
        })
        .eq("id", order_id);

      return json({
        success: true,
        order_id,
        invoice_id: d.InvoiceId,
        payment_url: d.PaymentURL,
        payment_status: "pending_payment",
      });
    } catch (err) {
      const message = err instanceof MyFatoorahError ? err.message : (err as Error).message;
      await admin
        .from("payment_attempts")
        .update({ status: "failed", error_message: message })
        .eq("id", attempt.id);
      console.error(
        `create-myfatoorah-payment: myfatoorah_api_error order=${order_id} msg=${message}`,
      );
      return jsonError("myfatoorah_api_error", message, 502);
    }
  } catch (err) {
    console.error("create-myfatoorah-payment: internal_error:", (err as Error).message);
    return jsonError("internal_error", "Failed to create payment.", 500);
  }
});
