// Behavioural tests for the Shipa admin configuration endpoint.
//
// The real authorization helper, the real strict parsers, the real settings
// store, the real credential service, the real readiness service, the real
// Web Crypto primitives and the real fixed-origin adapter run here. The only
// substitutes are the Supabase SDK boundary and the fetch boundary, which are
// faked.
//
// No secret, key, account or personal data is used: every value is a made-up
// placeholder, and the synthetic master key is generated freshly for every
// test.
//
// No listener is started and `index.ts` is never imported: the handler is
// called directly.

import { assert, assertEquals } from "jsr:@std/assert@1.0.19";

import {
  mapShipaAdminFailure,
  SHIPA_ADMIN_ERROR_MESSAGES,
} from "../_shared/shipa-admin-actions.ts";
import { decryptIntegrationCredential } from "../_shared/integration-credentials.ts";
import type { ShipaFetch } from "../_shared/shipa-client.ts";
import { createShipaAdminHandler } from "./handler.ts";
import {
  createFakeEncryptionKeyReader,
  createFakeShipaAdminClient,
  createSyntheticMasterKey,
  type FakeEncryptionKeyReader,
  type FakeShipaAdminClient,
  findRpcCall,
  queueAdminSession,
} from "../_tests/shipa/shipa-admin-fixtures.ts";
import {
  ADMIN_ENDPOINT_URL,
  createAdminRequest,
  createOversizeBody,
} from "../_tests/shipa/shipa-admin-requests.ts";
import {
  createCredentialSaveRequest,
  FAKE_SDK_ENVELOPE,
} from "../_tests/shipa/shipa-configuration-service-fixtures.ts";
import { createStoredCredentialDocument } from "../_tests/shipa/shipa-credential-loader-fixtures.ts";
import {
  createFakeFetch,
  SANDBOX_ORIGIN,
} from "../_tests/shipa/shipa-fixtures.ts";
import {
  countryResponse,
  createObservationAcknowledgement,
  createReadinessDocument,
  healthResponse,
} from "../_tests/shipa/shipa-readiness-service-fixtures.ts";
import {
  createSaveRequest,
  createSettingsBlock,
  createSettingsDocument,
  createSqlError,
  SHIPA_TEST_ACTOR_ID,
  SHIPA_TEST_INTEGRATION_ID,
} from "../_tests/shipa/shipa-settings-fixtures.ts";
import { SHIPA_TEST_OTHER_USER_ID } from "../_tests/shipa/shipa-auth-fixtures.ts";

/** The verified administrator of the synthetic session. */
const ADMIN_ID = SHIPA_TEST_ACTOR_ID;

/** A second made-up user id, used as a body claim that must be ignored. */
const OTHER_ID = SHIPA_TEST_OTHER_USER_ID;

/** The revision the synthetic stored settings carry. */
const STORED_REVISION = 4;

/** A synthetic replacement credential. It is not a real provider key. */
const FAKE_KEY = "synthetic-replacement-key-not-real";

interface AdminErrorBody {
  readonly success: false;
  readonly error: { readonly code: string; readonly message: string };
}

interface AdminSuccessBody {
  readonly success: true;
  readonly data: Record<string, unknown>;
}

function createHandler(
  client: FakeShipaAdminClient,
  keyReader: FakeEncryptionKeyReader,
  fetchImpl?: ShipaFetch,
) {
  return createShipaAdminHandler({
    client,
    readEncryptionKey: keyReader.read,
    fetchImpl,
  });
}

async function readErrorBody(response: Response): Promise<AdminErrorBody> {
  return (await response.json()) as AdminErrorBody;
}

async function readSuccessBody(response: Response): Promise<AdminSuccessBody> {
  return (await response.json()) as AdminSuccessBody;
}

/** Proves that a raw response carried none of the given secret values. */
function assertNoSecret(raw: string, secrets: readonly string[]): void {
  for (const secret of secrets) {
    assert(!raw.includes(secret), "the response carried secret material");
  }
}

// ---------------------------------------------------------------------------
// The request gate
// ---------------------------------------------------------------------------

Deno.test("answers the preflight without authentication, database or key access", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  const handler = createHandler(client, keyReader);

  const response = await handler(
    new Request(ADMIN_ENDPOINT_URL, { method: "OPTIONS" }),
  );

  assertEquals(response.status, 204);
  assertEquals(client.authCalls.length, 0);
  assertEquals(client.roleQueries.length, 0);
  assertEquals(client.rpcCalls.length, 0);
  assertEquals(keyReader.callCount(), 0);
});

Deno.test("refuses a non-POST request without any effect", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest(undefined, { method: "GET" }),
  );

  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "POST, OPTIONS");
  const body = await readErrorBody(response);
  assertEquals(body.success, false);
  assertEquals(body.error.code, "method_not_allowed");
  assertEquals(client.authCalls.length, 0);
  assertEquals(client.rpcCalls.length, 0);
  assertEquals(keyReader.callCount(), 0);
});

Deno.test("refuses a request without a session before any other work", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest({ action: "settings.read" }, { token: null }),
  );

  assertEquals(response.status, 401);
  const body = await readErrorBody(response);
  assertEquals(body.error.code, "unauthenticated");
  assertEquals(client.authCalls.length, 0);
  assertEquals(client.rpcCalls.length, 0);
  assertEquals(keyReader.callCount(), 0);
});

Deno.test("refuses a resolved session error", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  client.queueUser({ error: { message: "invalid refresh token" } });
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest({ action: "settings.read" }),
  );

  assertEquals(response.status, 401);
  const body = await readErrorBody(response);
  assertEquals(body.error.code, "unauthenticated");
  assertEquals(client.authCalls.length, 1);
  assertEquals(client.rpcCalls.length, 0);
  assertEquals(keyReader.callCount(), 0);
});

Deno.test("refuses a signed-in caller that holds no admin row", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  client.queueUser({ user: { id: ADMIN_ID } });
  client.queueRole({ data: null });
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest({ action: "settings.read" }),
  );

  assertEquals(response.status, 403);
  const body = await readErrorBody(response);
  assertEquals(body.error.code, "forbidden");
  // The role lookup really happened, and it asked for the verified id.
  assertEquals(client.roleQueries.length, 1);
  assertEquals(client.roleQueries[0].table, "user_roles");
  assertEquals(
    client.roleQueries[0].filters.map((filter) => filter.column),
    ["user_id", "role"],
  );
  assertEquals(client.roleQueries[0].filters[0].value, ADMIN_ID);
  assertEquals(client.roleQueries[0].filters[1].value, "admin");
  assertEquals(client.rpcCalls.length, 0);
  assertEquals(keyReader.callCount(), 0);
});

Deno.test("reports an unavailable authorization service as 503", async () => {
  const sessionFailure = createFakeShipaAdminClient();
  sessionFailure.queueUser({ rejection: new Error("auth transport down") });
  const sessionHandler = createHandler(
    sessionFailure,
    createFakeEncryptionKeyReader(),
  );

  const sessionResponse = await sessionHandler(
    createAdminRequest({ action: "settings.read" }),
  );
  assertEquals(sessionResponse.status, 503);
  assertEquals(
    (await readErrorBody(sessionResponse)).error.code,
    "unavailable",
  );

  const roleFailure = createFakeShipaAdminClient();
  roleFailure.queueUser({ user: { id: ADMIN_ID } });
  roleFailure.queueRole({ rejection: new Error("role transport down") });
  const roleHandler = createHandler(
    roleFailure,
    createFakeEncryptionKeyReader(),
  );

  const roleResponse = await roleHandler(
    createAdminRequest({ action: "settings.read" }),
  );
  assertEquals(roleResponse.status, 503);
  assertEquals((await readErrorBody(roleResponse)).error.code, "unavailable");
  assertEquals(roleFailure.rpcCalls.length, 0);
});

// ---------------------------------------------------------------------------
// The safe reads
// ---------------------------------------------------------------------------

Deno.test("reads the safe settings without any master key", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest({ action: "settings.read" }),
  );

  assertEquals(response.status, 200);
  const body = await readSuccessBody(response);
  assertEquals(body.success, true);
  assertEquals(body.data["integrationId"], SHIPA_TEST_INTEGRATION_ID);
  const settings = body.data["settings"] as Record<string, unknown>;
  assertEquals(settings["revision"], STORED_REVISION);
  assertEquals(client.calledFunctions(), ["shipa_read_settings"]);
  assertEquals(keyReader.callCount(), 0);
});

Deno.test("reads the readiness projection without any master key", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  client.respond("shipa_read_readiness", {
    data: createReadinessDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest({ action: "readiness.read" }),
  );

  assertEquals(response.status, 200);
  const body = await readSuccessBody(response);
  assertEquals(body.data["settingsRevision"], 4);
  assertEquals(client.calledFunctions(), ["shipa_read_readiness"]);
  assertEquals(keyReader.callCount(), 0);
});

// ---------------------------------------------------------------------------
// The writes
// ---------------------------------------------------------------------------

Deno.test("saves the settings as the verified session administrator", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  client.respond("shipa_save_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION + 1 }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  const handler = createHandler(client, keyReader);
  const request = createSaveRequest();

  const response = await handler(
    createAdminRequest({ action: "settings.save", request }),
  );

  assertEquals(response.status, 200);
  const call = findRpcCall(client, "shipa_save_settings");
  assertEquals(call.args["_actor_id"], ADMIN_ID);
  assertEquals(call.args["_expected_revision"], STORED_REVISION);
  assertEquals(call.args["_settings"], request["settings"]);
  // An ordinary save preserves the stored credential.
  assertEquals(call.args["_credential_change"], null);
  assertEquals(keyReader.callCount(), 0);
});

Deno.test("encrypts a replaced credential under the server integration id", async () => {
  const master = await createSyntheticMasterKey();
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader(master.encoded);
  queueAdminSession(client, ADMIN_ID);
  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_save_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION + 1 }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  const handler = createHandler(client, keyReader);
  const request = createCredentialSaveRequest({
    expectedRevision: STORED_REVISION,
    credential: {
      environment: "sandbox",
      mode: "replace",
      apiKey: FAKE_KEY,
    },
  });

  const response = await handler(
    createAdminRequest({ action: "credential.save", request }),
  );

  assertEquals(response.status, 200);
  const call = findRpcCall(client, "shipa_save_settings");
  assertEquals(call.args["_actor_id"], ADMIN_ID);
  assertEquals(call.args["_settings"], request["settings"]);

  const change = call.args["_credential_change"] as Record<string, unknown>;
  assertEquals(change["mode"], "replace");
  assertEquals(change["environment"], "sandbox");
  const envelope = change["envelope"] as Record<string, unknown>;
  assertEquals(envelope["integration_id"], SHIPA_TEST_INTEGRATION_ID);
  assertEquals(envelope["key_version"], master.keyVersion);

  // The envelope really is the caller's key, bound to the server's own row.
  const plaintext = await decryptIntegrationCredential(
    envelope,
    {
      integrationId: SHIPA_TEST_INTEGRATION_ID,
      provider: "shipa",
      environment: "sandbox",
      keyVersion: master.keyVersion,
    },
    master.keyring,
  );
  assertEquals(plaintext, FAKE_KEY);

  const raw = await response.text();
  assertNoSecret(raw, [
    FAKE_KEY,
    String(envelope["ciphertext"]),
    String(envelope["nonce"]),
  ]);
});

// ---------------------------------------------------------------------------
// The request contract
// ---------------------------------------------------------------------------

Deno.test("refuses a tainted or unknown body before any database or key work", async () => {
  const taintedBodies: readonly unknown[] = [
    // A body that claims an actor.
    { action: "settings.read", actor: { userId: OTHER_ID } },
    // A body that carries a proof or an endpoint.
    { action: "settings.read", proof: "signed-by-the-admin" },
    {
      action: "readiness.read",
      endpoint: "https://sandbox-api.shipadelivery.com",
    },
    // A write action without its request.
    { action: "settings.save" },
    { action: "credential.save" },
    // An action the endpoint does not have.
    { action: "shipment.create" },
    { action: "settings.read.create" },
    // A nested actor, proof or endpoint inside a request.
    {
      action: "settings.save",
      request: { ...createSaveRequest(), actor: { userId: OTHER_ID } },
    },
    {
      action: "credential.save",
      request: { ...createCredentialSaveRequest(), proof: "signed" },
    },
    {
      action: "readiness.diagnose",
      request: {
        expectedRevision: 4,
        environment: "sandbox",
        endpoint: "https://x",
      },
    },
    // A credential-like field inside the settings.
    {
      action: "settings.save",
      request: {
        expectedRevision: 4,
        settings: {
          ...(createSaveRequest()["settings"] as Record<string, unknown>),
          apiKey: FAKE_KEY,
        },
      },
    },
  ];

  for (const body of taintedBodies) {
    const client = createFakeShipaAdminClient();
    const keyReader = createFakeEncryptionKeyReader();
    queueAdminSession(client, ADMIN_ID);
    const handler = createHandler(client, keyReader);

    const response = await handler(createAdminRequest(body));

    assertEquals(response.status, 400);
    const errorBody = await readErrorBody(response);
    assertEquals(errorBody.error.code, "invalid_request");
    assertEquals(client.rpcCalls.length, 0);
    assertEquals(keyReader.callCount(), 0);
  }
});

Deno.test("refuses a body that is not JSON", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest(undefined, { rawBody: "{ this is not json" }),
  );

  assertEquals(response.status, 400);
  const raw = await response.text();
  const body = JSON.parse(raw) as AdminErrorBody;
  assertEquals(body.error.code, "invalid_json");
  assert(!raw.includes("this is not json"));
  assertEquals(client.rpcCalls.length, 0);
});

Deno.test("uses the verified user despite forged identity headers and query", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  client.respond("shipa_read_settings", { data: createSettingsDocument() });
  const request = new Request(`${ADMIN_ENDPOINT_URL}?actor_id=${OTHER_ID}`, {
    method: "POST",
    headers: {
      authorization: "Bearer synthetic-session",
      "x-actor-id": OTHER_ID,
    },
    body: JSON.stringify({ action: "settings.read" }),
  });
  const response = await createHandler(client, keyReader)(request);
  assertEquals(response.status, 200);
  assertEquals(findRpcCall(client, "shipa_read_settings").args, {
    _actor_id: ADMIN_ID,
  });
  assertEquals(client.roleQueries[0].filters[0].value, ADMIN_ID);
  assertEquals(keyReader.callCount(), 0);
});

Deno.test("counts UTF-8 bytes and cancels an overflowing stream after authentication", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  let cancelled = false;
  let reads = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      assertEquals(client.roleQueries.length, 1);
      reads += 1;
      // Each chunk is 40,000 bytes although it has only 20,000 UTF-16 units.
      controller.enqueue(new TextEncoder().encode("🌿".repeat(10000)));
    },
    cancel() {
      cancelled = true;
    },
  }, { highWaterMark: 0 });
  const response = await createHandler(client, keyReader)(
    createAdminRequest(undefined, { rawBody: body }),
  );
  assertEquals(response.status, 413);
  assertEquals(reads, 2);
  assertEquals(cancelled, true);
  assertEquals(client.rpcCalls.length, 0);
  assertEquals(keyReader.callCount(), 0);
});

Deno.test("refuses an oversized body that declares its size", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest(undefined, {
      rawBody: JSON.stringify({ action: "settings.read" }),
      headers: { "content-length": String(70 * 1024) },
    }),
  );

  assertEquals(response.status, 413);
  const body = await readErrorBody(response);
  assertEquals(body.error.code, "payload_too_large");
  assertEquals(client.rpcCalls.length, 0);
  assertEquals(keyReader.callCount(), 0);
});

Deno.test("refuses an oversized body that streams past the cap", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest(undefined, { rawBody: createOversizeBody() }),
  );

  assertEquals(response.status, 413);
  const body = await readErrorBody(response);
  assertEquals(body.error.code, "payload_too_large");
  assertEquals(client.rpcCalls.length, 0);
  assertEquals(keyReader.callCount(), 0);
});

// ---------------------------------------------------------------------------
// The master key
// ---------------------------------------------------------------------------

Deno.test("refuses a crypto action when the master key is missing or invalid", async () => {
  for (const value of [undefined, "not-canonical-base64!!"]) {
    const client = createFakeShipaAdminClient();
    const keyReader = createFakeEncryptionKeyReader(value);
    queueAdminSession(client, ADMIN_ID);
    const handler = createHandler(client, keyReader);

    const response = await handler(
      createAdminRequest({
        action: "credential.save",
        request: createCredentialSaveRequest({
          credential: {
            environment: "sandbox",
            mode: "replace",
            apiKey: FAKE_KEY,
          },
        }),
      }),
    );

    assertEquals(response.status, 503);
    const body = await readErrorBody(response);
    assertEquals(body.error.code, "invalid_configuration");
    // The key is refused before the first database call, so nothing was
    // written and nothing was encrypted.
    assertEquals(client.rpcCalls.length, 0);
    assertEquals(keyReader.callCount(), 1);
  }
});

Deno.test("keeps an ordinary settings save reachable without a master key", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  client.respond("shipa_save_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION + 1 }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest({
      action: "settings.save",
      request: createSaveRequest(),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(keyReader.callCount(), 0);
  assertEquals(client.calledFunctions(), ["shipa_save_settings"]);
});

// ---------------------------------------------------------------------------
// The diagnostic probe
// ---------------------------------------------------------------------------

Deno.test("diagnoses with the loaded key and records one normalised observation", async () => {
  const master = await createSyntheticMasterKey();
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader(master.encoded);
  queueAdminSession(client, ADMIN_ID);
  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_read_credential", {
    data: await createStoredCredentialDocument({
      keyring: master.keyring,
      keyVersion: master.keyVersion,
      integrationId: SHIPA_TEST_INTEGRATION_ID,
      environment: "sandbox",
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_record_provider_observation", {
    data: createObservationAcknowledgement(),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_read_readiness", {
    data: createReadinessDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });

  const provider = createFakeFetch((request) =>
    new URL(request.url).pathname === "/v2/health"
      ? healthResponse()
      : countryResponse()
  );
  const handler = createHandler(client, keyReader, provider.fetch);

  const response = await handler(
    createAdminRequest({
      action: "readiness.diagnose",
      request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
    }),
  );

  assertEquals(response.status, 200);

  // Two read-only provider calls, and no booking of any kind.
  assertEquals(provider.requests.length, 2);
  assertEquals(provider.requests[0].method, "GET");
  assertEquals(provider.requests[1].method, "GET");
  assertEquals(new URL(provider.requests[0].url).pathname, "/v2/health");
  assertEquals(new URL(provider.requests[1].url).pathname, "/v2/countries/KWT");
  // The calls went to the fixed sandbox origin and nowhere else.
  assertEquals(new URL(provider.requests[0].url).origin, SANDBOX_ORIGIN);
  assertEquals(new URL(provider.requests[1].url).origin, SANDBOX_ORIGIN);

  const observation = findRpcCall(
    client,
    "shipa_record_provider_observation",
  ).args["_observation"] as Record<string, unknown>;
  assertEquals(observation["verified"], true);
  assertEquals(observation["countryCode"], "KWT");
  assertEquals(observation["cities"], ["Hawally", "Salmiya"]);

  // No shipment, no scheduler receipt, no heartbeat.
  const called = client.calledFunctions();
  assert(!called.includes("shipa_record_scheduler_ok"));
  assert(!called.some((fn) => fn.includes("shipment")));
});

// ---------------------------------------------------------------------------
// The closed failures
// ---------------------------------------------------------------------------

Deno.test("reports a stale revision as a conflict", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  client.respond("shipa_save_settings", {
    error: createSqlError(
      "40001",
      "could not serialize access due to concurrent update",
    ),
  });
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest({
      action: "settings.save",
      request: createSaveRequest(),
    }),
  );

  assertEquals(response.status, 409);
  const body = await readErrorBody(response);
  assertEquals(body.error.code, "conflict");
});

Deno.test("reports a refused enablement as an unavailable runtime", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  client.respond("shipa_save_settings", {
    error: createSqlError(
      "55000",
      "shipa_runtime_not_ready: the delivery runtime is not ready",
    ),
  });
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest({
      action: "settings.save",
      request: createSaveRequest(),
    }),
  );

  assertEquals(response.status, 503);
  const body = await readErrorBody(response);
  assertEquals(body.error.code, "runtime_not_ready");
});

Deno.test("answers an unexpected database failure with a fixed response", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  queueAdminSession(client, ADMIN_ID);
  client.respond("shipa_read_settings", {
    rejection: new Error(
      "connection failed with synthetic-secret-value-not-real",
    ),
  });
  const handler = createHandler(client, keyReader);

  const response = await handler(
    createAdminRequest({ action: "settings.read" }),
  );

  assertEquals(response.status, 503);
  const raw = await response.text();
  const body = JSON.parse(raw) as AdminErrorBody;
  assertEquals(body.error.code, "unavailable");
  assertNoSecret(raw, ["synthetic-secret-value-not-real", "connection failed"]);
});

Deno.test("maps an unexpected error to a fixed 500", () => {
  const failure = mapShipaAdminFailure(
    new Error("boom: synthetic-secret-value-not-real"),
  );

  assertEquals(failure.code, "unhandled_error");
  assertEquals(failure.status, 500);
  assertEquals(failure.message, SHIPA_ADMIN_ERROR_MESSAGES.unhandled_error);
  assert(!failure.message.includes("boom"));
});
