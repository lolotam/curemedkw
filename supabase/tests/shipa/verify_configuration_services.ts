// The parent drives SDK calls against guarded local SQL. Only provider fetch is
// synthetic; key generation/encryption/storage/read/decryption are real.
import { assertEquals } from "jsr:@std/assert@1.0.19";
import { createShipaCredentialService } from "../../functions/_shared/shipa-credential-service.ts";
import { createShipaReadinessService } from "../../functions/_shared/shipa-readiness-service.ts";
import { createEnvironmentConfig } from "../../functions/_tests/shipa/shipa-settings-fixtures.ts";
import { createSyntheticKeyring } from "../../functions/_tests/shipa/shipa-credential-loader-fixtures.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const input = Deno.stdin.readable.getReader();
let buffered = "";
async function nextResponse(): Promise<unknown> {
  while (!buffered.includes("\n")) {
    const chunk = await input.read();
    if (chunk.done) throw new Error("SQL bridge closed before its response");
    buffered += decoder.decode(chunk.value, { stream: true });
  }
  const end = buffered.indexOf("\n");
  const line = buffered.slice(0, end);
  buffered = buffered.slice(end + 1);
  return JSON.parse(line);
}
async function emit(payload: unknown): Promise<void> {
  await Deno.stdout.write(encoder.encode(JSON.stringify(payload) + "\n"));
}
const client = {
  async rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
    await emit({ kind: "rpc", fn, args });
    return await nextResponse();
  },
};
const actor = { userId: "89000000-0000-4000-8000-000000000001" };
const { keyring, keyVersion } = await createSyntheticKeyring();
const credentials = createShipaCredentialService({
  client,
  keyring,
  currentKeyVersion: keyVersion,
});
const config = { ...createEnvironmentConfig(), serviceCode: "Next Day" };
const settings = {
  enabled: false,
  environment: "sandbox",
  dispatchMode: "manual_after_packing",
  sandbox: config,
  live: config,
};
const credential = "synthetic-provider-credential";
const saved = await credentials.save({
  actor,
  request: {
    expectedRevision: 0,
    settings,
    credential: { environment: "sandbox", mode: "replace", apiKey: credential },
  },
});
assertEquals(saved.settings.revision, 1);
assertEquals(saved.settings.sandbox.credential.present, true);
const before = await client.rpc("shipa_read_credential", {
  _integration_id: saved.integrationId,
  _environment: "sandbox",
});
await credentials.save({
  actor,
  request: {
    expectedRevision: 1,
    settings,
    credential: { environment: "sandbox", mode: "replace", apiKey: " " },
  },
});
const after = await client.rpc("shipa_read_credential", {
  _integration_id: saved.integrationId,
  _environment: "sandbox",
});
assertEquals(after, before);
let failing = false;
let fetches = 0;
const readiness = createShipaReadinessService({
  client,
  keyring,
  fetchImpl: (url, init) => {
    fetches += 1;
    const target = new URL(url);
    assertEquals(target.origin, "https://sandbox-api.shipadelivery.com");
    assertEquals(target.searchParams.get("apikey"), credential);
    assertEquals(init.method, "GET");
    if (failing) return Promise.resolve(new Response("{}", { status: 503 }));
    const body = target.pathname === "/v2/health" ? { status: "OK" } : {
      name: "Kuwait",
      isoAlpha3: "KWT",
      cities: [{ name: "Hawally", state: null }],
    };
    return Promise.resolve(Response.json(body));
  },
});
const verified = await readiness.diagnose({
  actor,
  request: { expectedRevision: 2, environment: "sandbox" },
});
assertEquals(verified.settingsRevision, 2);
assertEquals(verified.environments.sandbox.credentialsVerified, true);
assertEquals(verified.environments.sandbox.originCityMatched, true);
assertEquals(verified.environments.sandbox.serviceEntitlement, "unconfirmed");
assertEquals(verified.environments.live.credentialPresent, false);
assertEquals(verified.scheduler.current, false);
assertEquals(fetches, 2);
failing = true;
const failed = await readiness.diagnose({
  actor,
  request: { expectedRevision: 2, environment: "sandbox" },
});
assertEquals(failed.environments.sandbox.credentialsVerified, false);
assertEquals(failed.environments.sandbox.safeCode, "server_error");
assertEquals(fetches, 3);
await credentials.save({
  actor,
  request: {
    expectedRevision: 2,
    settings,
    credential: { environment: "sandbox", mode: "remove" },
  },
});
const removed = await readiness.read({ actor });
assertEquals(removed.settingsRevision, 3);
assertEquals(removed.environments.sandbox.credentialPresent, false);
assertEquals(removed.environments.sandbox.safeCode, "credential_missing");
await input.cancel();
await emit({
  kind: "complete",
  receipt:
    "Real credential/readiness services matched actual role-gated SQL; provider fetch was synthetic",
});
