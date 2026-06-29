// Create a MyFatoorah Hosted Payment Page (v3) request for an order.
// Returns a PaymentURL the frontend redirects the customer to.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { corsHeaders, json } from "../_shared/cors.ts";
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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const { order_id, payment_method } = parsed.data;

    const admin = getAdminClient();

    // Resolve caller identity (optional — supports guest orders).
    let callerId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const anon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data } = await anon.auth.getClaims(authHeader.replace("Bearer ", ""));
      callerId = (data?.claims?.sub as string) ?? null;
    }

    // Load order.
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return json({ error: "Order not found" }, 404);

    // Ownership: logged-in user must own the order; guest orders must have no owner.
    if (order.user_id) {
      if (!callerId || callerId !== order.user_id) {
        return json({ error: "Not authorized for this order" }, 403);
      }
    }

    if (order.payment_status === "paid") {
      return json({ error: "Order is already paid" }, 409);
    }
    if (order.order_status === "cancelled") {
      return json({ error: "Order is cancelled" }, 409);
    }

    // Recompute amount server-side from order_items + discount (never trust client).
    const { data: items, error: itemsErr } = await admin
      .from("order_items")
      .select("quantity, unit_price")
      .eq("order_id", order_id);
    if (itemsErr) throw itemsErr;
    if (!items || items.length === 0) {
      return json({ error: "Order has no items" }, 400);
    }
    const subtotal = items.reduce(
      (s, i) => s + Number(i.unit_price) * Number(i.quantity),
      0,
    );
    const discount = Number(order.discount_amount ?? 0);
    const amount = Math.max(0, Math.round((subtotal - discount) * 1000) / 1000);
    if (amount <= 0) return json({ error: "Invalid order amount" }, 400);

    const config = getMyFatoorahConfig();
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

    const requestBody = {
      PaymentMethod: payment_method,
      Order: {
        Amount: Number(amount.toFixed(3)),
        Currency: currency,
        ExternalIdentifier: order.id,
      },
      Customer: {
        Name: order.customer_name || "Customer",
        Mobile: order.customer_phone || undefined,
        Email: order.customer_email || undefined,
      },
      IntegrationUrls: { Redirection: redirection },
      UserDefinedField: order.id,
    };

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
      return json({ success: false, error: message }, 502);
    }
  } catch (err) {
    console.error("create-myfatoorah-payment error:", (err as Error).message);
    return json({ error: "Failed to create payment" }, 500);
  }
});
