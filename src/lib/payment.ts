// Frontend helper for MyFatoorah online payments. All sensitive work happens
// server-side in edge functions — this only invokes them and redirects.
import { supabase } from "@/integrations/supabase/client";

export type OnlinePaymentMethod =
  | "KNET"
  | "CARD"
  | "APPLE_PAY"
  | "GOOGLE_PAY";

export interface CreatePaymentResult {
  success: boolean;
  order_id: string;
  invoice_id?: string;
  payment_url?: string;
  payment_status?: string;
  error?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  order_id: string | null;
  order_number?: string;
  payment_status: string;
  order_status?: string;
  message: string;
}

export async function createMyFatoorahPayment(
  orderId: string,
  method: OnlinePaymentMethod,
): Promise<CreatePaymentResult> {
  const { data, error } = await supabase.functions.invoke("create-myfatoorah-payment", {
    body: { order_id: orderId, payment_method: method },
  });
  if (error) {
    // Try to surface the function's JSON error body.
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) message = typeof body.error === "string" ? body.error : message;
      }
    } catch { /* ignore */ }
    return { success: false, order_id: orderId, error: message };
  }
  return data as CreatePaymentResult;
}

export async function verifyMyFatoorahPayment(
  paymentId: string,
  orderId?: string | null,
): Promise<VerifyPaymentResult> {
  const { data, error } = await supabase.functions.invoke("verify-myfatoorah-payment", {
    body: { payment_id: paymentId, order_id: orderId ?? undefined },
  });
  if (error) {
    return {
      success: false,
      order_id: orderId ?? null,
      payment_status: "pending_status_update",
      message: error.message,
    };
  }
  return data as VerifyPaymentResult;
}
