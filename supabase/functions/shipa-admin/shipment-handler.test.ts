// Behavioural tests for the Shipa admin shipment endpoint.
//
// The real authorization helper, the real strict parsers, the real review
// store, the real credential loader, the real submission store, the real
// dispatcher, the real HTTP client, the real execution budget and the native
// crypto do the work here. Only three boundaries are faked: the Supabase SDK
// boundary, the provider fetch and the master-key reader.
//
// No secret, key, account or personal data is used: every value is a made-up
// placeholder, and the synthetic master key is generated freshly for every
// test.
//
// No listener is started and `index.ts` is never imported: the handler is
// called directly.

import { assert, assertEquals } from "jsr:@std/assert@1.0.19";

import { createShipaAdminHandler, type ShipaAdminHandler } from "./handler.ts";
import {
  createFakeEncryptionKeyReader,
  createSyntheticMasterKey,
  type FakeEncryptionKeyReader,
  type SyntheticMasterKey,
} from "../_tests/shipa/shipa-admin-fixtures.ts";
import {
  ADMIN_ENDPOINT_URL,
  createAdminRequest,
  createOversizeBody,
} from "../_tests/shipa/shipa-admin-requests.ts";
import {
  createStoredCredentialDocument,
  SHIPA_TEST_API_CREDENTIAL,
} from "../_tests/shipa/shipa-credential-loader-fixtures.ts";
import {
  createFakeShipaShipmentClient,
  createTestCanonicalBinding,
  type FakeShipaShipmentClient,
  SHIPA_TEST_MANUAL_NOW_MS,
} from "../_tests/shipa/shipa-manual-fixtures.ts";
import {
  createAcceptedProviderFetch,
  type FakeFetch,
} from "../_tests/shipa/shipa-dispatch-fixtures.ts";
import {
  createTestBeginDocument,
  createTestPreparationDocument,
  createTestSafeSummaryDocument,
  SHIPA_TEST_INTEGRATION_ID,
} from "../_tests/shipa/shipa-submission-fixtures.ts";
import {
  createTestIntegrityDocument,
  createTestManualRequest,
  createTestReadDocument,
  createTestSqlError,
  createTestSummaryDocument,
  SHIPA_TEST_REVIEW_ACTOR_ID,
  SHIPA_TEST_REVIEW_ORDER_ID,
  SHIPA_TEST_REVIEW_OTHER_ORDER_ID,
  SHIPA_TEST_REVIEW_SHIPMENT_ID,
} from "../_tests/shipa/shipa-review-fixtures.ts";
import { SHIPA_TEST_OTHER_USER_ID } from "../_tests/shipa/shipa-auth-fixtures.ts";
import {
  createSettingsDocument,
} from "../_tests/shipa/shipa-settings-fixtures.ts";

/** The verified administrator of the synthetic session. */
const ADMIN_ID = SHIPA_TEST_REVIEW_ACTOR_ID;

/** The environment of the synthetic stored credential. */
const ENVIRONMENT = "sandbox";

Deno.test("an already cancelled manual request cannot reach review or the provider", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  await queueManualSuccess(
    harness.client,
    harness.masterKey.keyring,
    harness.masterKey.keyVersion,
  );
  const controller = new AbortController();
  controller.abort();
  const response = await harness.handler(
    new Request(createAdminRequest(createBody()), {
      signal: controller.signal,
    }),
  );
  assertEquals(harness.provider.requests.length, 0);
  assertEquals(harness.client.calls.length, 0);
  assertEquals(harness.keyReader.callCount(), 0);
  assertEquals(response.status, 503);
});

Deno.test("cancellation during a possibly committed review prevents late dispatch", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  await queueManualSuccess(
    harness.client,
    harness.masterKey.keyring,
    harness.masterKey.keyVersion,
  );
  const reviewing = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const originalRpc = harness.client.rpc.bind(harness.client);
  const handler = createShipaAdminHandler({
    client: {
      ...harness.client,
      async rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
        const answer = await originalRpc(fn, args);
        if (fn === "shipa_request_manual") {
          reviewing.resolve();
          await release.promise;
        }
        return answer;
      },
    },
    readEncryptionKey: harness.keyReader.read,
    fetchImpl: harness.provider.fetch,
    now: () => SHIPA_TEST_MANUAL_NOW_MS,
  });
  const controller = new AbortController();
  const pending = handler(
    new Request(createAdminRequest(createBody()), {
      signal: controller.signal,
    }),
  );
  await reviewing.promise;
  controller.abort();
  const response = await pending;
  assertEquals(response.status, 503);
  assertEquals((await readError(response)).error.code, "operation_uncertain");
  release.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assertEquals(harness.client.calledFunctions(), ["shipa_request_manual"]);
  assertEquals(harness.keyReader.callCount(), 0);
  assertEquals(harness.provider.requests.length, 0);
});

/** The error body of the endpoint. */
interface AdminErrorBody {
  readonly success: false;
  readonly error: { readonly code: string; readonly message: string };
}

/** The success body of the endpoint. */
interface AdminSuccessBody {
  readonly success: true;
  readonly data: Record<string, unknown>;
}

/** The harness of one endpoint run. */
interface HandlerHarness {
  readonly client: FakeShipaShipmentClient;
  readonly provider: FakeFetch;
  readonly handler: ShipaAdminHandler;
  readonly keyReader: FakeEncryptionKeyReader;
  readonly masterKey: SyntheticMasterKey;
}

/** Builds one endpoint harness with a fresh synthetic master key. */
async function createHarness(
  options: { readonly provider?: FakeFetch } = {},
): Promise<HandlerHarness> {
  const client = createFakeShipaShipmentClient();
  const provider = options.provider ?? createAcceptedProviderFetch();
  const masterKey = await createSyntheticMasterKey();
  const keyReader = createFakeEncryptionKeyReader(masterKey.encoded);
  const handler = createShipaAdminHandler({
    client,
    readEncryptionKey: keyReader.read,
    fetchImpl: provider.fetch,
    now: () => SHIPA_TEST_MANUAL_NOW_MS,
  });
  return { client, provider, handler, keyReader, masterKey };
}

/** Queues a verified administrator session. */
function queueSession(client: FakeShipaShipmentClient): void {
  client.queueUser({ user: { id: ADMIN_ID } });
  client.queueRole({ data: { role: "admin" } });
}

/** The manual request body of the create action. */
function createBody(): Record<string, unknown> {
  return {
    action: "shipment.create",
    orderId: SHIPA_TEST_REVIEW_ORDER_ID,
    request: createTestManualRequest(),
  };
}

/** The preview request body of the preview action. */
function previewBody(): Record<string, unknown> {
  return {
    action: "shipment.preview",
    orderId: SHIPA_TEST_REVIEW_ORDER_ID,
    request: { environment: ENVIRONMENT },
  };
}

/** The read request body of the read action. */
function readBody(): Record<string, unknown> {
  return { action: "shipment.read", shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID };
}

/** Queues the stored credential of the synthetic integration. */
async function queueCredential(
  client: FakeShipaShipmentClient,
  keyring: ReadonlyMap<number, CryptoKey>,
  keyVersion: number,
): Promise<void> {
  client.respond("shipa_read_credential", {
    data: await createStoredCredentialDocument({
      keyring,
      keyVersion,
      integrationId: SHIPA_TEST_INTEGRATION_ID,
      environment: ENVIRONMENT,
    }),
  });
}

/** Queues the answers of the whole successful manual create path. */
async function queueManualSuccess(
  client: FakeShipaShipmentClient,
  keyring: ReadonlyMap<number, CryptoKey>,
  keyVersion: number,
  binding: Record<string, unknown> = createTestCanonicalBinding({
    environment: ENVIRONMENT,
  }),
): Promise<void> {
  client.respond("shipa_request_manual", {
    data: createTestSummaryDocument({
      shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
      state: "queued",
      attemptCount: 0,
      shipaRef: null,
      retryAt: null,
    }),
  });
  client.respond("shipa_resolve_dispatch_binding", { data: binding });
  await queueCredential(client, keyring, keyVersion);
  client.respond("shipa_prepare_submission", {
    data: createTestPreparationDocument({
      shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
      integrationId: SHIPA_TEST_INTEGRATION_ID,
      environment: ENVIRONMENT,
    }),
  });
  client.respondWith("shipa_begin_submission", (args) => ({
    data: createTestBeginDocument({
      shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
      integrationId: SHIPA_TEST_INTEGRATION_ID,
      environment: ENVIRONMENT,
      attemptToken: String(args["_attempt_token"]),
    }),
  }));
  client.respond("shipa_complete", {
    data: createTestSafeSummaryDocument({
      shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
      state: "created",
      shipaRef: "SR-2026-0001",
      providerStatus: "Created",
      attemptCount: 1,
    }),
  });
}

async function readError(response: Response): Promise<AdminErrorBody> {
  return (await response.json()) as AdminErrorBody;
}

async function readSuccess(response: Response): Promise<AdminSuccessBody> {
  return (await response.json()) as AdminSuccessBody;
}

// ---------------------------------------------------------------------------
// The request gate
// ---------------------------------------------------------------------------

Deno.test("answers the preflight without authentication, database or key access", async () => {
  const harness = await createHarness();

  const response = await harness.handler(
    new Request(ADMIN_ENDPOINT_URL, { method: "OPTIONS" }),
  );

  assertEquals(response.status, 204);
  assertEquals(harness.client.authCalls.length, 0);
  assertEquals(harness.client.calls.length, 0);
  assertEquals(harness.keyReader.callCount(), 0);
  assertEquals(harness.provider.requests.length, 0);
});

Deno.test("refuses a non-POST request without any effect", async () => {
  const harness = await createHarness();

  const response = await harness.handler(
    createAdminRequest(undefined, { method: "GET" }),
  );

  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "POST, OPTIONS");
  assertEquals(harness.client.calls.length, 0);
  assertEquals(harness.provider.requests.length, 0);
});

Deno.test("refuses an unauthenticated request without any effect", async () => {
  const harness = await createHarness();

  const response = await harness.handler(
    createAdminRequest(createBody(), { token: null }),
  );

  assertEquals(response.status, 401);
  const body = await readError(response);
  assertEquals(body.success, false);
  assertEquals(harness.client.calls.length, 0, "no database call");
  assertEquals(harness.keyReader.callCount(), 0, "no key read");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("refuses a request without the administrator role", async () => {
  const harness = await createHarness();
  harness.client.queueUser({ user: { id: ADMIN_ID } });
  harness.client.queueRole({ data: null });

  const response = await harness.handler(
    createAdminRequest(createBody()),
  );

  assertEquals(response.status, 403);
  assertEquals(harness.client.calls.length, 0, "no database call");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("answers an unavailable role lookup without any effect", async () => {
  const harness = await createHarness();
  harness.client.queueUser({ user: { id: ADMIN_ID } });
  harness.client.queueRole({
    rejection: new Error("synthetic transport failure"),
  });

  const response = await harness.handler(
    createAdminRequest(createBody()),
  );

  assertEquals(response.status, 503);
  assertEquals(harness.client.calls.length, 0, "no database call");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("refuses an oversize body without any effect", async () => {
  const harness = await createHarness();
  queueSession(harness.client);

  const response = await harness.handler(
    createAdminRequest(undefined, { rawBody: createOversizeBody() }),
  );

  assertEquals(response.status, 413);
  assertEquals(harness.client.calls.length, 0, "no database call");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

// ---------------------------------------------------------------------------
// The strict shapes
// ---------------------------------------------------------------------------

Deno.test("refuses a shipment body that carries an actor", async () => {
  const harness = await createHarness();
  queueSession(harness.client);

  const response = await harness.handler(
    createAdminRequest({
      action: "shipment.read",
      shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
      actor: { userId: SHIPA_TEST_OTHER_USER_ID },
    }),
  );

  assertEquals(response.status, 400);
  const body = await readError(response);
  assertEquals(body.error.code, "invalid_request");
  assertEquals(harness.client.calls.length, 0, "no database call");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("refuses a shipment body that names an unknown action", async () => {
  const harness = await createHarness();
  queueSession(harness.client);

  const response = await harness.handler(
    createAdminRequest({
      action: "shipment.destroy",
      shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
    }),
  );

  assertEquals(response.status, 400);
  const body = await readError(response);
  assertEquals(body.error.code, "invalid_request");
  assertEquals(harness.client.calls.length, 0, "no database call");
});

// ---------------------------------------------------------------------------
// The read-only actions
// ---------------------------------------------------------------------------

Deno.test("previews without a key read and without a provider request", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  harness.client.respond("shipa_check_integrity", {
    data: createTestIntegrityDocument(),
  });

  const response = await harness.handler(createAdminRequest(previewBody()));

  assertEquals(response.status, 200);
  const body = await readSuccess(response);
  assertEquals(body.success, true);
  assertEquals(harness.client.calledFunctions(), ["shipa_check_integrity"]);
  assertEquals(harness.keyReader.callCount(), 0, "no key read");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("reads a shipment without a key read and without a provider request", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  harness.client.respond("shipa_read_shipment", {
    data: createTestReadDocument({ shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID }),
  });

  const response = await harness.handler(createAdminRequest(readBody()));

  assertEquals(response.status, 200);
  const body = await readSuccess(response);
  assertEquals(body.data["shipmentId"], SHIPA_TEST_REVIEW_SHIPMENT_ID);
  assertEquals(harness.keyReader.callCount(), 0, "no key read");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("uses the verified actor and not a forged one", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  harness.client.respond("shipa_read_shipment", {
    data: createTestReadDocument({ shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID }),
  });

  await harness.handler(
    createAdminRequest(readBody(), {
      headers: { "x-actor-id": SHIPA_TEST_OTHER_USER_ID },
    }),
  );

  const call = harness.client.calls.find((entry) =>
    entry.fn === "shipa_read_shipment"
  );
  assert(call !== undefined, "the shipment must be read");
  assertEquals(call.args["_actor_id"], ADMIN_ID);
});

Deno.test("keeps a known unknown read without a retry", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  harness.client.respond("shipa_read_shipment", { data: null });

  const response = await harness.handler(createAdminRequest(readBody()));

  assertEquals(response.status, 200);
  const body = await readSuccess(response);
  assertEquals(body.data, null);
  assertEquals(
    harness.client.calledFunctions().filter((fn) =>
      fn === "shipa_read_shipment"
    )
      .length,
    1,
    "the read is called exactly once",
  );
  assertEquals(harness.provider.requests.length, 0);
});

// ---------------------------------------------------------------------------
// The manual booking
// ---------------------------------------------------------------------------

Deno.test("creates a manual booking with one provider request and one completion", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  await queueManualSuccess(
    harness.client,
    harness.masterKey.keyring,
    harness.masterKey.keyVersion,
  );

  const response = await harness.handler(createAdminRequest(createBody()));

  assertEquals(response.status, 200);
  const raw = await response.clone().text();
  const body = await readSuccess(response);

  assertEquals(harness.client.calledFunctions(), [
    "shipa_request_manual",
    "shipa_resolve_dispatch_binding",
    "shipa_read_credential",
    "shipa_prepare_submission",
    "shipa_begin_submission",
    "shipa_complete",
  ]);
  assertEquals(
    harness.provider.requests.length,
    1,
    "exactly one provider request",
  );

  const data = body.data as {
    shipment: Record<string, unknown>;
    dispatch: Record<string, unknown>;
  };
  assertEquals(data.shipment["shipmentId"], SHIPA_TEST_REVIEW_SHIPMENT_ID);
  assertEquals(data.shipment["orderId"], SHIPA_TEST_REVIEW_ORDER_ID);
  assertEquals(data.dispatch["status"], "created");
  const summary = data.dispatch["summary"] as Record<string, unknown>;
  assertEquals(
    summary["shipmentId"],
    data.shipment["shipmentId"],
    "the shipment identity must be the same",
  );

  assert(
    !raw.includes(SHIPA_TEST_API_CREDENTIAL),
    "the response carried a key",
  );
});

Deno.test("refuses a canonical binding that names another order", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  await queueManualSuccess(
    harness.client,
    harness.masterKey.keyring,
    harness.masterKey.keyVersion,
    createTestCanonicalBinding({
      orderId: SHIPA_TEST_REVIEW_OTHER_ORDER_ID,
      environment: ENVIRONMENT,
    }),
  );

  const response = await harness.handler(createAdminRequest(createBody()));

  assertEquals(response.status, 409);
  const body = await readError(response);
  assertEquals(body.error.code, "conflict");
  assertEquals(harness.keyReader.callCount(), 0, "no key read");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("refuses a canonical binding of another environment", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  await queueManualSuccess(
    harness.client,
    harness.masterKey.keyring,
    harness.masterKey.keyVersion,
    createTestCanonicalBinding({ environment: "live" }),
  );

  const response = await harness.handler(createAdminRequest(createBody()));

  assertEquals(response.status, 409);
  const body = await readError(response);
  assertEquals(body.error.code, "conflict");
  assertEquals(harness.keyReader.callCount(), 0, "no key read");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("refuses a canonical binding with an extra member", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  await queueManualSuccess(
    harness.client,
    harness.masterKey.keyring,
    harness.masterKey.keyVersion,
    createTestCanonicalBinding({
      environment: ENVIRONMENT,
      extra: { credential_id: "b7c8d9e0-1a2b-4c3d-8e4f-5a6b7c8d9e0f" },
    }),
  );

  const response = await harness.handler(createAdminRequest(createBody()));

  assertEquals(response.status, 502);
  const body = await readError(response);
  assertEquals(body.error.code, "invalid_response");
  assertEquals(harness.keyReader.callCount(), 0, "no key read");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("refuses a missing canonical binding without a provider request", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  harness.client.respond("shipa_request_manual", {
    data: createTestSummaryDocument({
      shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
      state: "queued",
      attemptCount: 0,
      shipaRef: null,
      retryAt: null,
    }),
  });
  // The canonical lookup answers with SQL null: the shipment has no
  // server-owned binding, so the item is refused before the key is loaded.
  harness.client.respond("shipa_resolve_dispatch_binding", { data: null });

  const response = await harness.handler(createAdminRequest(createBody()));

  assertEquals(response.status, 404);
  const body = await readError(response);
  assertEquals(body.error.code, "not_found");
  assertEquals(harness.keyReader.callCount(), 0, "no key read");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("answers a SQL refusal without a provider request", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  harness.client.respond("shipa_request_manual", {
    error: createTestSqlError(
      "55000",
      "shipa_possible_dispatch_requires_reconciliation",
    ),
  });

  const response = await harness.handler(createAdminRequest(createBody()));

  assertEquals(response.status, 409);
  const body = await readError(response);
  assertEquals(body.error.code, "needs_reconciliation");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("answers a paid receipt hold without a provider request", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  harness.client.respond("shipa_request_manual", {
    error: createTestSqlError("55000", "shipa_verified_paid_receipt_required"),
  });

  const response = await harness.handler(createAdminRequest(createBody()));

  assertEquals(response.status, 409);
  const body = await readError(response);
  assertEquals(body.error.code, "not_eligible");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("answers a lost manual response as an uncertain operation", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  harness.client.respond("shipa_request_manual", {
    rejection: new Error("synthetic transport failure"),
  });

  const response = await harness.handler(createAdminRequest(createBody()));

  assertEquals(response.status, 503);
  const body = await readError(response);
  assertEquals(body.error.code, "operation_uncertain");
  assertEquals(
    harness.client.calledFunctions().filter((fn) =>
      fn === "shipa_request_manual"
    )
      .length,
    1,
    "the review is never retried",
  );
  assertEquals(
    harness.client.calledFunctions().includes("shipa_resolve_dispatch_binding"),
    false,
    "the canonical lookup must not run",
  );
  assertEquals(harness.keyReader.callCount(), 0, "no key read");
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

Deno.test("closes the item when the current key is missing", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  harness.client.respond("shipa_request_manual", {
    data: createTestSummaryDocument({
      shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
      state: "queued",
      attemptCount: 0,
      shipaRef: null,
      retryAt: null,
    }),
  });
  harness.client.respond("shipa_resolve_dispatch_binding", {
    data: createTestCanonicalBinding({ environment: ENVIRONMENT }),
  });
  // The stored credential is gone. The loader reports it as missing, the
  // item closes and no provider request becomes possible.
  harness.client.respond("shipa_read_credential", { data: null });

  const response = await harness.handler(createAdminRequest(createBody()));

  assertEquals(response.status, 200);
  const body = await readSuccess(response);
  assertEquals(body.data.dispatch, {
    status: "not_started",
    code: "credential_missing",
  });
  assertEquals(harness.provider.requests.length, 0, "no provider request");
});

// ---------------------------------------------------------------------------
// The configuration actions
// ---------------------------------------------------------------------------

Deno.test("keeps the configuration actions working", async () => {
  const harness = await createHarness();
  queueSession(harness.client);
  harness.client.respond("shipa_read_settings", {
    data: createSettingsDocument(),
  });

  const response = await harness.handler(
    createAdminRequest({ action: "settings.read" }),
  );

  assertEquals(response.status, 200);
  const body = await readSuccess(response);
  assertEquals(body.success, true);
  assertEquals(harness.client.calledFunctions(), ["shipa_read_settings"]);
  assertEquals(harness.provider.requests.length, 0);
});
