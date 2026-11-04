// Behavioural tests for the internal Shipa review store.
//
// The real store, the real strict request parsers, the real safe summary
// parser and the real SQL-state mapping do the work here. Only the database
// boundary is faked, and the fake is a transport fixture: it proves which call
// was made and with which arguments, not that a database behaves that way.
//
// No test in this file reaches the network, reads an environment variable or
// uses a real credential, key or identifier.

import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";

import {
  ShipaReviewError,
  type ShipaReviewErrorCode,
  type ShipaReviewPreviewInput,
} from "../../_shared/shipa-review-contract.ts";
import { createShipaReviewStore } from "../../_shared/shipa-review-store.ts";
import {
  createFakeShipaReviewRpcClient,
  createTestIntegrityDocument,
  createTestManualRequest,
  createTestPreviewRequest,
  createTestReadDocument,
  createTestSqlError,
  createTestSummaryDocument,
  SHIPA_TEST_REVIEW_ACTOR,
  SHIPA_TEST_REVIEW_ACTOR_ID,
  SHIPA_TEST_REVIEW_ACTOR_ID_UPPER,
  SHIPA_TEST_REVIEW_CUSTOMER_REF,
  SHIPA_TEST_REVIEW_FINGERPRINT,
  SHIPA_TEST_REVIEW_ORDER_ID,
  SHIPA_TEST_REVIEW_OTHER_SHIPMENT_ID,
  SHIPA_TEST_REVIEW_REVISION,
  SHIPA_TEST_REVIEW_SHIPA_REF,
  SHIPA_TEST_REVIEW_SHIPMENT_ID,
} from "./shipa-review-fixtures.ts";

// ---------------------------------------------------------------------------
// The helpers
// ---------------------------------------------------------------------------

/** Asserts that a call is refused with the expected closed code. */
async function expectStoreError(
  code: ShipaReviewErrorCode,
  action: () => Promise<unknown>,
): Promise<ShipaReviewError> {
  const error = await assertRejects(action, ShipaReviewError);
  assertEquals(error.code, code);
  return error;
}

/**
 * Builds a call input that carries one extra member.
 *
 * The extra member is what the boundary has to refuse: the store strips
 * nothing, so such a call must fail before it reaches the database.
 */
function taintedPreviewInput(
  extra: Record<string, unknown>,
): ShipaReviewPreviewInput {
  return Object.assign(
    {
      actor: SHIPA_TEST_REVIEW_ACTOR,
      orderId: SHIPA_TEST_REVIEW_ORDER_ID,
      request: createTestPreviewRequest(),
    },
    extra,
  );
}

// ---------------------------------------------------------------------------
// The three calls
// ---------------------------------------------------------------------------

Deno.test("previews with one call and no actor argument", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({ data: createTestIntegrityDocument() });
  const store = createShipaReviewStore({ client });

  const result = await store.preview({
    actor: SHIPA_TEST_REVIEW_ACTOR,
    orderId: SHIPA_TEST_REVIEW_ORDER_ID,
    request: createTestPreviewRequest(),
  });

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_check_integrity");
  assertEquals(client.calls[0].args, {
    _order_id: SHIPA_TEST_REVIEW_ORDER_ID,
    _review_snapshot: { environment: "sandbox" },
  });
  // The integrity RPC has no actor parameter, so none is invented for it.
  assertEquals(
    JSON.stringify(client.calls[0].args).includes(SHIPA_TEST_REVIEW_ACTOR_ID),
    false,
  );

  assertEquals(result.accepted, true);
  assertEquals(result.reasons, []);
  assertEquals(result.inputFingerprint, SHIPA_TEST_REVIEW_FINGERPRINT);
  assertEquals(result.settingsRevision, SHIPA_TEST_REVIEW_REVISION);
});

Deno.test("carries the overrides into the review snapshot", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({ data: createTestIntegrityDocument() });
  const store = createShipaReviewStore({ client });

  await store.preview({
    actor: SHIPA_TEST_REVIEW_ACTOR,
    orderId: SHIPA_TEST_REVIEW_ORDER_ID,
    request: createTestPreviewRequest({
      overrides: { destination: { city: "Hawalli" } },
    }),
  });

  assertEquals(client.calls[0].args["_review_snapshot"], {
    environment: "sandbox",
    overrides: { destination: { city: "Hawalli" } },
  });
});

Deno.test("requests a manual review with one call and the actor", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({ data: createTestSummaryDocument() });
  const store = createShipaReviewStore({ client });

  const summary = await store.requestManual({
    actor: { userId: SHIPA_TEST_REVIEW_ACTOR_ID_UPPER },
    orderId: SHIPA_TEST_REVIEW_ORDER_ID,
    request: createTestManualRequest(),
  });

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_request_manual");
  assertEquals(client.calls[0].args, {
    _order_id: SHIPA_TEST_REVIEW_ORDER_ID,
    _request: {
      environment: "sandbox",
      overrides: {},
      expectedSettingsRevision: SHIPA_TEST_REVIEW_REVISION,
      expectedInputFingerprint: SHIPA_TEST_REVIEW_FINGERPRINT,
      reviewReason: "Synthetic review reason",
      acknowledgePricing: false,
      packedConfirmed: true,
    },
    // The actor id is copied from the verified descriptor and lowercased.
    _actor_id: SHIPA_TEST_REVIEW_ACTOR_ID,
  });

  assertEquals(summary.state, "queued");
  assertEquals(summary.attemptCount, 0);
  assertEquals(summary.shipaRef, null);
});

Deno.test("reads one shipment with one call and a SQL null", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({ data: null });
  const store = createShipaReviewStore({ client });

  const read = await store.readShipment({
    actor: SHIPA_TEST_REVIEW_ACTOR,
    shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
  });

  assertEquals(read, null);
  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_read_shipment");
  assertEquals(client.calls[0].args, {
    _shipment_id: SHIPA_TEST_REVIEW_SHIPMENT_ID,
    _actor_id: SHIPA_TEST_REVIEW_ACTOR_ID,
  });
});

Deno.test("maps the full safe read envelope", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({ data: createTestReadDocument() });
  const store = createShipaReviewStore({ client });

  const read = await store.readShipment({
    actor: SHIPA_TEST_REVIEW_ACTOR,
    shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
  });

  assertEquals(read?.shipmentId, SHIPA_TEST_REVIEW_SHIPMENT_ID);
  assertEquals(read?.state, "queued");
  assertEquals(read?.orderId, SHIPA_TEST_REVIEW_ORDER_ID);
  assertEquals(read?.environment, "sandbox");
  assertEquals(read?.source, "manual");
  assertEquals(read?.customerRef, SHIPA_TEST_REVIEW_CUSTOMER_REF);
  assertEquals(read?.reviewedFingerprint, SHIPA_TEST_REVIEW_FINGERPRINT);
});

// ---------------------------------------------------------------------------
// The refusals before any call
// ---------------------------------------------------------------------------

Deno.test("refuses a missing or malformed actor before any call", async () => {
  const client = createFakeShipaReviewRpcClient();
  const store = createShipaReviewStore({ client });

  const malformed = [
    undefined,
    null,
    "synthetic-actor",
    {},
    { userId: null },
    { userId: "not-a-uuid" },
    { userId: SHIPA_TEST_REVIEW_ACTOR_ID, role: "admin" },
    { userId: SHIPA_TEST_REVIEW_ACTOR_ID, session: "synthetic-session" },
  ];

  for (const actor of malformed) {
    await expectStoreError("invalid_request", () =>
      store.preview({
        actor,
        orderId: SHIPA_TEST_REVIEW_ORDER_ID,
        request: createTestPreviewRequest(),
      }));
    await expectStoreError("invalid_request", () =>
      store.requestManual({
        actor,
        orderId: SHIPA_TEST_REVIEW_ORDER_ID,
        request: createTestManualRequest(),
      }));
    await expectStoreError("invalid_request", () =>
      store.readShipment({
        actor,
        shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
      }));
  }

  assertEquals(client.calls.length, 0);
});

Deno.test("refuses an injected authority member before any call", async () => {
  const client = createFakeShipaReviewRpcClient();
  const store = createShipaReviewStore({ client });

  for (
    const extra of [
      { paid: true },
      { proof: "synthetic-proof" },
      { provider: "shipa" },
      { endpoint: "https://example.invalid" },
      { credential: "synthetic-credential" },
      { actor: "synthetic-actor" },
    ]
  ) {
    await expectStoreError("invalid_request", () => store.preview(taintedPreviewInput(extra)));
  }

  assertEquals(client.calls.length, 0);
});

Deno.test("refuses an unknown request member before any call", async () => {
  const client = createFakeShipaReviewRpcClient();
  const store = createShipaReviewStore({ client });

  for (
    const extra of [
      { paid: true },
      { apiKey: "fake" },
      { source: "manual" },
      { endpoint: "https://example.invalid" },
      { retryCount: 2 },
    ]
  ) {
    await expectStoreError("invalid_request", () =>
      store.preview({
        actor: SHIPA_TEST_REVIEW_ACTOR,
        orderId: SHIPA_TEST_REVIEW_ORDER_ID,
        request: createTestPreviewRequest(extra),
      }));
    await expectStoreError("invalid_request", () =>
      store.requestManual({
        actor: SHIPA_TEST_REVIEW_ACTOR,
        orderId: SHIPA_TEST_REVIEW_ORDER_ID,
        request: createTestManualRequest(extra),
      }));
  }

  assertEquals(client.calls.length, 0);
});

Deno.test("refuses a malformed identifier before any call", async () => {
  const client = createFakeShipaReviewRpcClient();
  const store = createShipaReviewStore({ client });

  for (const identifier of [null, undefined, "", "not-a-uuid", 42]) {
    await expectStoreError("invalid_request", () =>
      store.preview({
        actor: SHIPA_TEST_REVIEW_ACTOR,
        orderId: identifier,
        request: createTestPreviewRequest(),
      }));
    await expectStoreError("invalid_request", () =>
      store.requestManual({
        actor: SHIPA_TEST_REVIEW_ACTOR,
        orderId: identifier,
        request: createTestManualRequest(),
      }));
    await expectStoreError("invalid_request", () =>
      store.readShipment({
        actor: SHIPA_TEST_REVIEW_ACTOR,
        shipmentId: identifier,
      }));
  }

  assertEquals(client.calls.length, 0);
});

// ---------------------------------------------------------------------------
// The failure mapping at the boundary
// ---------------------------------------------------------------------------

Deno.test("maps a stale revision to a conflict, without retrying", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({
    error: createTestSqlError("40001", "shipa_settings_changed"),
  });
  const store = createShipaReviewStore({ client });

  await expectStoreError("conflict", () =>
    store.requestManual({
      actor: SHIPA_TEST_REVIEW_ACTOR,
      orderId: SHIPA_TEST_REVIEW_ORDER_ID,
      request: createTestManualRequest(),
    }));

  assertEquals(client.calls.length, 1);
});

Deno.test("maps the known ineligibility tokens without retrying", async () => {
  const cases = [
    {
      reason: "shipa_possible_dispatch_requires_reconciliation",
      code: "needs_reconciliation",
    },
    { reason: "shipa_integration_ineligible", code: "not_eligible" },
    { reason: "shipa_verified_paid_receipt_required", code: "not_eligible" },
    { reason: "shipa_integrity_requires_correction", code: "not_eligible" },
    { reason: "some_unknown_upstream_reason", code: "unavailable" },
  ] as const;

  for (const scenario of cases) {
    const client = createFakeShipaReviewRpcClient();
    client.queue({ error: createTestSqlError("55000", scenario.reason) });
    const store = createShipaReviewStore({ client });

    await expectStoreError(scenario.code, () =>
      store.requestManual({
        actor: SHIPA_TEST_REVIEW_ACTOR,
        orderId: SHIPA_TEST_REVIEW_ORDER_ID,
        request: createTestManualRequest(),
      }));

    assertEquals(client.calls.length, 1);
  }
});

Deno.test("refuses a transport rejection as unavailable", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({ rejection: new Error("connection reset by peer") });
  const store = createShipaReviewStore({ client });

  const error = await expectStoreError("unavailable", () =>
    store.preview({
      actor: SHIPA_TEST_REVIEW_ACTOR,
      orderId: SHIPA_TEST_REVIEW_ORDER_ID,
      request: createTestPreviewRequest(),
    }));

  assertEquals(error.message.includes("connection reset by peer"), false);
  assertEquals(client.calls.length, 1);
});

Deno.test("a rejected RPC promise cannot claim a definitive SQL refusal", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({ rejection: { code: "40001", message: "fake transport detail" } });
  const store = createShipaReviewStore({ client });
  const error = await expectStoreError("unavailable", () =>
    store.requestManual({
      actor: SHIPA_TEST_REVIEW_ACTOR,
      orderId: SHIPA_TEST_REVIEW_ORDER_ID,
      request: createTestManualRequest(),
    }));
  assertEquals(client.calls.length, 1);
  assertEquals(error.message.includes("fake transport detail"), false);
});

Deno.test("refuses an unusable SDK envelope", async () => {
  const store = createShipaReviewStore({
    client: { rpc: () => Promise.resolve({ status: 500 }) },
  });

  await expectStoreError("invalid_response", () =>
    store.preview({
      actor: SHIPA_TEST_REVIEW_ACTOR,
      orderId: SHIPA_TEST_REVIEW_ORDER_ID,
      request: createTestPreviewRequest(),
    }));
});

Deno.test("refuses a self-contradictory answer", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({
    data: createTestIntegrityDocument({
      accepted: true,
      reasons: ["catalog_missing"],
    }),
  });
  const store = createShipaReviewStore({ client });

  await expectStoreError("invalid_response", () =>
    store.preview({
      actor: SHIPA_TEST_REVIEW_ACTOR,
      orderId: SHIPA_TEST_REVIEW_ORDER_ID,
      request: createTestPreviewRequest(),
    }));

  assertEquals(client.calls.length, 1);
});

Deno.test("refuses a manual answer that describes a booking", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({
    data: createTestSummaryDocument({
      state: "created",
      shipaRef: SHIPA_TEST_REVIEW_SHIPA_REF,
      attemptCount: 1,
    }),
  });
  const store = createShipaReviewStore({ client });

  await expectStoreError("invalid_response", () =>
    store.requestManual({
      actor: SHIPA_TEST_REVIEW_ACTOR,
      orderId: SHIPA_TEST_REVIEW_ORDER_ID,
      request: createTestManualRequest(),
    }));

  assertEquals(client.calls.length, 1);
});

Deno.test("refuses a read that belongs to another shipment", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({
    data: createTestReadDocument({
      shipmentId: SHIPA_TEST_REVIEW_OTHER_SHIPMENT_ID,
    }),
  });
  const store = createShipaReviewStore({ client });

  await expectStoreError("invalid_response", () =>
    store.readShipment({
      actor: SHIPA_TEST_REVIEW_ACTOR,
      shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
    }));
});

// ---------------------------------------------------------------------------
// The observation of an in-flight shipment
// ---------------------------------------------------------------------------

Deno.test("preserves a submitting-to-unknown observation", async () => {
  const client = createFakeShipaReviewRpcClient();
  client.queue({
    data: createTestReadDocument({ state: "submitting", attemptCount: 1 }),
  });
  client.queue({
    data: createTestReadDocument({
      state: "unknown",
      attemptCount: 1,
      lastErrorCode: "timeout",
    }),
  });
  const store = createShipaReviewStore({ client });

  const inFlight = await store.readShipment({
    actor: SHIPA_TEST_REVIEW_ACTOR,
    shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
  });
  assertEquals(inFlight?.state, "submitting");
  assertEquals(inFlight?.attemptCount, 1);

  const expired = await store.readShipment({
    actor: SHIPA_TEST_REVIEW_ACTOR,
    shipmentId: SHIPA_TEST_REVIEW_SHIPMENT_ID,
  });
  assertEquals(expired?.state, "unknown");
  assertEquals(expired?.lastErrorCode, "timeout");
  // An unknown outcome carries no retry time and no review authority.
  assertEquals(expired?.retryAt, null);
  assertEquals(expired?.shipaRef, null);

  // Each read is exactly one targeted call: the store never repeats a
  // request to resolve an unknown outcome.
  assertEquals(client.calls.length, 2);
  assertEquals(client.calls[0].fn, "shipa_read_shipment");
  assertEquals(client.calls[1].fn, "shipa_read_shipment");
});
