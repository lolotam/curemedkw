// Synthetic fixtures for the Shipa review store, response and request tests.
//
// Everything in this file is fabricated. The order, shipment, actor and
// merchant-reference ids are made-up UUIDs, the fingerprints are invented
// strings and the SQL errors carry invented text. No real id, key, credential,
// customer address, account value or personal data exists anywhere below.
//
// Only the SDK boundary is faked. The fake records every call and replays a
// queued outcome; the strict request parsers, the shared parcel schema, the
// shared safe summary parser, the SQL-state mapping and the store under test
// are the real production modules.

import type { ShipaReviewRpcClient } from "../../_shared/shipa-review-contract.ts";

// ---------------------------------------------------------------------------
// Synthetic identifiers and values
// ---------------------------------------------------------------------------

/** A made-up order id. */
export const SHIPA_TEST_REVIEW_ORDER_ID = "b3f5c9a1-7d24-4e68-9c05-1a2b3c4d5e6f";

/** A second made-up order id. */
export const SHIPA_TEST_REVIEW_OTHER_ORDER_ID = "c4e6d8b2-8e35-4f79-ad16-2b3c4d5e6f70";

/** A made-up shipment id. */
export const SHIPA_TEST_REVIEW_SHIPMENT_ID = "6f1c7a3e-8b52-4d19-9f0a-2c7e5b8d1a44";

/** A second made-up shipment id. */
export const SHIPA_TEST_REVIEW_OTHER_SHIPMENT_ID = "0a7c1e52-4d3b-4a6f-9c18-3b5e7d2f6a90";

/** A made-up administrator id. */
export const SHIPA_TEST_REVIEW_ACTOR_ID = "9c858901-8a57-4791-81fe-4c455b099bc9";

/** The same administrator id in upper case. */
export const SHIPA_TEST_REVIEW_ACTOR_ID_UPPER = "9C858901-8A57-4791-81FE-4C455B099BC9";

/** The verified internal actor descriptor of that administrator. */
export const SHIPA_TEST_REVIEW_ACTOR = { userId: SHIPA_TEST_REVIEW_ACTOR_ID };

/** A synthetic settings revision. */
export const SHIPA_TEST_REVIEW_REVISION = 7;

/** A synthetic input fingerprint: sixty-four lowercase hexadecimal digits. */
export const SHIPA_TEST_REVIEW_FINGERPRINT =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

/** A second synthetic input fingerprint. */
export const SHIPA_TEST_REVIEW_OTHER_FINGERPRINT =
  "9988776655443322110099887766554433221100998877665544332211009988";

/** A synthetic merchant reference, in the shape the SQL generates. */
export const SHIPA_TEST_REVIEW_CUSTOMER_REF = "CM-6f1c7a3e-8b52-4d19-9f0a-2c7e5b8d1a44";

/** A synthetic creation timestamp. */
export const SHIPA_TEST_REVIEW_CREATED_AT = "2026-11-04T00:12:57.967Z";

/** A synthetic update timestamp. */
export const SHIPA_TEST_REVIEW_UPDATED_AT = "2026-11-04T00:12:58.101Z";

/** A synthetic provider reference. */
export const SHIPA_TEST_REVIEW_SHIPA_REF = "SR-2026-0001";

// ---------------------------------------------------------------------------
// The fake SDK boundary
// ---------------------------------------------------------------------------

/** A recorded database call. */
export interface RecordedRpcCall {
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

/** The queued outcome of one database call. */
export interface FakeRpcOutcome {
  /** The value the call resolves with. */
  readonly data?: unknown;
  /** A resolved SQL error, as Supabase returns it by default. */
  readonly error?: unknown;
  /** A transport promise rejection, distinct from a resolved SQL error. */
  readonly rejection?: unknown;
  /** Extra SDK envelope properties, such as status, count and statusText. */
  readonly extra?: Record<string, unknown>;
}

/** The fake SDK boundary. */
export interface FakeShipaReviewRpcClient extends ShipaReviewRpcClient {
  /** Every call the code under test made, in order. */
  readonly calls: RecordedRpcCall[];
  /** Queues a fixed outcome for the next call. */
  queue(outcome: FakeRpcOutcome): void;
}

/**
 * Creates the fake database client.
 *
 * It has no database, no network and no environment access: it only records
 * calls and replays queued outcomes.
 */
export function createFakeShipaReviewRpcClient(): FakeShipaReviewRpcClient {
  const calls: RecordedRpcCall[] = [];
  const outcomes: FakeRpcOutcome[] = [];
  return {
    calls,
    queue(outcome: FakeRpcOutcome): void {
      outcomes.push(outcome);
    },
    rpc(fn: string, args?: Record<string, unknown>): PromiseLike<unknown> {
      calls.push({ fn, args: args ?? {} });
      const outcome = outcomes.shift();
      if (!outcome) {
        return Promise.reject(new Error("no queued outcome"));
      }
      if (outcome.rejection !== undefined) {
        return Promise.reject(outcome.rejection);
      }
      const data = "data" in outcome ? outcome.data : null;
      return Promise.resolve({
        data,
        error: outcome.error ?? null,
        ...(outcome.extra ?? {}),
      });
    },
  };
}

/**
 * Builds a synthetic SQL error.
 *
 * The text is invented and exists only so a test can prove that none of it
 * reaches a caller.
 */
export function createTestSqlError(
  code: string,
  message: string = "synthetic upstream message",
): Record<string, unknown> {
  return {
    code,
    message,
    details: "synthetic upstream details",
    hint: "synthetic upstream hint",
  };
}

// ---------------------------------------------------------------------------
// The synthetic documents
// ---------------------------------------------------------------------------

/** The options of a synthetic integrity document. */
export interface TestIntegrityOptions {
  readonly accepted?: boolean;
  readonly reasons?: readonly string[];
  readonly inputFingerprint?: string;
  readonly settingsRevision?: number;
  readonly extra?: Record<string, unknown>;
}

/** The exact four-member integrity document. */
export function createTestIntegrityDocument(
  options: TestIntegrityOptions = {},
): Record<string, unknown> {
  return {
    accepted: options.accepted ?? true,
    reasons: [...(options.reasons ?? [])],
    input_fingerprint: options.inputFingerprint ??
      SHIPA_TEST_REVIEW_FINGERPRINT,
    settings_revision: options.settingsRevision ?? SHIPA_TEST_REVIEW_REVISION,
    ...(options.extra ?? {}),
  };
}

/** The options of a synthetic safe summary. */
export interface TestSummaryOptions {
  readonly shipmentId?: string;
  readonly state?: string;
  readonly changed?: boolean;
  readonly conflict?: boolean;
  readonly shipaRef?: string | null;
  readonly providerStatus?: string | null;
  readonly attemptCount?: number;
  readonly retryCount?: number;
  readonly retryAt?: string | null;
  readonly lastErrorCode?: string | null;
  readonly updatedAt?: string;
  readonly extra?: Record<string, unknown>;
}

/** The exact eleven-member safe summary. */
export function createTestSummaryDocument(
  options: TestSummaryOptions = {},
): Record<string, unknown> {
  return {
    shipment_id: options.shipmentId ?? SHIPA_TEST_REVIEW_SHIPMENT_ID,
    state: options.state ?? "queued",
    changed: options.changed ?? true,
    conflict: options.conflict ?? false,
    shipa_ref: options.shipaRef === undefined ? null : options.shipaRef,
    provider_status: options.providerStatus === undefined ? null : options.providerStatus,
    attempt_count: options.attemptCount ?? 0,
    retry_count: options.retryCount ?? 0,
    retry_at: options.retryAt === undefined ? null : options.retryAt,
    last_error_code: options.lastErrorCode === undefined ? null : options.lastErrorCode,
    updated_at: options.updatedAt ?? SHIPA_TEST_REVIEW_UPDATED_AT,
    ...(options.extra ?? {}),
  };
}

/** The options of a synthetic safe read. */
export interface TestReadOptions extends TestSummaryOptions {
  readonly orderId?: string;
  readonly environment?: string;
  readonly source?: string;
  readonly customerRef?: string;
  readonly createdAt?: string;
  readonly reviewedFingerprint?: string | null;
  readonly inputFingerprint?: string | null;
}

/** The exact eighteen-member safe read. */
export function createTestReadDocument(
  options: TestReadOptions = {},
): Record<string, unknown> {
  return {
    ...createTestSummaryDocument(options),
    order_id: options.orderId ?? SHIPA_TEST_REVIEW_ORDER_ID,
    environment: options.environment ?? "sandbox",
    source: options.source ?? "manual",
    customer_ref: options.customerRef ?? SHIPA_TEST_REVIEW_CUSTOMER_REF,
    created_at: options.createdAt ?? SHIPA_TEST_REVIEW_CREATED_AT,
    reviewed_fingerprint: options.reviewedFingerprint === undefined
      ? SHIPA_TEST_REVIEW_FINGERPRINT
      : options.reviewedFingerprint,
    input_fingerprint: options.inputFingerprint === undefined
      ? SHIPA_TEST_REVIEW_FINGERPRINT
      : options.inputFingerprint,
    ...(options.extra ?? {}),
  };
}

/** The synthetic diagnostic preview request. */
export function createTestPreviewRequest(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { environment: "sandbox", ...overrides };
}

/** The synthetic explicit manual review request. */
export function createTestManualRequest(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    environment: "sandbox",
    overrides: {},
    expectedSettingsRevision: SHIPA_TEST_REVIEW_REVISION,
    expectedInputFingerprint: SHIPA_TEST_REVIEW_FINGERPRINT,
    reviewReason: "Synthetic review reason",
    acknowledgePricing: false,
    packedConfirmed: true,
    ...overrides,
  };
}

/**
 * The synthetic explicit manual review request without one member.
 *
 * It is how a request that omits a required member is built, without
 * mutating the shared fixture.
 */
export function createTestManualRequestWithout(
  member: string,
): Record<string, unknown> {
  const request = createTestManualRequest();
  const reduced: Record<string, unknown> = {};
  for (const key of Object.keys(request)) {
    if (key !== member) reduced[key] = request[key];
  }
  return reduced;
}
