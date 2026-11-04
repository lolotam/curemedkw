// Behavioural tests for the Shipa one-shipment execution core.
//
// The real execution core, the real credential loader, the real submission
// store, the real strict parsers, the real adapter builder, the real HTTP
// client and the native crypto do the work here. Only two boundaries are
// faked: the database client and the provider fetch.
//
// No test in this file reaches the real network, reads an environment
// variable or uses a real credential. The provider fetch is a local fixture.

import { assertEquals } from "jsr:@std/assert@1.0.19";

import type { IntegrationCredentialKeyring } from "../../_shared/integration-credentials.ts";
import { createShipaDispatcher, type ShipaDispatcher } from "../../_shared/shipa-dispatch.ts";
import {
  createFakeShipaSubmissionRpcClient,
  createStoredCredentialDocument,
  createSyntheticKeyring,
  createTestDraft,
  createTestPreparationDocument,
  createTestRefusalDocument,
  createUndecryptableEnvelope,
  type FakeShipaSubmissionRpcClient,
  SHIPA_TEST_CREDENTIAL_FINGERPRINT,
  SHIPA_TEST_CREDENTIAL_REVISION,
  SHIPA_TEST_STALE_CREDENTIAL_FINGERPRINT,
  SHIPA_TEST_STALE_CREDENTIAL_REVISION,
  type TestPreparationOptions,
  type TestSummaryOptions,
} from "./shipa-submission-fixtures.ts";
import {
  createAcceptedProviderFetch,
  createBeginResponder,
  createBrokenTransportProviderFetch,
  createFailingProviderFetch,
  createReferenceLessProviderFetch,
  createSummaryResponder,
  type DispatchCredentialOptions,
  type FakeFetch,
  queueCredentialDocument,
  queueMissingCredential,
  SHIPA_TEST_DISPATCH_INPUT,
  SHIPA_TEST_LIVE_DISPATCH_INPUT,
} from "./shipa-dispatch-fixtures.ts";
import { LIVE_ORIGIN, SANDBOX_ORIGIN } from "./shipa-fixtures.ts";

interface Harness {
  readonly client: FakeShipaSubmissionRpcClient;
  readonly keyring: IntegrationCredentialKeyring;
  readonly provider: FakeFetch;
  readonly dispatcher: ShipaDispatcher;
}

/**
 * Builds one execution harness.
 *
 * The queue holds the credential, the preparation, the begin answer and the
 * completion answer, in the order the core calls them.
 */
async function createHarness(
  options: {
    readonly provider?: FakeFetch;
    readonly environment?: "sandbox" | "live";
    readonly credential?: DispatchCredentialOptions;
    readonly preparation?: TestPreparationOptions;
    readonly summary?: TestSummaryOptions;
  } = {},
): Promise<Harness> {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = options.provider ?? createAcceptedProviderFetch();
  const preparation: TestPreparationOptions = {
    environment: options.environment,
    ...options.preparation,
  };

  await queueCredentialDocument(client, keyring, {
    environment: options.environment,
    ...options.credential,
  });
  client.queue({ data: createTestPreparationDocument(preparation) });
  client.queueResponder(createBeginResponder(preparation));
  client.queueResponder(createSummaryResponder(options.summary));

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });
  return { client, keyring, provider, dispatcher };
}

/**
 * The summary the database keeps when a provider answer is not an acceptance.
 *
 * SQL moves the shipment to `unknown` and records the attempt, because a
 * marker exists and a non-dispatch is not proven.
 */
const UNCERTAIN_SUMMARY: TestSummaryOptions = {
  state: "unknown",
  shipaRef: null,
  providerStatus: null,
  lastErrorCode: "attempt_uncertain",
};
const OTHER_ID = "9f8e7d6c-5b4a-4392-8102-7364f5e3d2c1";

// ---------------------------------------------------------------------------
// The happy path
// ---------------------------------------------------------------------------

Deno.test("performs exactly one create request and one completion", async () => {
  const { client, provider, dispatcher } = await createHarness();

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "created");
  assertEquals(provider.requests.length, 1);
  assertEquals(provider.requests[0].method, "POST");
  assertEquals(
    client.calls.map((call) => call.fn),
    [
      "shipa_read_credential",
      "shipa_prepare_submission",
      "shipa_begin_submission",
      "shipa_complete",
    ],
  );
});

Deno.test("does not reach the provider before the begin has resolved", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  const begin = client.queueDeferred();

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });
  const running = dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  await begin.called;
  assertEquals(provider.requests.length, 0);

  begin.resolve(createBeginResponder());
  client.queueResponder(createSummaryResponder());
  const result = await running;

  assertEquals(result.status, "created");
  assertEquals(provider.requests.length, 1);
});

Deno.test("sends the exact completion result and the exact accepted shape", async () => {
  const { client, dispatcher } = await createHarness();

  await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  const completion = client.calls[3].args["_result"] as Record<string, unknown>;
  assertEquals(Object.keys(completion).sort(), [
    "orderStatus",
    "outcome",
    "shipaRef",
  ]);
  assertEquals(completion["outcome"], "accepted");
  assertEquals(completion["shipaRef"], "SR-2026-0001");
  assertEquals(completion["orderStatus"], "Created");
});

Deno.test("keeps the sandbox and the live environment apart", async () => {
  const { provider, dispatcher } = await createHarness({
    environment: "live",
    preparation: { environment: "live" },
  });

  await dispatcher.processShipment(SHIPA_TEST_LIVE_DISPATCH_INPUT);

  assertEquals(provider.requests.length, 1);
  assertEquals(provider.requests[0].url.startsWith(LIVE_ORIGIN), true);
  assertEquals(provider.requests[0].url.startsWith(SANDBOX_ORIGIN), false);
});

// ---------------------------------------------------------------------------
// The provider outcomes
// ---------------------------------------------------------------------------

Deno.test("records an uncertain provider outcome without a retry", async () => {
  const { client, provider, dispatcher } = await createHarness({
    provider: createFailingProviderFetch(500),
    summary: UNCERTAIN_SUMMARY,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "uncertain");
  assertEquals(result.code, "provider_uncertain");
  assertEquals(provider.requests.length, 1);
  assertEquals(client.calls.length, 4);
});

Deno.test("treats a success without a provider reference as uncertain", async () => {
  const { provider, dispatcher } = await createHarness({
    provider: createReferenceLessProviderFetch(),
    summary: UNCERTAIN_SUMMARY,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "uncertain");
  assertEquals(result.code, "provider_uncertain");
  assertEquals(provider.requests.length, 1);
});

Deno.test("treats a broken transport as uncertain", async () => {
  const { provider, dispatcher } = await createHarness({
    provider: createBrokenTransportProviderFetch(),
    summary: UNCERTAIN_SUMMARY,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "uncertain");
  assertEquals(result.code, "provider_uncertain");
  assertEquals(provider.requests.length, 1);
});

Deno.test("never repeats a request and never retries the provider", async () => {
  const { client, provider, dispatcher } = await createHarness({
    provider: createFailingProviderFetch(500),
    summary: UNCERTAIN_SUMMARY,
  });

  await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(provider.requests.length, 1);
  assertEquals(
    client.calls.filter((call) => call.fn === "shipa_begin_submission").length,
    1,
  );
  assertEquals(
    client.calls.filter((call) => call.fn === "shipa_complete").length,
    1,
  );
});

Deno.test("keeps a failed completion from producing another request", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queueResponder(createBeginResponder());
  client.queue({
    data: null,
    error: { code: "40001", message: "stale attempt" },
  });

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "persistence_uncertain");
  assertEquals(result.code, "persistence_uncertain");
  assertEquals(provider.requests.length, 1);
});

// ---------------------------------------------------------------------------
// The begin that never authorises
// ---------------------------------------------------------------------------

Deno.test("never posts when the begin is lost", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  const begin = client.queueDeferred();

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });
  const running = dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  await begin.called;
  begin.reject(new Error("synthetic transport failure"));
  const result = await running;

  assertEquals(result.status, "uncertain");
  assertEquals(result.code, "begin_uncertain");
  assertEquals(provider.requests.length, 0);
});

Deno.test("never posts when the begin is refused", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queue({
    data: createTestRefusalDocument("possible_dispatch_or_state_ineligible"),
  });

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "not_started");
  assertEquals(result.code, "possible_dispatch_or_state_ineligible");
  assertEquals(provider.requests.length, 0);
});

Deno.test("never posts when the begin answer is malformed", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  const malformed = createTestPreparationDocument();
  malformed["attempt_token"] = "6f1c7a3e-8b52-4d19-9f0a-2c7e5b8d1a44";
  client.queue({ data: malformed });

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "uncertain");
  assertEquals(result.code, "begin_uncertain");
  assertEquals(provider.requests.length, 0);
});

Deno.test("never posts when the begin answer carries another token", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queueResponder(createBeginResponder({
    attemptToken: OTHER_ID,
  }));

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "uncertain");
  assertEquals(result.code, "begin_uncertain");
  assertEquals(provider.requests.length, 0);
});

// ---------------------------------------------------------------------------
// The preparation that never authorises
// ---------------------------------------------------------------------------

Deno.test("never posts when the preparation is refused", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({
    data: createTestRefusalDocument("paid_items_changed"),
  });

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "not_started");
  assertEquals(result.code, "paid_items_changed");
  assertEquals(provider.requests.length, 0);
  assertEquals(client.calls.length, 2);
});

Deno.test("never posts when the draft is not a legal order", async () => {
  const draft = createTestDraft();
  const invalid = {
    ...draft,
    destination: { ...draft.destination, city: "" },
  };

  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({
    data: createTestPreparationDocument({ draft: invalid }),
  });

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "not_started");
  assertEquals(result.code, "draft_invalid");
  assertEquals(provider.requests.length, 0);
  // The credential and the preparation happened; the begin never did.
  assertEquals(client.calls.length, 2);
});

Deno.test("never posts when the built payload does not match the SQL payload", async () => {
  const document = createTestPreparationDocument();
  const payload = document["payload"] as Record<string, unknown>;
  const origin = payload["origin"] as Record<string, unknown>;
  origin["city"] = "A Different City";

  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({ data: document });

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "not_started");
  assertEquals(result.code, "payload_mismatch");
  assertEquals(provider.requests.length, 0);
  assertEquals(client.calls.length, 2);
});

// ---------------------------------------------------------------------------
// The credential
// ---------------------------------------------------------------------------

Deno.test("never posts when the credential is missing", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  queueMissingCredential(client);

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "not_started");
  assertEquals(result.code, "credential_missing");
  assertEquals(provider.requests.length, 0);
  assertEquals(client.calls.length, 1);
});

Deno.test("never posts when the credential cannot be decrypted", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  const document = await createStoredCredentialDocument({ keyring });
  document["envelope"] = createUndecryptableEnvelope();
  client.queue({ data: document });

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "not_started");
  assertEquals(result.code, "decryption_failed");
  assertEquals(provider.requests.length, 0);
});

Deno.test("keeps a stale loaded credential stale", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();

  // The stored credential the loader reads is the older one.
  await queueCredentialDocument(client, keyring, {
    credentialRevision: SHIPA_TEST_STALE_CREDENTIAL_REVISION,
    credentialFingerprint: SHIPA_TEST_STALE_CREDENTIAL_FINGERPRINT,
  });
  // The preparation carries the newer revision the database holds now.
  client.queue({
    data: createTestPreparationDocument({
      credentialRevision: SHIPA_TEST_CREDENTIAL_REVISION,
      credentialFingerprint: SHIPA_TEST_CREDENTIAL_FINGERPRINT,
    }),
  });
  // SQL refuses the begin because the prepared credential does not match.
  client.queue({
    data: createTestRefusalDocument("prepared_inputs_changed"),
  });

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  const prepared = client.calls[2].args["_prepared"] as Record<string, unknown>;
  assertEquals(
    prepared["credential_revision"],
    SHIPA_TEST_STALE_CREDENTIAL_REVISION,
  );
  assertEquals(
    prepared["credential_fingerprint"],
    SHIPA_TEST_STALE_CREDENTIAL_FINGERPRINT,
  );
  assertEquals(result.status, "not_started");
  assertEquals(result.code, "prepared_inputs_changed");
  assertEquals(provider.requests.length, 0);
});

// ---------------------------------------------------------------------------
// The duplicate invocation
// ---------------------------------------------------------------------------

Deno.test("does not post twice when a second invocation is refused authority", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queueResponder(createBeginResponder());
  client.queueResponder(createSummaryResponder());

  const dispatcher = createShipaDispatcher({
    now: () => Date.parse("2026-11-04T00:12:12.967Z"),
    client,
    keyring,
    fetchImpl: provider.fetch,
  });

  const first = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);
  assertEquals(first.status, "created");
  assertEquals(provider.requests.length, 1);

  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queue({
    data: createTestRefusalDocument("possible_dispatch_or_state_ineligible"),
  });

  const second = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(second.status, "not_started");
  assertEquals(provider.requests.length, 1);
});

// ---------------------------------------------------------------------------
// The safe output
// ---------------------------------------------------------------------------

Deno.test("keeps secrets, payloads and addresses out of the returned status", async () => {
  const { dispatcher } = await createHarness();

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  const serialised = JSON.stringify(result);
  assertEquals(serialised.includes("synthetic-shipa-api-key-not-real"), false);
  assertEquals(serialised.includes("Hawalli"), false);
  assertEquals(serialised.includes("Test Recipient"), false);
  assertEquals(serialised.includes("pickupInstructions"), false);
  assertEquals(serialised.includes("packages"), false);
  assertEquals(serialised.includes("payload"), false);
  assertEquals(serialised.includes("ciphertext"), false);
});

Deno.test("refuses an input that is not a server-owned binding", async () => {
  const { client, provider, dispatcher } = await createHarness();

  const result = await dispatcher.processShipment({
    shipmentId: "not-a-uuid",
    integrationId: "not-a-uuid",
    environment: "sandbox",
  });

  assertEquals(result.status, "not_started");
  assertEquals(result.code, "invalid_request");
  assertEquals(client.calls.length, 0);
  assertEquals(provider.requests.length, 0);
});

Deno.test("refuses extra paid, actor or draft authority before loading a key", async () => {
  for (
    const extra of [{ paid: true }, { actor: "synthetic-actor" }, { draft: {} }]
  ) {
    const { client, provider, dispatcher } = await createHarness();
    const result = await dispatcher.processShipment({
      ...SHIPA_TEST_DISPATCH_INPUT,
      ...extra,
    });
    assertEquals(result, { status: "not_started", code: "invalid_request" });
    assertEquals(client.calls.length, 0);
    assertEquals(provider.requests.length, 0);
  }
});
