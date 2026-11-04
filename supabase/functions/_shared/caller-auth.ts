// Caller authorization for the outbound-messaging functions.
//
// send-whatsapp and send-order-email both run with verify_jwt = false, because
// the payment path invokes them server-side without a user session. That makes
// them reachable by anyone unless they authorize callers themselves: otherwise
// a stranger can send WhatsApp messages billed to the connected WhatsApp
// Business account, or render a real order to an address of their choosing.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

function bearerToken(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

/** Constant-time comparison; mirrors the idiom in _shared/hash.ts. */
export function secretsMatch(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the bearer token belongs to a signed-in user holding the admin role. */
export async function isAdminCaller(req: Request, admin: SupabaseClient): Promise<boolean> {
  const token = bearerToken(req);
  if (!token) return false;
  const { data: userRes, error } = await admin.auth.getUser(token);
  if (error || !userRes?.user) return false;
  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "admin")
    .maybeSingle();
  return !!role;
}

/**
 * True for the only two callers allowed to trigger an outbound message:
 * server-side dispatch presenting the service-role key, and an admin acting
 * from the dashboard. The anon key deliberately does not qualify — it ships in
 * the browser bundle, so accepting it would authorize the whole internet.
 */
export async function isTrustedSender(req: Request, admin: SupabaseClient): Promise<boolean> {
  if (secretsMatch(bearerToken(req), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return true;
  }
  return await isAdminCaller(req, admin);
}
