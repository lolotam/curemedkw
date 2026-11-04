// Behavioural tests for the strict Shipa review request parsers.
//
// The parsers under test are the real production modules, together with the
// shared frozen parcel schema and the shared actor helper. Nothing is mocked:
// a refusal must come from the production rules, not from a test double.
//
// No test in this file reaches the network, reads an environment variable or
// uses a real identifier, key or credential.

import { assertEquals } from "jsr:@std/assert@1.0.19";

import {
  parseShipaReviewActor,
  parseShipaReviewManualRequest,
  parseShipaReviewOrderId,
  parseShipaReviewPreviewRequest,
  parseShipaReviewShipmentId,
  type ShipaReviewParseResult,
} from "../../_shared/shipa-review-validation.ts";
import {
  createTestManualRequest,
  createTestManualRequestWithout,
  createTestPreviewRequest,
  SHIPA_TEST_REVIEW_ACTOR,
  SHIPA_TEST_REVIEW_ACTOR_ID,
  SHIPA_TEST_REVIEW_ACTOR_ID_UPPER,
  SHIPA_TEST_REVIEW_FINGERPRINT,
  SHIPA_TEST_REVIEW_ORDER_ID,
  SHIPA_TEST_REVIEW_OTHER_ORDER_ID,
  SHIPA_TEST_REVIEW_OTHER_SHIPMENT_ID,
  SHIPA_TEST_REVIEW_SHIPMENT_ID,
} from "./shipa-review-fixtures.ts";

// ---------------------------------------------------------------------------
// The helpers
// ---------------------------------------------------------------------------

/** Narrows an accepted answer and fails the test when it was refused. */
function expectAccepted<T>(result: ShipaReviewParseResult<T>): T {
  if (!result.ok) {
    throw new Error("Expected the request to be accepted.");
  }
  return result.value;
}

/** Narrows a refused answer and fails the test when it was accepted. */
function expectRefused<T>(result: ShipaReviewParseResult<T>): void {
  if (result.ok) {
    throw new Error("Expected the request to be refused.");
  }
  assertEquals(result.code, "invalid_request");
}

/** Builds a text of exactly the given number of Unicode code points. */
function codePoints(count: number, character: string): string {
  return character.repeat(count);
}

/** A supplementary-plane character: two UTF-16 units, one code point. */
const SUPPLEMENTARY = String.fromCodePoint(0x1d7d9);

/** An Arabic-Indic digit: one UTF-16 unit, one code point. */
const ARABIC_INDIC = String.fromCodePoint(0x0661);

// ---------------------------------------------------------------------------
// The preview request
// ---------------------------------------------------------------------------

Deno.test("accepts the exact preview request and refuses the rest", () => {
  assertEquals(
    expectAccepted(parseShipaReviewPreviewRequest(
      createTestPreviewRequest(),
    )),
    { environment: "sandbox" },
  );

  assertEquals(
    expectAccepted(parseShipaReviewPreviewRequest(
      createTestPreviewRequest({ environment: "live", overrides: {} }),
    )),
    { environment: "live", overrides: {} },
  );

  for (
    const invalid of [
      null,
      undefined,
      "sandbox",
      42,
      [],
      {},
      { environment: "staging" },
      { environment: "Sandbox" },
      { environment: "sandbox", paid: true },
      { environment: "sandbox", source: "manual" },
      { environment: "sandbox", overrides: [] },
      { environment: "sandbox", overrides: { weightKg: 2 } },
      { environment: "sandbox", overrides: { destination: { paci: "12" } } },
    ]
  ) {
    expectRefused(parseShipaReviewPreviewRequest(invalid));
  }
});

Deno.test("keeps the delivery override values as supplied", () => {
  const value = expectAccepted(parseShipaReviewPreviewRequest(
    createTestPreviewRequest({
      overrides: {
        destination: {
          contactPhone: `${ARABIC_INDIC}${ARABIC_INDIC}${ARABIC_INDIC}`,
          city: "  Hawalli  ",
        },
      },
    }),
  ));

  assertEquals(value.overrides, {
    destination: {
      contactPhone: `${ARABIC_INDIC}${ARABIC_INDIC}${ARABIC_INDIC}`,
      city: "  Hawalli  ",
    },
  });
});

Deno.test("accepts an empty override and an empty destination", () => {
  const value = expectAccepted(parseShipaReviewPreviewRequest(
    createTestPreviewRequest({ overrides: { destination: {} } }),
  ));
  assertEquals(value.overrides, { destination: {} });
});

Deno.test("measures an override value in Unicode code points", () => {
  const atLimit = codePoints(1000, SUPPLEMENTARY);
  const overLimit = codePoints(1001, SUPPLEMENTARY);

  const accepted = expectAccepted(parseShipaReviewPreviewRequest(
    createTestPreviewRequest({ overrides: { destination: { city: atLimit } } }),
  ));
  assertEquals(accepted.overrides?.destination?.city, atLimit);

  expectRefused(parseShipaReviewPreviewRequest(
    createTestPreviewRequest({ overrides: { destination: { city: overLimit } } }),
  ));

  // A member that is not a string is refused whatever its length.
  expectRefused(parseShipaReviewPreviewRequest(
    createTestPreviewRequest({ overrides: { destination: { city: 12 } } }),
  ));
});

// ---------------------------------------------------------------------------
// The parcel override
// ---------------------------------------------------------------------------

Deno.test("accepts the complete parcel shape including its null members", () => {
  const value = expectAccepted(parseShipaReviewPreviewRequest(
    createTestPreviewRequest({
      overrides: { parcel: { count: 1, weightKg: null, dimensionsCm: null } },
    }),
  ));
  assertEquals(
    value.overrides?.parcel,
    {
      count: 1,
      weightKg: null,
      dimensionsCm: null,
    } as const,
  );

  const measured = expectAccepted(parseShipaReviewPreviewRequest(
    createTestPreviewRequest({
      overrides: {
        parcel: {
          count: 1,
          weightKg: 1.5,
          dimensionsCm: { lengthCm: 20, widthCm: 15, heightCm: 10 },
        },
      },
    }),
  ));
  assertEquals(measured.overrides?.parcel?.dimensionsCm, {
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10,
  });
});

Deno.test("refuses a malformed or incomplete parcel", () => {
  for (
    const parcel of [
      { count: 2, weightKg: null, dimensionsCm: null },
      { count: 1, weightKg: 0, dimensionsCm: null },
      { count: 1, weightKg: -1, dimensionsCm: null },
      { count: 1, weightKg: "1.5", dimensionsCm: null },
      { count: 1, weightKg: null },
      { count: 1, dimensionsCm: null },
      {
        count: 1,
        weightKg: null,
        dimensionsCm: { lengthCm: 20, widthCm: 15 },
      },
      {
        count: 1,
        weightKg: null,
        dimensionsCm: { lengthCm: 20, widthCm: 15, heightCm: 10 },
        paci: "12",
      },
      null,
    ]
  ) {
    expectRefused(parseShipaReviewPreviewRequest(
      createTestPreviewRequest({ overrides: { parcel } }),
    ));
  }
});

// ---------------------------------------------------------------------------
// The manual request
// ---------------------------------------------------------------------------

Deno.test("accepts the exact manual request", () => {
  const value = expectAccepted(parseShipaReviewManualRequest(
    createTestManualRequest(),
  ));
  assertEquals(value.environment, "sandbox");
  assertEquals(value.overrides, {});
  assertEquals(value.expectedSettingsRevision, 7);
  assertEquals(value.expectedInputFingerprint, SHIPA_TEST_REVIEW_FINGERPRINT);
  assertEquals(value.acknowledgePricing, false);
  assertEquals(value.packedConfirmed, true);
});

Deno.test("refuses a manual request without an overrides member", () => {
  expectRefused(parseShipaReviewManualRequest(
    createTestManualRequestWithout("overrides"),
  ));
});

Deno.test("refuses a manual request that does not confirm the packing", () => {
  expectRefused(parseShipaReviewManualRequest(
    createTestManualRequest({ packedConfirmed: false }),
  ));
  expectRefused(parseShipaReviewManualRequest(
    createTestManualRequest({ packedConfirmed: "true" }),
  ));
  expectRefused(parseShipaReviewManualRequest(
    createTestManualRequestWithout("packedConfirmed"),
  ));
});

Deno.test("requires an explicit boolean pricing acknowledgement", () => {
  const acknowledged = expectAccepted(parseShipaReviewManualRequest(
    createTestManualRequest({ acknowledgePricing: true }),
  ));
  assertEquals(acknowledged.acknowledgePricing, true);

  for (const invalid of ["true", 1, 0, null, {}]) {
    expectRefused(parseShipaReviewManualRequest(
      createTestManualRequest({ acknowledgePricing: invalid }),
    ));
  }
  expectRefused(parseShipaReviewManualRequest(
    createTestManualRequestWithout("acknowledgePricing"),
  ));
});

Deno.test("bounds the expected revision to the database integer range", () => {
  for (const revision of [0, 2147483647]) {
    const value = expectAccepted(parseShipaReviewManualRequest(
      createTestManualRequest({ expectedSettingsRevision: revision }),
    ));
    assertEquals(value.expectedSettingsRevision, revision);
  }

  for (const revision of [-1, 2147483648, 1.5, "7", null]) {
    expectRefused(parseShipaReviewManualRequest(
      createTestManualRequest({ expectedSettingsRevision: revision }),
    ));
  }
});

Deno.test("requires a 64 character lower-case hex fingerprint", () => {
  for (
    const invalid of [
      SHIPA_TEST_REVIEW_FINGERPRINT.toUpperCase(),
      SHIPA_TEST_REVIEW_FINGERPRINT.slice(0, 63),
      `${SHIPA_TEST_REVIEW_FINGERPRINT}0`,
      "z".repeat(64),
      123,
    ]
  ) {
    expectRefused(parseShipaReviewManualRequest(
      createTestManualRequest({ expectedInputFingerprint: invalid }),
    ));
  }
});

Deno.test("bounds the review reason like PostgreSQL btrim does", () => {
  const accepted = expectAccepted(parseShipaReviewManualRequest(
    createTestManualRequest({ reviewReason: "  packed and checked  " }),
  ));
  // The reason is measured after the ASCII spaces are removed, but the
  // reviewer's own words are never rewritten here.
  assertEquals(accepted.reviewReason, "  packed and checked  ");

  const atLimit = expectAccepted(parseShipaReviewManualRequest(
    createTestManualRequest({ reviewReason: codePoints(1000, SUPPLEMENTARY) }),
  ));
  assertEquals(atLimit.reviewReason.length, 2000);

  for (
    const invalid of [
      "",
      "   ",
      codePoints(1001, SUPPLEMENTARY),
      12,
      null,
    ]
  ) {
    expectRefused(parseShipaReviewManualRequest(
      createTestManualRequest({ reviewReason: invalid }),
    ));
  }
});

Deno.test("refuses a manual request that carries an unknown member", () => {
  for (
    const invalid of [
      { paid: true },
      { provider: "shipa" },
      { endpoint: "https://example.invalid" },
      { credential: "secret" },
      { actor: "synthetic-actor" },
      { proof: "synthetic-proof" },
    ]
  ) {
    expectRefused(parseShipaReviewManualRequest(
      createTestManualRequest(invalid),
    ));
  }
});

// ---------------------------------------------------------------------------
// The actor
// ---------------------------------------------------------------------------

Deno.test("accepts only the shared internal actor descriptor", () => {
  const actor = expectAccepted(parseShipaReviewActor(SHIPA_TEST_REVIEW_ACTOR));
  assertEquals(actor.userId, SHIPA_TEST_REVIEW_ACTOR_ID);

  const upper = expectAccepted(parseShipaReviewActor({
    userId: SHIPA_TEST_REVIEW_ACTOR_ID_UPPER,
  }));
  assertEquals(upper.userId, SHIPA_TEST_REVIEW_ACTOR_ID);

  for (
    const invalid of [
      null,
      undefined,
      "synthetic-actor",
      {},
      { userId: null },
      { userId: "not-a-uuid" },
      { userId: SHIPA_TEST_REVIEW_ACTOR_ID, role: "admin" },
      { userId: SHIPA_TEST_REVIEW_ACTOR_ID, session: "synthetic-session" },
    ]
  ) {
    expectRefused(parseShipaReviewActor(invalid));
  }
});

// ---------------------------------------------------------------------------
// The identifiers
// ---------------------------------------------------------------------------

Deno.test("accepts an order and a shipment identifier in lower case", () => {
  assertEquals(
    expectAccepted(parseShipaReviewOrderId(SHIPA_TEST_REVIEW_ORDER_ID)),
    SHIPA_TEST_REVIEW_ORDER_ID,
  );
  assertEquals(
    expectAccepted(parseShipaReviewOrderId(SHIPA_TEST_REVIEW_OTHER_ORDER_ID)),
    SHIPA_TEST_REVIEW_OTHER_ORDER_ID,
  );
  assertEquals(
    expectAccepted(parseShipaReviewShipmentId(SHIPA_TEST_REVIEW_SHIPMENT_ID)),
    SHIPA_TEST_REVIEW_SHIPMENT_ID,
  );
  assertEquals(
    expectAccepted(
      parseShipaReviewShipmentId(SHIPA_TEST_REVIEW_OTHER_SHIPMENT_ID),
    ),
    SHIPA_TEST_REVIEW_OTHER_SHIPMENT_ID,
  );

  for (const invalid of [null, undefined, "", "not-a-uuid", 42, {}, []]) {
    expectRefused(parseShipaReviewOrderId(invalid));
    expectRefused(parseShipaReviewShipmentId(invalid));
  }
});
