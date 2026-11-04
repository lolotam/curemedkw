// Shipa admin endpoint — the thin Edge entrypoint.
//
// This file does three things and nothing else: it builds the service-role
// client from the existing Supabase settings, it composes the admin handler
// with the runtime name of the master key, and it registers the listener.
//
// What it deliberately does not do
// -------------------------------
// * It does not read the master key. The key is read through the injected
//   callback, and that callback is consulted only when an action needs key
//   material — a safe read works in a deployment that has no master key.
// * It does not import a key, generate a key or cache key material.
// * It does not touch the router, the deployment manifest or the Supabase
//   configuration. Registering the endpoint here is not a deployment: the
//   routing and the deployment gating are separate, later work.
//
// The client construction is the only work that happens at import time, and
// it is the existing service-role client.

import { getAdminClient } from "../_shared/supabase-admin.ts";
import { createShipaAdminHandler } from "./handler.ts";
import { createShipaRuntimeClient } from "../_shared/shipa-runtime.ts";

const client = createShipaRuntimeClient(getAdminClient());

const handler = createShipaAdminHandler({
  client,
  // The runtime name of the V1 master key. The server owns it: the browser
  // never supplies it, and a request cannot select a key version.
  readEncryptionKey: () => Deno.env.get("INTEGRATIONS_ENCRYPTION_KEY_V1"),
});

Deno.serve(handler);
