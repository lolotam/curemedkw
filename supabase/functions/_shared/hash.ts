// Shared SHA-256 hex helper. Must produce the same output as the client-side
// Web Crypto implementation so guest payment session tokens hash identically.
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Authorizes a guest order payment action. Returns null when authorized,
 * or an error message string when the token is missing or invalid.
 * Only call this for orders where user_id IS NULL.
 */
export async function verifyGuestToken(
  storedHash: string | null | undefined,
  rawToken: string | null | undefined,
): Promise<string | null> {
  if (!storedHash) return "This order cannot be paid as a guest.";
  if (!rawToken) return "Missing payment session token.";
  const provided = await sha256Hex(rawToken);
  // Constant-time-ish comparison (lengths are fixed 64 hex chars).
  if (provided.length !== storedHash.length) return "Invalid payment session token.";
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ storedHash.charCodeAt(i);
  return diff === 0 ? null : "Invalid payment session token.";
}
