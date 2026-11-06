import { getAdminClient } from "../_shared/supabase-admin.ts";
import { createInboxHandler } from "./handler.ts";

const env = (name: string) => Deno.env.get(name) ?? "";

Deno.serve(createInboxHandler({
  admin: getAdminClient(),
  readConfig: () => ({ origin: env("CUREMED_EVOLUTION_URL"),
    apiKey: env("CUREMED_EVOLUTION_API_KEY"),
    webhookSecret: env("CUREMED_EVOLUTION_WEBHOOK_SECRET"),
    storagePublicUrl: env("SUPABASE_PUBLIC_URL") }),
}));
