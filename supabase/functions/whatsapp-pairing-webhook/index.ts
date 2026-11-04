// Curemed — the WhatsApp pairing webhook entrypoint.
//
// This file does three things and nothing else: it composes the
// connection only webhook handler with the runtime name of the
// independent webhook secret, and it registers the listener.
//
// What it deliberately does not do
// -------------------------------
//   * It does not read the instance token, the master key or a Postora key.
//     The webhook authenticates with its own independent secret.
//   * It does not read the secret at import time. The handler asks for it
//     when a request arrives, and an empty secret fails closed.
//   * It does not build a database client. The endpoint writes nothing, so
//     it has no write path at all.
//
// Registering the endpoint here is not an activation: enabling a webhook
// on the provider is a separate, reviewed operation.

import { createEvolutionPairingWebhookHandler } from "./handler.ts";

const handler = createEvolutionPairingWebhookHandler({
  // The independent secret of the Curemed webhook header.
  readSecret: () => Deno.env.get("CUREMED_EVOLUTION_WEBHOOK_SECRET") ?? "",
});

Deno.serve(handler);
