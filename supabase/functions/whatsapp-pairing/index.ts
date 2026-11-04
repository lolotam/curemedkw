// Curemed — the WhatsApp pairing entrypoint.
//
// This file does three things and nothing else: it builds the service role
// client from the existing Supabase settings, it composes the pairing
// handler with the runtime names of the Curemed instance credential, and it
// registers the listener.
//
// What it deliberately does not do
// -------------------------------
//   * It does not read a master key, a legacy key or a Postora key. The
//     only two variables it reads are CUREMED_EVOLUTION_URL and
//     CUREMED_EVOLUTION_API_KEY, and the second one has to be the scoped
//     token of the Curemed instance.
//   * It does not read them at import time. The handler asks for the
//     configuration only after the caller is authorized and the request is
//     valid.
//   * It does not touch the router, the deployment manifest or the
//     Supabase configuration. Registering the endpoint here is not a
//     deployment.
//
// The client construction is the only work that happens at import time, and
// it is the existing service role client.

import { getAdminClient } from "../_shared/supabase-admin.ts";
import { createShipaRuntimeClient } from "../_shared/shipa-runtime.ts";
import { createEvolutionPairingHandler } from "./handler.ts";

const handler = createEvolutionPairingHandler({
  admin: createShipaRuntimeClient(getAdminClient()),
  // The runtime names of the Curemed instance configuration. The token is
  // the scoped instance token of the "curemed" instance; there is no
  // fallback to a global or master variable.
  readConfig: () => {
    const key = Deno.env.get("CUREMED_EVOLUTION_API_KEY") ?? "";
    return {
      origin: Deno.env.get("CUREMED_EVOLUTION_URL") ?? "",
      apiKey: key,
    };
  },
});

Deno.serve(handler);
