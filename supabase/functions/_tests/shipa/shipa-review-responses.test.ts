// Behavioural tests for the strict Shipa review response parsers and for the
// SQL-state mapping.
//
// The parsers under test are the real production modules, and they reuse the
// real shared safe summary parser. Nothing is mocked: an unusable answer must
// be refused by the production rules, not by a test double.
//
// No test in this file reaches the network, reads an environment variable or
// uses a real identifier, key or credential.

import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";

import { ShipaReviewError } from "../../_shared/shipa-review-contract.ts";
import {
  mapShipaReviewSqlError,
  parseShipaReviewIntegrityResult,
  parseShipaReviewManualSummary,
  parseShipaReviewShipmentRead,
} from "../../_shared/shipa-review-responses.ts";
import {
  createTestIntegrityDocument,
  createTestReadDocument,
  createTestSqlError,
  createTestSummaryDocument,
  SHIPA_TEST_REVIEW_CUSTOMER_REF,
  SHIPA_TEST_REVIEW_FINGERPRINT,
  SHIPA_TEST_REVIEW_ORDER_ID,
  SHIPA_TEST_REVIEW_REVISION,
  SHIPA_TEST_REVIEW_SHIPA_REF,
  SHIPA_TEST_REVIEW_SHIPMENT_ID,
} from "./shipa-review-fixtures.ts";

// ---------------------------------------------------------------------------
// The helpers
// ---------------------------------------------------------------------------

/** Asserts that an answer is refused as an unusable response. */
function expectInvalidResponse(action: () => unknown): ShipaReviewError {
  const error = assertThrows(action, ShipaReviewError);
  assertEquals(error.code, "invalid_response");
  return error;
}

// ---------------------------------------------------------------------------
// The integrity document
// ---------------------------------------------------------------------------

Deno.test("maps the exact integrity document onto the safe projection", () => {
  const result = parseShipaReviewIntegrityResult(createTestIntegrityDocument({
    accepted: false,
    reasons: ["catalog_price_mismatch", "coupon_requires_review"],
  }));

  assertEquals(result.accepted, false);
  assertEquals(
    result.reasons,
    [
      "catalog_price_mismatch",
      "coupon_requires_review",
    ] as const,
  );
  assertEquals(result.inputFingerprint, SHIPA_TEST_REVIEW_FINGERPRINT);
  assertEquals(result.settingsRevision, SHIPA_TEST_REVIEW_REVISION);
});

Deno.test("refuses an integrity answer that contradicts its reasons", () => {
  expectInvalidResponse(() =>
    parseShipaReviewIntegrityResult(
      createTestIntegrityDocument({
        accepted: true,
        reasons: ["catalog_missing"],
      }),
    )
  );

  expectInvalidResponse(() =>
    parseShipaReviewIntegrityResult(
      createTestIntegrityDocument({ accepted: false, reasons: [] }),
    )
  );
});

Deno.test("refuses an unknown or duplicated integrity reason", () => {
  expectInvalidResponse(() =>
    parseShipaReviewIntegrityResult(
      createTestIntegrityDocument({
        accepted: false,
        reasons: ["not_a_real_reason"],
      }),
    )
  );

  expectInvalidResponse(() =>
    parseShipaReviewIntegrityResult(
      createTestIntegrityDocument({
        accepted: false,
        reasons: ["catalog_missing", "catalog_missing"],
      }),
    )
  );
});

Deno.test("refuses an integrity answer carrying an authority member", () => {
  for (
    const extra of [
      { paid: true },
      { snapshot: { items: [] } },
      { provider: "shipa" },
      { credential: "secret" },
      { shipa_ref: "SR-2026-0001" },
    ]
  ) {
    expectInvalidResponse(() =>
      parseShipaReviewIntegrityResult(
        createTestIntegrityDocument({ extra }),
      )
    );
  }
});

Deno.test("refuses an unusable fingerprint or revision", () => {
  for (
    const fingerprint of [
      SHIPA_TEST_REVIEW_FINGERPRINT.toUpperCase(),
      SHIPA_TEST_REVIEW_FINGERPRINT.slice(0, 63),
      "not-a-fingerprint",
      null,
    ]
  ) {
    expectInvalidResponse(() =>
      parseShipaReviewIntegrityResult(
        { ...createTestIntegrityDocument(), input_fingerprint: fingerprint },
      )
    );
  }

  for (const revision of [-1, 2147483648, 1.5, "7"]) {
    expectInvalidResponse(() =>
      parseShipaReviewIntegrityResult(
        { ...createTestIntegrityDocument(), settings_revision: revision },
      )
    );
  }
});

// ---------------------------------------------------------------------------
// The manual summary
// ---------------------------------------------------------------------------

Deno.test("accepts an unattempted queued manual answer", () => {
  const summary = parseShipaReviewManualSummary(createTestSummaryDocument());
  assertEquals(summary.shipmentId, SHIPA_TEST_REVIEW_SHIPMENT_ID);
  assertEquals(summary.state, "queued");
  assertEquals(summary.attemptCount, 0);
  assertEquals(summary.shipaRef, null);
  assertEquals(summary.retryAt, null);
});

Deno.test("refuses a manual answer that describes an attempt or a booking", () => {
  for (
    const document of [
      createTestSummaryDocument({
        state: "created",
        shipaRef: SHIPA_TEST_REVIEW_SHIPA_REF,
        attemptCount: 1,
      }),
      createTestSummaryDocument({ state: "submitting", attemptCount: 1 }),
      createTestSummaryDocument({ state: "unknown", attemptCount: 1 }),
      createTestSummaryDocument({ state: "needs_review" }),
      createTestSummaryDocument({ state: "rejected" }),
      createTestSummaryDocument({
        shipaRef: SHIPA_TEST_REVIEW_SHIPA_REF,
      }),
      createTestSummaryDocument({ attemptCount: 1 }),
      createTestSummaryDocument({ retryAt: "2026-11-04T00:20:00.000Z" }),
    ]
  ) {
    expectInvalidResponse(() => parseShipaReviewManualSummary(document));
  }
});

Deno.test("refuses a manual answer that carries an extra member", () => {
  expectInvalidResponse(() =>
    parseShipaReviewManualSummary(
      createTestSummaryDocument({ extra: { payload: { items: [] } } }),
    )
  );
});

// ---------------------------------------------------------------------------
// The targeted read
// ---------------------------------------------------------------------------

Deno.test("maps the exact safe read onto the safe projection", () => {
  const read = parseShipaReviewShipmentRead(
    createTestReadDocument(),
    SHIPA_TEST_REVIEW_SHIPMENT_ID,
  );

  assertEquals(read.shipmentId, SHIPA_TEST_REVIEW_SHIPMENT_ID);
  assertEquals(read.state, "queued");
  assertEquals(read.orderId, SHIPA_TEST_REVIEW_ORDER_ID);
  assertEquals(read.environment, "sandbox");
  assertEquals(read.source, "manual");
  assertEquals(read.customerRef, SHIPA_TEST_REVIEW_CUSTOMER_REF);
  assertEquals(read.createdAt, "2026-11-04T00:12:57.967Z");
  assertEquals(read.reviewedFingerprint, SHIPA_TEST_REVIEW_FINGERPRINT);
  assertEquals(read.inputFingerprint, SHIPA_TEST_REVIEW_FINGERPRINT);
});

Deno.test("keeps the null metadata of a safe read", () => {
  const read = parseShipaReviewShipmentRead(
    createTestReadDocument({
      reviewedFingerprint: null,
      inputFingerprint: null,
      shipaRef: null,
      providerStatus: null,
      retryAt: null,
      lastErrorCode: null,
    }),
    SHIPA_TEST_REVIEW_SHIPMENT_ID,
  );

  assertEquals(read.reviewedFingerprint, null);
  assertEquals(read.inputFingerprint, null);
  assertEquals(read.shipaRef, null);
  assertEquals(read.providerStatus, null);
  assertEquals(read.retryAt, null);
  assertEquals(read.lastErrorCode, null);
});

Deno.test("refuses a safe read carrying a raw payload or credential", () => {
  for (
    const extra of [
      { payload: { items: [] } },
      { payload_hash: "a".repeat(64) },
      { api_key: "fake" },
      { attempt_token: "fake" },
      { draft: { customerRef: "CM-1" } },
    ]
  ) {
    expectInvalidResponse(() =>
      parseShipaReviewShipmentRead(
        createTestReadDocument({ extra }),
        SHIPA_TEST_REVIEW_SHIPMENT_ID,
      )
    );
  }
});

Deno.test("refuses a safe read that belongs to another shipment", () => {
  expectInvalidResponse(() =>
    parseShipaReviewShipmentRead(
      createTestReadDocument({
        shipmentId: "0a7c1e52-4d3b-4a6f-9c18-3b5e7d2f6a90",
      }),
      SHIPA_TEST_REVIEW_SHIPMENT_ID,
    )
  );
});

Deno.test("refuses a safe read with an unusable member", () => {
  const cases = [
    { order_id: "not-a-uuid" },
    { environment: "staging" },
    { source: "scheduled" },
    { customer_ref: "" },
    { customer_ref: null },
    { created_at: "2026-13-45T99:99:99Z" },
    { reviewed_fingerprint: "not-a-fingerprint" },
    { input_fingerprint: SHIPA_TEST_REVIEW_FINGERPRINT.toUpperCase() },
    { attempt_count: 5 },
    { retry_count: 4 },
    { updated_at: "not-a-timestamp" },
  ];
  for (const options of cases) {
    expectInvalidResponse(() =>
      parseShipaReviewShipmentRead(
        { ...createTestReadDocument(), ...options },
        SHIPA_TEST_REVIEW_SHIPMENT_ID,
      )
    );
  }
});

Deno.test("refuses a safe read whose state contradicts its metadata", () => {
  expectInvalidResponse(() =>
    parseShipaReviewShipmentRead(
      createTestReadDocument({
        state: "created",
        attemptCount: 1,
        shipaRef: null,
      }),
      SHIPA_TEST_REVIEW_SHIPMENT_ID,
    )
  );

  expectInvalidResponse(() =>
    parseShipaReviewShipmentRead(
      createTestReadDocument({
        state: "unknown",
        attemptCount: 1,
        retryAt: "2026-11-04T00:20:00.000Z",
      }),
      SHIPA_TEST_REVIEW_SHIPMENT_ID,
    )
  );
});

Deno.test("accepts SQL merchant references up to 64 characters and refuses longer references", () => {
  const valid = { ...createTestReadDocument(), customer_ref: "C".repeat(64) };
  assertEquals(
    parseShipaReviewShipmentRead(valid, SHIPA_TEST_REVIEW_SHIPMENT_ID).customerRef,
    "C".repeat(64),
  );
  expectInvalidResponse(() =>
    parseShipaReviewShipmentRead(
      { ...valid, customer_ref: "C".repeat(65) },
      SHIPA_TEST_REVIEW_SHIPMENT_ID,
    )
  );
});

// ---------------------------------------------------------------------------
// The SQL-state mapping
// ---------------------------------------------------------------------------

Deno.test("maps the known SQL states onto the closed code set", () => {
  const cases = [
    { code: "22023", expected: "invalid_request" },
    { code: "42501", expected: "forbidden" },
    { code: "40001", expected: "conflict" },
    { code: "23505", expected: "conflict" },
    { code: "40P01", expected: "conflict" },
    { code: "P0002", expected: "not_found" },
    { code: "PGRST202", expected: "upgrade_required" },
    { code: "57014", expected: "unavailable" },
    { code: "XX000", expected: "unavailable" },
  ] as const;

  for (const scenario of cases) {
    const error = mapShipaReviewSqlError(
      createTestSqlError(scenario.code, "synthetic upstream message"),
    );
    assertEquals(error.code, scenario.expected);
  }
});

Deno.test("classifies only the known 55000 tokens", () => {
  const reconciliation = mapShipaReviewSqlError(
    createTestSqlError(
      "55000",
      "shipa_possible_dispatch_requires_reconciliation",
    ),
  );
  assertEquals(reconciliation.code, "needs_reconciliation");

  for (
    const token of [
      "shipa_ordering_disabled",
      "shipa_integration_ineligible",
      "shared_payment_activation_required",
      "shipa_verified_paid_receipt_required",
      "shipa_paid_items_changed",
      "shipa_integrity_requires_correction",
    ]
  ) {
    const error = mapShipaReviewSqlError(createTestSqlError("55000", token));
    assertEquals(error.code, "not_eligible");
  }

  for (
    const token of [
      "shipa_recorded_integration_changed",
      "shipa_attempt_not_inflight",
      "some_other_upstream_reason",
    ]
  ) {
    const error = mapShipaReviewSqlError(createTestSqlError("55000", token));
    assertEquals(error.code, "unavailable");
  }
});

Deno.test("never exposes the upstream SQL text", () => {
  const error = mapShipaReviewSqlError(
    createTestSqlError("55000", "shipa_integration_ineligible"),
  );
  assertEquals(error.message.includes("shipa_integration_ineligible"), false);
  assertEquals(error.message.includes("synthetic upstream details"), false);
  assertEquals(error.message.includes("synthetic upstream hint"), false);
  assertEquals("cause" in error, false);

  const transport = mapShipaReviewSqlError(new Error("connection reset"));
  assertEquals(transport.code, "unavailable");
  assertEquals(transport.message.includes("connection reset"), false);
});
