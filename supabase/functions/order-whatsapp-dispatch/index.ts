import { getAdminClient } from "../_shared/supabase-admin.ts";
import { createEvolutionInboxClient } from "../_shared/evolution-inbox.ts";
import { createOrderWhatsAppDispatchHandler } from "./handler.ts";

const admin = getAdminClient();
const env = (name: string) => Deno.env.get(name) ?? "";

Deno.serve(createOrderWhatsAppDispatchHandler({
  rpc: (name, args) => Promise.resolve(admin.rpc(name, args)),
  provider: () => createEvolutionInboxClient({ origin: env("CUREMED_EVOLUTION_URL"), apiKey: env("CUREMED_EVOLUTION_API_KEY") }),
  schedulerToken: env("ORDER_WHATSAPP_DISPATCH_TOKEN"),
}));
