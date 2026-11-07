import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { secretsMatch } from "./caller-auth.ts";
import { getAdminClient } from "./supabase-admin.ts";
import { requireShipaAdmin } from "./shipa-auth.ts";
import { createShipaRuntimeClient } from "./shipa-runtime.ts";
import { isAllowedOrigin, jsonError } from "./cors.ts";

interface CatalogAuthOptions {
  getAdmin: () => SupabaseClient;
  readServiceKey: () => string;
}

// Self-hosted deployment copies function code without applying verify_jwt.
// Each adapter therefore verifies its caller before invoking the provider.
export function withModelCatalogAuth(
  handler: (request: Request) => Promise<Response>,
  options: CatalogAuthOptions = { getAdmin: getAdminClient,
    readServiceKey: () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" },
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin)) return jsonError(request, "forbidden", "Origin refused.", 403);
    if (request.method === "OPTIONS") return handler(request);
    if (request.method !== "GET") return jsonError(request, "method_not_allowed", "GET required.", 405);
    const token = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return jsonError(request, "unauthenticated", "Authentication required.", 401);
    try {
      if (!secretsMatch(token, options.readServiceKey())) {
        const authorization = await requireShipaAdmin(request, createShipaRuntimeClient(options.getAdmin()));
        if (!authorization.ok) return jsonError(request, authorization.code, "Administrator access required.", authorization.status);
      }
    } catch {
      return jsonError(request, "unavailable", "Authorization unavailable.", 503);
    }
    const response = await handler(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
}
