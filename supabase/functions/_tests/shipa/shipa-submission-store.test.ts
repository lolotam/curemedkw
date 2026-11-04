// Behavioural tests for the internal Shipa submission store.
//
// The real store, the real strict parsers and the real SQLSTATE mapping do
// the work here. Only the database boundary is faked, and the fake is a
// transport fixture: it proves which call was made and with which arguments,
// not that a database behaves that way.
//
// No test in this file reaches the network, reads an environment variable or
// uses a real credential.

import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";

import {
  SHIPA_SUBMISSION_ERROR_MESSAGES,
  type ShipaSubmissionBinding,
  ShipaSubmissionError,
  type ShipaSubmissionErrorCode,
  type ShipaSubmissionPreparation,
  type ShipaSubmissionRefusal,
} from "../../_shared/shipa-submission-contract.ts";
import { parseShipaSubmissionPreparation } from "../../_shared/shipa-submission-responses.ts";
import { createShipaSubmissionStore } from "../../_shared/shipa-submission-store.ts";
import {
  createFakeShipaSubmissionRpcClient,
  createTestBeginDocument,
  createTestPreparationDocument,
  createTestRefusalDocument,
  createTestSafeSummaryDocument,
  SHIPA_TEST_CREDENTIAL_FINGERPRINT,
  SHIPA_TEST_CREDENTIAL_REVISION,
  SHIPA_TEST_INPUT_FINGERPRINT,
  SHIPA_TEST_INTEGRATION_ID,
  SHIPA_TEST_OTHER_INTEGRATION_ID,
  SHIPA_TEST_OTHER_SHIPMENT_ID,
  SHIPA_TEST_PAYLOAD_HASH,
  SHIPA_TEST_SETTINGS_REVISION,
  SHIPA_TEST_SHIPMENT_ID,
  SHIPA_TEST_STALE_CREDENTIAL_FINGERPRINT,
  SHIPA_TEST_STALE_CREDENTIAL_REVISION,
} from "./shipa-submission-fixtures.ts";

const BINDING: ShipaSubmissionBinding = {
  shipmentId: SHIPA_TEST_SHIPMENT_ID,
  integrationId: SHIPA_TEST_INTEGRATION_ID,
  environment: "sandbox",
};

const ATTEMPT_ID = "1b9d6ec2-0f5a-4c7e-8a3b-2d4f6e8c1a05";
const OTHER_ID = "9f8e7d6c-5b4a-4392-8102-7364f5e3d2c1";

const CREDENTIAL = {
  credentialRevision: SHIPA_TEST_CREDENTIAL_REVISION,
  credentialFingerprint: SHIPA_TEST_CREDENTIAL_FINGERPRINT,
};

Deno.test("refuses a response that contradicts persisted shipment invariants", async () => {
  const invalid = [
    { shipa_ref: null },
    { attempt_count: 0 },
    { attempt_count: 5 },
    { retry_count: 4 },
    { updated_at: "2026-99-99T12:00:00Z" },
    { state: "unknown", retry_at: "2026-11-04T12:00:00Z", shipa_ref: null },
    { state: "unknown" },
  ];
  for (const patch of invalid) {
    const client = createFakeShipaSubmissionRpcClient();
    client.queue({ data: { ...createTestSafeSummaryDocument(), ...patch } });
    const store = createShipaSubmissionStore({ client });
    await expectStoreError(
      "invalid_response",
      () =>
        store.complete(BINDING, ATTEMPT_ID, {
          outcome: "accepted",
          shipaRef: "synthetic-ref",
          orderStatus: null,
        }),
    );
    assertEquals(client.calls.length, 1);
  }
});

Deno.test("binds refusals to the requested shipment and rejects extra authority fields", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  client.queue({
    data: createTestRefusalDocument(
      "integration_ineligible",
      SHIPA_TEST_OTHER_SHIPMENT_ID,
    ),
  });
  const store = createShipaSubmissionStore({ client });
  await expectStoreError("invalid_response", () => store.prepare(BINDING));
  const tainted = { ...BINDING, actor: "synthetic-actor" };
  await expectStoreError("invalid_request", () => store.prepare(tainted));
  assertEquals(client.calls.length, 1);
});

Deno.test("refuses tainted internal begin context before any RPC", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const store = createShipaSubmissionStore({ client });
  const preparation = buildPreparation();
  const normal = {
    binding: BINDING,
    preparation,
    credential: CREDENTIAL,
    attemptToken: ATTEMPT_ID,
  };
  const invalid = [
    { ...normal, paid: true },
    { ...normal, preparation: { ...preparation, actor: "synthetic-actor" } },
    { ...normal, credential: { ...CREDENTIAL, paid: true } },
    {
      ...normal,
      preparation: { ...preparation, shipmentId: SHIPA_TEST_OTHER_SHIPMENT_ID },
    },
  ];
  for (const request of invalid) {
    await expectStoreError("invalid_request", () => store.begin(request));
  }
  assertEquals(client.calls.length, 0);
});

async function expectStoreError(
  code: ShipaSubmissionErrorCode,
  action: () => Promise<unknown>,
): Promise<ShipaSubmissionError> {
  const error = await assertRejects(action, ShipaSubmissionError);
  assertEquals(error.code, code);
  assertEquals(error.message, SHIPA_SUBMISSION_ERROR_MESSAGES[code]);
  return error;
}

/** Narrows a prepared answer and fails the test when it is a refusal. */
function requireReady(
  result: ShipaSubmissionPreparation | ShipaSubmissionRefusal,
): ShipaSubmissionPreparation {
  if (!result.ready) {
    throw new Error("Expected a prepared document, not a refusal.");
  }
  return result;
}

/** Narrows a refused answer and fails the test when it is ready. */
function requireRefusal(
  result: ShipaSubmissionPreparation | ShipaSubmissionRefusal,
): ShipaSubmissionRefusal {
  if (result.ready) {
    throw new Error("Expected a refusal, not a prepared document.");
  }
  return result;
}

function buildPreparation(
  options: {
    readonly credentialRevision?: number;
    readonly credentialFingerprint?: string;
  } = {},
): ShipaSubmissionPreparation {
  return parseShipaSubmissionPreparation(
    createTestPreparationDocument({
      credentialRevision: options.credentialRevision ??
        SHIPA_TEST_CREDENTIAL_REVISION,
      credentialFingerprint: options.credentialFingerprint ??
        SHIPA_TEST_CREDENTIAL_FINGERPRINT,
    }),
    BINDING,
  );
}

// ---------------------------------------------------------------------------
// Preparation
// ---------------------------------------------------------------------------

Deno.test("prepares with exactly one call and the server-owned shipment id", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  client.queue({ data: createTestPreparationDocument() });
  const store = createShipaSubmissionStore({ client });

  const result = requireReady(await store.prepare(BINDING));

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_prepare_submission");
  assertEquals(client.calls[0].args, { _shipment_id: SHIPA_TEST_SHIPMENT_ID });

  assertEquals(result.shipmentId, SHIPA_TEST_SHIPMENT_ID);
  assertEquals(result.integrationId, SHIPA_TEST_INTEGRATION_ID);
  assertEquals(result.environment, "sandbox");
  assertEquals(result.settingsRevision, SHIPA_TEST_SETTINGS_REVISION);
});

Deno.test("passes the supplied fingerprint and hash through byte for byte", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  client.queue({ data: createTestPreparationDocument() });
  const store = createShipaSubmissionStore({ client });

  const result = requireReady(await store.prepare(BINDING));

  assertEquals(result.inputFingerprint, SHIPA_TEST_INPUT_FINGERPRINT);
  assertEquals(result.credentialFingerprint, SHIPA_TEST_CREDENTIAL_FINGERPRINT);
  assertEquals(result.payloadHash, SHIPA_TEST_PAYLOAD_HASH);
});

Deno.test("returns a refusal instead of a failure", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  client.queue({
    data: {
      ready: false,
      shipment_id: SHIPA_TEST_SHIPMENT_ID,
      code: "integration_ineligible",
    },
  });
  const store = createShipaSubmissionStore({ client });

  const result = requireRefusal(await store.prepare(BINDING));

  assertEquals(result, {
    ready: false,
    shipmentId: SHIPA_TEST_SHIPMENT_ID,
    code: "integration_ineligible",
  });
  assertEquals(client.calls.length, 1);
});

Deno.test("refuses an answer for another shipment, integration or environment", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const store = createShipaSubmissionStore({ client });

  client.queue({
    data: createTestPreparationDocument({
      shipmentId: SHIPA_TEST_OTHER_SHIPMENT_ID,
    }),
  });
  await expectStoreError("invalid_response", () => store.prepare(BINDING));

  client.queue({
    data: createTestPreparationDocument({
      integrationId: SHIPA_TEST_OTHER_INTEGRATION_ID,
    }),
  });
  await expectStoreError("invalid_response", () => store.prepare(BINDING));

  client.queue({
    data: createTestPreparationDocument({ environment: "live" }),
  });
  await expectStoreError("invalid_response", () => store.prepare(BINDING));
});

Deno.test("refuses a prepared answer that carries an unknown member", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const document = createTestPreparationDocument();
  document["api_key"] = "synthetic-secret-that-must-be-refused";
  client.queue({ data: document });
  const store = createShipaSubmissionStore({ client });

  await expectStoreError("invalid_response", () => store.prepare(BINDING));
});

Deno.test("refuses a draft that carries a member SQL never emits", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const document = createTestPreparationDocument();
  const draft = document["draft"] as Record<string, unknown>;
  const origin = draft["origin"] as Record<string, unknown>;
  origin["email"] = "synthetic@example.invalid";
  client.queue({ data: document });
  const store = createShipaSubmissionStore({ client });

  await expectStoreError("invalid_response", () => store.prepare(BINDING));
});

Deno.test("accepts an SDK envelope that carries extra properties", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  client.queue({
    data: createTestPreparationDocument(),
    extra: { status: 200, count: null, statusText: "OK" },
  });
  const store = createShipaSubmissionStore({ client });

  const result = requireReady(await store.prepare(BINDING));
  assertEquals(result.ready, true);
});

Deno.test("refuses an answer that is not an SDK envelope", async () => {
  const rawClient = {
    rpc(_fn: string, _args?: Record<string, unknown>): PromiseLike<unknown> {
      return Promise.resolve(createTestPreparationDocument());
    },
  };
  const store = createShipaSubmissionStore({ client: rawClient });

  await expectStoreError("invalid_response", () => store.prepare(BINDING));
});

// ---------------------------------------------------------------------------
// Begin
// ---------------------------------------------------------------------------

Deno.test("sends exactly the six prepared fields and the loaded credential", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const store = createShipaSubmissionStore({ client });
  const preparation = buildPreparation();

  client.queue({
    data: createTestBeginDocument({
      attemptToken: ATTEMPT_ID,
      credentialRevision: CREDENTIAL.credentialRevision,
      credentialFingerprint: CREDENTIAL.credentialFingerprint,
    }),
  });

  const begun = await store.begin({
    binding: BINDING,
    preparation,
    credential: CREDENTIAL,
    attemptToken: ATTEMPT_ID,
  });

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_begin_submission");
  const args = client.calls[0].args;
  assertEquals(args["_shipment_id"], SHIPA_TEST_SHIPMENT_ID);
  assertEquals(args["_attempt_token"], ATTEMPT_ID);
  const prepared = args["_prepared"] as Record<string, unknown>;
  assertEquals(Object.keys(prepared).sort(), [
    "credential_fingerprint",
    "credential_revision",
    "input_fingerprint",
    "payload",
    "payload_hash",
    "settings_revision",
  ]);
  assertEquals(prepared["settings_revision"], SHIPA_TEST_SETTINGS_REVISION);
  assertEquals(prepared["input_fingerprint"], SHIPA_TEST_INPUT_FINGERPRINT);
  assertEquals(prepared["credential_revision"], CREDENTIAL.credentialRevision);
  assertEquals(
    prepared["credential_fingerprint"],
    CREDENTIAL.credentialFingerprint,
  );
  assertEquals(prepared["payload_hash"], SHIPA_TEST_PAYLOAD_HASH);

  assertEquals(begun.ready, true);
  if (!begun.ready) throw new Error("Expected a begin document.");
  assertEquals(begun.attemptToken, ATTEMPT_ID);
});

Deno.test("keeps a stale loaded credential stale", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const store = createShipaSubmissionStore({ client });
  const preparation = buildPreparation({
    credentialRevision: SHIPA_TEST_CREDENTIAL_REVISION,
    credentialFingerprint: SHIPA_TEST_CREDENTIAL_FINGERPRINT,
  });

  client.queue({
    data: {
      ready: false,
      shipment_id: SHIPA_TEST_SHIPMENT_ID,
      code: "prepared_inputs_changed",
    },
  });

  const begun = await store.begin({
    binding: BINDING,
    preparation,
    credential: {
      credentialRevision: SHIPA_TEST_STALE_CREDENTIAL_REVISION,
      credentialFingerprint: SHIPA_TEST_STALE_CREDENTIAL_FINGERPRINT,
    },
    attemptToken: ATTEMPT_ID,
  });

  // The request carries the loaded tuple, never the fresher preparation one.
  const prepared = client.calls[0].args["_prepared"] as Record<string, unknown>;
  assertEquals(
    prepared["credential_revision"],
    SHIPA_TEST_STALE_CREDENTIAL_REVISION,
  );
  assertEquals(
    prepared["credential_fingerprint"],
    SHIPA_TEST_STALE_CREDENTIAL_FINGERPRINT,
  );
  assertEquals(prepared["settings_revision"], SHIPA_TEST_SETTINGS_REVISION);

  const refusal = requireRefusal(begun);
  assertEquals(refusal.code, "prepared_inputs_changed");
});

Deno.test("refuses a begin answer that carries another attempt token", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const store = createShipaSubmissionStore({ client });
  const preparation = buildPreparation();

  client.queue({
    data: createTestBeginDocument({
      attemptToken: OTHER_ID,
      credentialRevision: CREDENTIAL.credentialRevision,
      credentialFingerprint: CREDENTIAL.credentialFingerprint,
    }),
  });

  await expectStoreError(
    "invalid_response",
    () =>
      store.begin({
        binding: BINDING,
        preparation,
        credential: CREDENTIAL,
        attemptToken: ATTEMPT_ID,
      }),
  );
});

Deno.test("refuses a begin answer whose credential metadata is fresher", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const store = createShipaSubmissionStore({ client });
  const preparation = buildPreparation({
    credentialRevision: SHIPA_TEST_STALE_CREDENTIAL_REVISION,
    credentialFingerprint: SHIPA_TEST_STALE_CREDENTIAL_FINGERPRINT,
  });

  client.queue({
    data: createTestBeginDocument({
      attemptToken: ATTEMPT_ID,
      credentialRevision: SHIPA_TEST_CREDENTIAL_REVISION,
      credentialFingerprint: SHIPA_TEST_CREDENTIAL_FINGERPRINT,
    }),
  });

  await expectStoreError(
    "invalid_response",
    () =>
      store.begin({
        binding: BINDING,
        preparation,
        credential: {
          credentialRevision: SHIPA_TEST_STALE_CREDENTIAL_REVISION,
          credentialFingerprint: SHIPA_TEST_STALE_CREDENTIAL_FINGERPRINT,
        },
        attemptToken: ATTEMPT_ID,
      }),
  );
});

Deno.test("refuses a begin answer that is missing the lease expiry", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const store = createShipaSubmissionStore({ client });
  const preparation = buildPreparation();

  const document = createTestBeginDocument({
    attemptToken: ATTEMPT_ID,
    credentialRevision: CREDENTIAL.credentialRevision,
    credentialFingerprint: CREDENTIAL.credentialFingerprint,
  });
  delete document["lease_expires_at"];
  client.queue({ data: document });

  await expectStoreError(
    "invalid_response",
    () =>
      store.begin({
        binding: BINDING,
        preparation,
        credential: CREDENTIAL,
        attemptToken: ATTEMPT_ID,
      }),
  );
});

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

Deno.test("strips the field and message from a local rejection", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  client.queue({ data: createTestSafeSummaryDocument() });
  const store = createShipaSubmissionStore({ client });

  await store.complete(BINDING, ATTEMPT_ID, {
    outcome: "rejected_local",
    code: "invalid_city",
    field: "destination.city",
    message: "The city must be a nonempty string.",
  });

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_complete");
  assertEquals(client.calls[0].args["_result"], {
    outcome: "rejected_local",
    code: "invalid_city",
  });
});

Deno.test("sends the exact accepted result and returns the safe summary", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  client.queue({ data: createTestSafeSummaryDocument() });
  const store = createShipaSubmissionStore({ client });

  const summary = await store.complete(BINDING, ATTEMPT_ID, {
    outcome: "accepted",
    shipaRef: "SR-2026-0001",
    orderStatus: "Created",
  });

  assertEquals(client.calls[0].args["_result"], {
    outcome: "accepted",
    shipaRef: "SR-2026-0001",
    orderStatus: "Created",
  });
  assertEquals(summary.shipmentId, SHIPA_TEST_SHIPMENT_ID);
  assertEquals(summary.state, "created");
  assertEquals(summary.shipaRef, "SR-2026-0001");
  assertEquals(summary.attemptCount, 1);
  assertEquals(summary.retryCount, 0);
});

Deno.test("refuses an accepted result whose reference the RPC would refuse", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  client.queue({ data: createTestSafeSummaryDocument() });
  const store = createShipaSubmissionStore({ client });

  await expectStoreError(
    "invalid_request",
    () =>
      store.complete(BINDING, ATTEMPT_ID, {
        outcome: "accepted",
        shipaRef: "not a safe reference",
        orderStatus: null,
      }),
  );
  assertEquals(client.calls.length, 0);
});

Deno.test("refuses a safe summary for another shipment", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  client.queue({
    data: createTestSafeSummaryDocument({
      shipmentId: SHIPA_TEST_OTHER_SHIPMENT_ID,
    }),
  });
  const store = createShipaSubmissionStore({ client });

  await expectStoreError(
    "invalid_response",
    () =>
      store.complete(BINDING, ATTEMPT_ID, {
        outcome: "uncertain",
        code: "timeout",
      }),
  );
});

// ---------------------------------------------------------------------------
// The failure mapping
// ---------------------------------------------------------------------------

Deno.test("maps every SQLSTATE to its closed code", async () => {
  const cases: readonly (readonly [string, ShipaSubmissionErrorCode])[] = [
    ["40001", "conflict"],
    ["23505", "conflict"],
    ["40P01", "conflict"],
    ["PGRST202", "upgrade_required"],
    ["P0002", "not_found"],
    ["42501", "forbidden"],
    ["22023", "invalid_request"],
    ["55000", "ineligible"],
    ["PGRST116", "unavailable"],
    ["XX000", "unavailable"],
  ];

  for (const [sqlState, code] of cases) {
    const client = createFakeShipaSubmissionRpcClient();
    client.queue({
      data: null,
      error: {
        code: sqlState,
        message: 'relation "shipments" does not exist',
        details: "synthetic upstream detail",
        hint: "synthetic upstream hint",
      },
    });
    const store = createShipaSubmissionStore({ client });
    await expectStoreError(code, () => store.prepare(BINDING));
    assertEquals(client.calls.length, 1);
  }
});

Deno.test("never repeats a call and never leaks the upstream text", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  client.queue({
    data: null,
    error: {
      code: "22023",
      message: "shipa_invalid_prepared_request",
      details: "synthetic secret ciphertext detail",
    },
  });
  const store = createShipaSubmissionStore({ client });

  const error = await expectStoreError(
    "invalid_request",
    () => store.prepare(BINDING),
  );
  assertEquals(client.calls.length, 1);
  assertEquals(error.message.includes("ciphertext"), false);
  assertEquals(error.message.includes("shipa_invalid"), false);
});

Deno.test("turns a rejected promise into a fixed failure without retrying", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  client.queue({ rejection: new Error("connection reset by peer") });
  const store = createShipaSubmissionStore({ client });

  await expectStoreError("unavailable", () => store.prepare(BINDING));
  assertEquals(client.calls.length, 1);
});
