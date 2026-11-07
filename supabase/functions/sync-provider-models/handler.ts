import { z } from "npm:zod@3.25.76";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireShipaAdmin } from "../_shared/shipa-auth.ts";
import { createShipaRuntimeClient } from "../_shared/shipa-runtime.ts";
import { handleOptions, isAllowedOrigin, jsonError, jsonResponse } from "../_shared/cors.ts";

const requestSchema = z.object({ provider: z.enum(["openrouter", "openai", "google", "anthropic", "atlascloud"]) }).strict();
const catalogSchema = z.object({ models: z.array(z.object({
  id: z.string().min(1).max(500), name: z.string().min(1).max(2000), kind: z.enum(["chat", "image"]),
  context_length: z.number().nonnegative().nullable(),
  pricing: z.object({ prompt: z.union([z.string(), z.number()]).optional(), completion: z.union([z.string(), z.number()]).optional() }).nullable(),
})).min(1).max(20000) });

export function createModelSyncHandler(admin: SupabaseClient) {
  return async (request: Request) => {
    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin)) return jsonError(request, "forbidden", "Origin refused.", 403);
    const preflight = handleOptions(request);
    if (preflight) return preflight;
    if (request.method !== "POST") return jsonError(request, "method_not_allowed", "POST required.", 405);
    const authorization = await requireShipaAdmin(request, createShipaRuntimeClient(admin));
    if (!authorization.ok) return jsonError(request, authorization.code, "Administrator access required.", authorization.status);
    try {
      const parsed = requestSchema.safeParse(await request.json());
      if (!parsed.success) return jsonError(request, "invalid_request", "Unknown provider.", 400);
      const { provider } = parsed.data;
      // Reuse the existing provider adapters and their server-owned API keys.
      const { data, error } = await admin.functions.invoke(`${provider}-models`, { method: "GET", signal: AbortSignal.timeout(45_000) });
      const catalog = catalogSchema.safeParse(data);
      if (error || !catalog.success) return jsonError(request, "provider_unavailable", "Could not refresh this provider. Its saved catalog was retained.", 502);
      const models = [...new Map(catalog.data.models.map(model => [model.id, model])).values()];
      const syncedAt = new Date().toISOString();
      const { error: storageError } = await admin.from("site_settings").upsert({
        key: `ai_provider_models_${provider}`, value: { models, syncedAt },
      }, { onConflict: "key" });
      if (storageError) return jsonError(request, "storage_unavailable", "Could not save the provider catalog.", 503);
      return jsonResponse(request, { provider, count: models.length, syncedAt });
    } catch {
      return jsonError(request, "sync_unavailable", "Model synchronization could not complete.", 503);
    }
  };
}
