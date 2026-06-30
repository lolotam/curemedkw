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
  error_code?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  order_id: string | null;
  order_number?: string;
  payment_status: string;
  order_status?: string;
  message: string;
  error_code?: string;
}

type SupabaseFunctionsError = {
  name?: string;
  message?: string;
  context?: { json?: () => Promise<unknown> } | null;
};

function classifyFunctionsError(error: SupabaseFunctionsError): { code: string; message: string } {
  const msg = (error?.message ?? "").toLowerCase();
  // Network / CORS / relay-level failures: invoke never reached a JSON error body.
  const looksLikeNetwork =
    !!error &&
    (
      error.name === "FunctionsRelayError" ||
      error.name === "FunctionsHttpError" ||
      /failed to send a request|failed to fetch|networkerror|load failed|cors/i.test(msg)
    );
  if (looksLikeNetwork) {
    return {
      code: "payment_gateway_unreachable",
      message: "Payment gateway is unreachable. Admin: check the Supabase post-deploy manifest logs.",
    };
  }
  return { code: "payment_error", message: error?.message ?? "Payment failed." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function getFunctionsErrorDetails(
  error: SupabaseFunctionsError,
): Promise<{ code: string; message: string }> {
  try {
    const body = await error.context?.json?.();
    if (isRecord(body)) {
      const serverError = body.error;
      if (isRecord(serverError)) {
        const code = typeof serverError.code === "string" ? serverError.code : undefined;
        const message = typeof serverError.message === "string" ? serverError.message : undefined;
        if (code || message) {
          return {
            code: code ?? "payment_error",
            message: message ?? error.message ?? "Payment failed.",
          };
        }
      }
      if (typeof body.message === "string") return { code: "payment_error", message: body.message };
      if (typeof serverError === "string") return { code: "payment_error", message: serverError };
    }
  } catch { /* Fall through to local classification when the response body is unavailable. */ }
  return classifyFunctionsError(error);
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
    const classifiedError = await getFunctionsErrorDetails(error as SupabaseFunctionsError);
    return {
      success: false,
      order_id: orderId,
      error: classifiedError.message,
      error_code: classifiedError.code,
    };
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
    const classifiedError = await getFunctionsErrorDetails(error as SupabaseFunctionsError);
    return {
      success: false,
      order_id: orderId ?? null,
      payment_status: "pending_status_update",
      message: classifiedError.message,
      error_code: classifiedError.code,
    };
  }
  return data as VerifyPaymentResult;
}
