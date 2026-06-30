import { handleOptions, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";

const HEALTH_ENV_KEYS = [
  "MYFATOORAH_TOKEN",
  "MYFATOORAH_BASE_URL",
  "APP_PUBLIC_URL",
] as const;

async function isDatabaseReachable(): Promise<boolean> {
  try {
    const admin = getAdminClient();
    const { error } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .limit(0);
    return !error;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return jsonError(req, "method_not_allowed", "Method not allowed.", 405, {});
    }

    const env = Object.fromEntries(
      HEALTH_ENV_KEYS.map((key) => [key, Boolean(Deno.env.get(key)?.trim())]),
    );

    return jsonResponse(req, {
      success: true,
      functions: {
        cors: true,
        env,
        database: await isDatabaseReachable(),
      },
    }, 200);
  } catch {
    return jsonError(req, "health_error", "Health check failed", 500, {});
  }
});
