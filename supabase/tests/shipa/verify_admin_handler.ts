// Real handler/SDK/services/native crypto against guarded actual SQL. Auth's
// remote session response and Shipa GET transport are synthetic, not live proof.
import { assertEquals } from "jsr:@std/assert@1.0.19";
import { createClient } from "npm:@supabase/supabase-js@2.105.1";
import { createShipaRuntimeClient } from "../../functions/_shared/shipa-runtime.ts";
import { createShipaAdminHandler } from "../../functions/shipa-admin/handler.ts";
import { createEnvironmentConfig } from "../../functions/_tests/shipa/shipa-settings-fixtures.ts";
import { createSyntheticMasterKey } from "../../functions/_tests/shipa/shipa-admin-fixtures.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const input = Deno.stdin.readable.getReader();
let buffered = "";
async function bridge(
  request: unknown,
): Promise<{ data: unknown; error: unknown; status: number }> {
  await Deno.stdout.write(encoder.encode(JSON.stringify(request) + "\n"));
  while (!buffered.includes("\n")) {
    const chunk = await input.read();
    if (chunk.done) throw new Error("SQL bridge ended early");
    buffered += decoder.decode(chunk.value, { stream: true });
  }
  const end = buffered.indexOf("\n");
  const response = JSON.parse(buffered.slice(0, end));
  buffered = buffered.slice(end + 1);
  return response;
}
const actor = "89000000-0000-4000-8000-000000000001";
const access = "synthetic-session";
const sdk = createClient("https://guarded-sql.test", "synthetic-sdk-key", {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: async (value, init) => {
      const request = new Request(value, init);
      const url = new URL(request.url);
      assertEquals(url.origin, "https://guarded-sql.test");
      if (url.pathname === "/auth/v1/user") {
        assertEquals(request.headers.get("authorization"), `Bearer ${access}`);
        return Response.json({
          id: actor,
          email: "bridge@example.test",
          app_metadata: {},
          user_metadata: {},
        });
      }
      let response;
      if (url.pathname === "/rest/v1/user_roles") {
        assertEquals(url.searchParams.get("select"), "role");
        assertEquals(url.searchParams.get("user_id"), `eq.${actor}`);
        assertEquals(url.searchParams.get("role"), "eq.admin");
        response = await bridge({ kind: "role", actor });
      } else {
        assertEquals(url.pathname.startsWith("/rest/v1/rpc/shipa_"), true);
        response = await bridge({
          kind: "rpc",
          fn: url.pathname.split("/").at(-1),
          args: await request.json(),
        });
      }
      return Response.json(response.error ?? response.data, {
        status: response.status,
      });
    },
  },
});
const master = await createSyntheticMasterKey();
let keyReads = 0;
let providerReads = 0;
let failedProbe = false;
const credential = "synthetic-provider-credential";
const handler = createShipaAdminHandler({
  client: createShipaRuntimeClient(sdk),
  readEncryptionKey: () => {
    keyReads += 1;
    return master.encoded;
  },
  fetchImpl: (target, init) => {
    providerReads += 1;
    const url = new URL(target);
    assertEquals(url.origin, "https://sandbox-api.shipadelivery.com");
    assertEquals(url.searchParams.get("apikey"), credential);
    assertEquals(init.method, "GET");
    if (failedProbe) return Promise.resolve(Response.json({}, { status: 503 }));
    assertEquals(
      ["/v2/health", "/v2/countries/KWT"].includes(url.pathname),
      true,
    );
    return Promise.resolve(
      Response.json(
        url.pathname === "/v2/health" ? { status: "OK" } : {
          name: "Kuwait",
          isoAlpha3: "KWT",
          cities: [{ name: "Hawally", state: null }],
        },
      ),
    );
  },
});
async function action(payload: unknown, status = 200) {
  const response = await handler(
    new Request("https://admin.test/shipa-admin", {
      method: "POST",
      headers: { authorization: `Bearer ${access}` },
      body: JSON.stringify(payload),
    }),
  );
  assertEquals(response.status, status);
  const raw = await response.text();
  assertEquals(raw.includes(credential), false);
  assertEquals(raw.includes(master.encoded), false);
  assertEquals(raw.includes('"ciphertext"'), false);
  assertEquals(raw.includes('"nonce"'), false);
  return JSON.parse(raw);
}
const initial = await action({ action: "settings.read" });
assertEquals(initial.data.settings.revision, 0);
assertEquals(keyReads, 0);
const forged = await action({
  action: "settings.read",
  actor: { userId: actor },
}, 400);
assertEquals(forged.error.code, "invalid_request");
assertEquals(keyReads, 0);
const config = { ...createEnvironmentConfig(), serviceCode: "Next Day" };
const settings = {
  enabled: false,
  environment: "sandbox",
  dispatchMode: "manual_after_packing",
  sandbox: config,
  live: config,
};
const saved = await action({
  action: "credential.save",
  request: {
    expectedRevision: 0,
    settings,
    credential: { environment: "sandbox", mode: "replace", apiKey: credential },
  },
});
assertEquals(saved.data.settings.revision, 1);
assertEquals(saved.data.settings.sandbox.credential.present, true);
await action({
  action: "credential.save",
  request: {
    expectedRevision: 1,
    settings,
    credential: { environment: "sandbox", mode: "replace", apiKey: " " },
  },
});
const verified = await action({
  action: "readiness.diagnose",
  request: { expectedRevision: 2, environment: "sandbox" },
});
assertEquals(verified.data.environments.sandbox.credentialsVerified, true);
assertEquals(
  verified.data.environments.sandbox.serviceEntitlement,
  "unconfirmed",
);
assertEquals(verified.data.scheduler.current, false);
assertEquals(providerReads, 2);
failedProbe = true;
const failed = await action({
  action: "readiness.diagnose",
  request: { expectedRevision: 2, environment: "sandbox" },
});
assertEquals(failed.data.environments.sandbox.credentialsVerified, false);
assertEquals(providerReads, 3);
await action({
  action: "credential.save",
  request: {
    expectedRevision: 2,
    settings,
    credential: { environment: "sandbox", mode: "remove" },
  },
});
const removed = await action({ action: "readiness.read" });
assertEquals(removed.data.settingsRevision, 3);
assertEquals(removed.data.environments.sandbox.credentialPresent, false);
const readsBeforeSave = keyReads;
const ordinary = await action({
  action: "settings.save",
  request: { expectedRevision: 3, settings },
});
assertEquals(ordinary.data.settings.revision, 4);
assertEquals(keyReads, readsBeforeSave);
await input.cancel();
await Deno.stdout.write(
  encoder.encode(
    JSON.stringify({
      kind: "complete",
      receipt:
        "Real handler/SDK/role SQL/crypto/configuration passed; session and provider transport synthetic",
    }) + "\n",
  ),
);
