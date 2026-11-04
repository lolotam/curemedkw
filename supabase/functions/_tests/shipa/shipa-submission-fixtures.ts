// Synthetic fixtures for the Shipa submission store and execution tests.
//
// Everything in this file is fabricated. The shipment and integration ids are
// made-up UUIDs, the fingerprints and the payload hash are invented strings,
// and the master key material is generated freshly for every test. No real
// credential, provider key, master key, customer address or personal data
// exists anywhere below.
//
// Only the SDK boundary is faked. The fake records every call and replays a
// queued outcome; the strict document parsers, the Web Crypto operations, the
// real adapter builder and the real HTTP client do the work in the tests.

import {
  buildShipaOrderPayload,
  type ShipaOrderDraft,
  type ShipaPartyDraft,
} from "../../_shared/shipa-contract.ts";
import type {
  ShipaSubmissionRefusalCode,
  ShipaSubmissionRpcClient,
} from "../../_shared/shipa-submission-contract.ts";
import { isShipaSubmissionJson } from "../../_shared/shipa-submission-responses.ts";
import {
  createStoredCredentialDocument,
  createSyntheticKeyring,
  createUndecryptableEnvelope,
} from "./shipa-credential-loader-fixtures.ts";
import { validOrderDraft } from "./shipa-fixtures.ts";

export {
  createStoredCredentialDocument,
  createSyntheticKeyring,
  createUndecryptableEnvelope,
};

// ---------------------------------------------------------------------------
// Synthetic identifiers and values
// ---------------------------------------------------------------------------

/** A made-up shipment id. */
export const SHIPA_TEST_SHIPMENT_ID = "6f1c7a3e-8b52-4d19-9f0a-2c7e5b8d1a44";

/** A second made-up shipment id. */
export const SHIPA_TEST_OTHER_SHIPMENT_ID =
  "0a7c1e52-4d3b-4a6f-9c18-3b5e7d2f6a90";

/** A made-up integration id. */
export const SHIPA_TEST_INTEGRATION_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** A second made-up integration id. */
export const SHIPA_TEST_OTHER_INTEGRATION_ID =
  "9c858901-8a57-4791-81fe-4c455b099bc9";

/** A synthetic settings revision. */
export const SHIPA_TEST_SETTINGS_REVISION = 7;

/** A synthetic credential revision. */
export const SHIPA_TEST_CREDENTIAL_REVISION = 3;

/** A second synthetic credential revision, used for the stale cases. */
export const SHIPA_TEST_STALE_CREDENTIAL_REVISION = 1;

/**
 * A synthetic SQL-owned fingerprint: sixty-four lowercase hexadecimal
 * characters that are not the serialisation of anything.
 */
export const SHIPA_TEST_CREDENTIAL_FINGERPRINT =
  "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

/** A second synthetic credential fingerprint, used for the stale cases. */
export const SHIPA_TEST_STALE_CREDENTIAL_FINGERPRINT =
  "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";

/** A synthetic input fingerprint. */
export const SHIPA_TEST_INPUT_FINGERPRINT =
  "1122334455667788990011223344556677889900112233445566778899001122";

/** A synthetic payload hash. */
export const SHIPA_TEST_PAYLOAD_HASH =
  "9988776655443322110099887766554433221100998877665544332211009988";

/** A synthetic lease expiry. */
export const SHIPA_TEST_LEASE_EXPIRES_AT = "2026-11-04T00:12:57.967Z";

/** A synthetic update timestamp. */
export const SHIPA_TEST_UPDATED_AT = "2026-11-04T00:12:58.101Z";

/** A synthetic provider reference. */
export const SHIPA_TEST_SHIPA_REF = "SR-2026-0001";

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

/**
 * A responder that sees the call before it answers.
 *
 * It is how a test answers a call with the attempt token that the caller
 * generated, without the test having to know that token in advance.
 */
export type FakeRpcResponder = (
  fn: string,
  args: Record<string, unknown>,
) => FakeRpcOutcome;

/** The handle of one deferred call. */
export interface DeferredRpcOutcome {
  /** Resolves once the call has reached the boundary. */
  readonly called: Promise<void>;
  /** Answers the call with a fixed outcome or with a responder. */
  resolve(value: FakeRpcOutcome | FakeRpcResponder): void;
  /** Fails the call with a transport rejection. */
  reject(reason: unknown): void;
}

/** The fake SDK boundary. */
export interface FakeShipaSubmissionRpcClient extends ShipaSubmissionRpcClient {
  /** Every call the code under test made, in order. */
  readonly calls: RecordedRpcCall[];
  /** Queues a fixed outcome for the next call. */
  queue(outcome: FakeRpcOutcome): void;
  /** Queues a responder for the next call. */
  queueResponder(responder: FakeRpcResponder): void;
  /** Queues a call that the test answers later. */
  queueDeferred(): DeferredRpcOutcome;
}

interface DeferredState {
  readonly promise: Promise<unknown>;
  readonly called: Promise<void>;
  markCalled(): void;
  settle(value: FakeRpcOutcome | FakeRpcResponder): void;
  fail(reason: unknown): void;
}

type PendingCall =
  | { readonly kind: "outcome"; readonly outcome: FakeRpcOutcome }
  | { readonly kind: "responder"; readonly responder: FakeRpcResponder }
  | { readonly kind: "deferred"; readonly deferred: DeferredState };

/**
 * Creates the fake database client.
 *
 * It has no database, no network and no environment access: it only records
 * calls and replays queued outcomes.
 */
export function createFakeShipaSubmissionRpcClient(): FakeShipaSubmissionRpcClient {
  const calls: RecordedRpcCall[] = [];
  const pending: PendingCall[] = [];

  return {
    calls,
    queue(outcome: FakeRpcOutcome): void {
      pending.push({ kind: "outcome", outcome });
    },
    queueResponder(responder: FakeRpcResponder): void {
      pending.push({ kind: "responder", responder });
    },
    queueDeferred(): DeferredRpcOutcome {
      const deferred = createDeferredState();
      pending.push({ kind: "deferred", deferred });
      return {
        called: deferred.called,
        resolve: (value) => deferred.settle(value),
        reject: (reason) => deferred.fail(reason),
      };
    },
    rpc(fn: string, args?: Record<string, unknown>): PromiseLike<unknown> {
      const recorded = args ?? {};
      calls.push({ fn, args: recorded });
      const next = pending.shift();
      if (!next) {
        return Promise.reject(new Error("no queued outcome"));
      }
      if (next.kind === "deferred") {
        next.deferred.markCalled();
        return next.deferred.promise.then((value) => {
          const outcome = typeof value === "function"
            ? value(fn, recorded)
            : value;
          return toSdkEnvelope(outcome);
        });
      }
      const outcome = next.kind === "outcome"
        ? next.outcome
        : next.responder(fn, recorded);
      if (outcome.rejection !== undefined) {
        return Promise.reject(outcome.rejection);
      }
      return Promise.resolve(toSdkEnvelope(outcome));
    },
  };
}

function toSdkEnvelope(outcome: FakeRpcOutcome): unknown {
  const data = "data" in outcome ? outcome.data : null;
  return {
    data,
    error: outcome.error ?? null,
    ...(outcome.extra ?? {}),
  };
}

function createDeferredState(): DeferredState {
  let markCalled: () => void = () => {};
  const called = new Promise<void>((resolve) => {
    markCalled = resolve;
  });
  let settle: (value: FakeRpcOutcome | FakeRpcResponder) => void = () => {};
  let fail: (reason: unknown) => void = () => {};
  const promise = new Promise<unknown>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, called, markCalled, settle, fail };
}

// ---------------------------------------------------------------------------
// The synthetic documents
// ---------------------------------------------------------------------------

/**
 * A draft the real adapter builder accepts.
 *
 * It carries a pickup instruction, so the payload the builder produces has
 * the same `origin.options` member the SQL payload carries for nonblank text.
 */
export function createTestDraft(): ShipaOrderDraft {
  return {
    ...validOrderDraft(),
    pickupInstructions: "Synthetic pickup instruction",
  };
}

/**
 * The draft exactly as SQL emits it.
 *
 * It has the eight root members of `private.shipa_submission_draft`, five
 * members per party and seven members for the package. The optional `email`
 * and `coordinates` members are absent because SQL never emits them.
 */
export function createTestDraftDocument(
  draft: ShipaOrderDraft = createTestDraft(),
): Record<string, unknown> {
  return {
    customerRef: draft.customerRef,
    orderType: draft.orderType,
    category: draft.category,
    autoConfirm: draft.autoConfirm,
    pickupInstructions: draft.pickupInstructions ?? null,
    origin: toPartyDocument(draft.origin),
    destination: toPartyDocument(draft.destination),
    package: {
      customerRef: draft.package.customerRef,
      name: draft.package.name,
      description: draft.package.description ?? null,
      weightKg: draft.package.weightKg,
      lengthCm: draft.package.lengthCm,
      widthCm: draft.package.widthCm,
      heightCm: draft.package.heightCm,
    },
  };
}

function toPartyDocument(party: ShipaPartyDraft): Record<string, unknown> {
  return {
    country: party.country,
    contactName: party.contactName,
    contactNo: party.contactNo,
    city: party.city,
    address: party.address ?? null,
  };
}

/**
 * The wire payload the SQL layer builds.
 *
 * It is produced with the real adapter builder, so the fixture and the
 * production code agree on one shape instead of two hand-written ones.
 */
export function createTestPayloadDocument(
  draft: ShipaOrderDraft = createTestDraft(),
): Record<string, unknown> {
  const built = buildShipaOrderPayload(draft);
  if (!built.ok) {
    throw new Error("The synthetic draft must be a valid order.");
  }
  return asJsonDocument(built.payload);
}

/**
 * The payload that belongs to a draft.
 *
 * A draft the builder refuses has no payload of its own, so the fixture falls
 * back to the payload of the valid draft. The mismatch is the point of the
 * test that uses it.
 */
function payloadFor(draft: ShipaOrderDraft): Record<string, unknown> {
  try {
    return createTestPayloadDocument(draft);
  } catch {
    return createTestPayloadDocument();
  }
}

function asJsonDocument(value: unknown): Record<string, unknown> {
  if (!isShipaSubmissionJson(value)) {
    throw new Error("The synthetic payload must be a JSON document.");
  }
  if (
    typeof value !== "object" || value === null || Array.isArray(value)
  ) {
    throw new Error("The synthetic payload must be a JSON object.");
  }
  return value;
}

/** The exact refusal document. */
export function createTestRefusalDocument(
  code: ShipaSubmissionRefusalCode,
  shipmentId: string = SHIPA_TEST_SHIPMENT_ID,
): Record<string, unknown> {
  return { ready: false, shipment_id: shipmentId, code };
}

/** The options of a synthetic prepared document. */
export interface TestPreparationOptions {
  readonly shipmentId?: string;
  readonly integrationId?: string;
  readonly environment?: "sandbox" | "live";
  readonly settingsRevision?: number;
  readonly inputFingerprint?: string;
  readonly credentialRevision?: number;
  readonly credentialFingerprint?: string;
  readonly draft?: ShipaOrderDraft;
  readonly draftDocument?: Record<string, unknown>;
  readonly payload?: Record<string, unknown>;
  readonly payloadHash?: string;
}

/** The exact prepared document. */
export function createTestPreparationDocument(
  options: TestPreparationOptions = {},
): Record<string, unknown> {
  const draft = options.draft ?? createTestDraft();
  const draftDocument = options.draftDocument ??
    createTestDraftDocument(draft);
  const payload = options.payload ?? payloadFor(draft);
  return {
    ready: true,
    shipment_id: options.shipmentId ?? SHIPA_TEST_SHIPMENT_ID,
    integration_id: options.integrationId ?? SHIPA_TEST_INTEGRATION_ID,
    environment: options.environment ?? "sandbox",
    settings_revision: options.settingsRevision ?? SHIPA_TEST_SETTINGS_REVISION,
    input_fingerprint: options.inputFingerprint ?? SHIPA_TEST_INPUT_FINGERPRINT,
    credential_revision: options.credentialRevision ??
      SHIPA_TEST_CREDENTIAL_REVISION,
    credential_fingerprint: options.credentialFingerprint ??
      SHIPA_TEST_CREDENTIAL_FINGERPRINT,
    draft: draftDocument,
    payload,
    payload_hash: options.payloadHash ?? SHIPA_TEST_PAYLOAD_HASH,
  };
}

/** The options of a synthetic begin document. */
export interface TestBeginOptions extends TestPreparationOptions {
  readonly attemptToken?: string;
  readonly leaseExpiresAt?: string;
}

/** The exact begin document: the full preparation plus two members. */
export function createTestBeginDocument(
  options: TestBeginOptions = {},
): Record<string, unknown> {
  const attemptId = options.attemptToken ?? SHIPA_TEST_SHIPMENT_ID;
  return {
    ...createTestPreparationDocument(options),
    attempt_token: attemptId,
    lease_expires_at: options.leaseExpiresAt ?? SHIPA_TEST_LEASE_EXPIRES_AT,
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
}

/** The exact safe summary document. */
export function createTestSafeSummaryDocument(
  options: TestSummaryOptions = {},
): Record<string, unknown> {
  return {
    shipment_id: options.shipmentId ?? SHIPA_TEST_SHIPMENT_ID,
    state: options.state ?? "created",
    changed: options.changed ?? true,
    conflict: options.conflict ?? false,
    shipa_ref: options.shipaRef === undefined
      ? SHIPA_TEST_SHIPA_REF
      : options.shipaRef,
    provider_status: options.providerStatus === undefined
      ? "Created"
      : options.providerStatus,
    attempt_count: options.attemptCount ?? 1,
    retry_count: options.retryCount ?? 0,
    retry_at: options.retryAt === undefined ? null : options.retryAt,
    last_error_code: options.lastErrorCode === undefined
      ? null
      : options.lastErrorCode,
    updated_at: options.updatedAt ?? SHIPA_TEST_UPDATED_AT,
  };
}
