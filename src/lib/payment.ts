// Frontend helper for MyFatoorah online payments. All sensitive work happens
// server-side in edge functions — this only invokes them and redirects.
import { supabase } from "@/integrations/supabase/clientRuntime";

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

/** SHA-256 hex digest — matches the edge function's sha256Hex implementation. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const guestTokenKey = (orderId: string) => `mf_guest_token:${orderId}`;

/** Persist the raw guest payment token locally (never in the URL). */
export function saveGuestToken(orderId: string, rawToken: string) {
  try {
    sessionStorage.setItem(guestTokenKey(orderId), rawToken);
  } catch { /* ignore */ }
}

export function getGuestToken(orderId: string): string | null {
  try {
    return sessionStorage.getItem(guestTokenKey(orderId));
  } catch {
    return null;
  }
}

export async function createMyFatoorahPayment(
  orderId: string,
  method: OnlinePaymentMethod,
  paymentSessionToken?: string | null,
): Promise<CreatePaymentResult> {
  const { data, error } = await supabase.functions.invoke("create-myfatoorah-payment", {
    body: {
      order_id: orderId,
      payment_method: method,
      ...(paymentSessionToken ? { payment_session_token: paymentSessionToken } : {}),
    },
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
  paymentSessionToken?: string | null,
): Promise<VerifyPaymentResult> {
  const { data, error } = await supabase.functions.invoke("verify-myfatoorah-payment", {
    body: {
      payment_id: paymentId,
      order_id: orderId ?? undefined,
      ...(paymentSessionToken ? { payment_session_token: paymentSessionToken } : {}),
    },
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
