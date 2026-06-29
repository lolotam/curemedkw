// MyFatoorah webhook v2 signature verification (HMAC-SHA256, base64).
// Docs: PAYMENT_STATUS_CHANGED signs the exact ordered string:
//   Invoice.Id={},Invoice.Status={},Transaction.Status={},
//   Transaction.PaymentId={},Invoice.ExternalIdentifier={}
// Null/missing values become empty strings.

function val(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** Builds the ordered signature base string for a PAYMENT_STATUS_CHANGED event. */
export function buildPaymentStatusSignatureString(data: unknown): string {
  const d = (data ?? {}) as Record<string, any>;
  const invoice = d.Invoice ?? {};
  const transaction = d.Transaction ?? {};
  return [
    `Invoice.Id=${val(invoice.Id)}`,
    `Invoice.Status=${val(invoice.Status)}`,
    `Transaction.Status=${val(transaction.Status)}`,
    `Transaction.PaymentId=${val(transaction.PaymentId)}`,
    `Invoice.ExternalIdentifier=${val(invoice.ExternalIdentifier)}`,
  ].join(",");
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  let binary = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/**
 * Verifies the myfatoorah-signature header for a PAYMENT_STATUS_CHANGED event.
 * Returns false if the signature is missing, the secret is unset, or invalid.
 */
export async function verifyMyFatoorahSignature(
  eventData: unknown,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const base = buildPaymentStatusSignatureString(eventData);
  const expected = await hmacSha256Base64(secret, base);
  return timingSafeEqual(expected, signatureHeader.trim());
}
