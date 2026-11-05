import { getAdminClient } from "../_shared/supabase-admin.ts";
import { ingestInboxEvent } from "../whatsapp-inbox/webhook.ts";
import { createEvolutionPairingWebhookHandler } from "./handler.ts";

Deno.serve(createEvolutionPairingWebhookHandler({
  readSecret: () => Deno.env.get("CUREMED_EVOLUTION_WEBHOOK_SECRET"),
  ingest: (event, payload) => ingestInboxEvent(getAdminClient(), event, payload),
}));
