// Shipa submission contract — the closed failure vocabulary and the exact
// shapes of the internal submission store and the one-shipment execution core.
//
// What this module is
// -------------------
// The single vocabulary every other Shipa submission module speaks: the fixed
// error codes, the refusal codes the SQL preparation layer owns, the prepared
// preparation and begin documents, the safe summary and the exact result
// contract that the completion RPC accepts.
//
// What this module deliberately does not do
// -----------------------------------------
// * No I/O, no cryptography, no network access and no logging.
// * No draft, payload, fingerprint, hash, key or ciphertext ever appears in a
//   returned execution status or in an error message. A draft and a payload
//   carry customer delivery PII: they are INTERNAL ONLY.
// * No SQL message, SQL detail, SQL hint or original cause is ever returned or
//   attached to a failure.
//
// Source of truth:
//   docs/integrations/shipa-submission-rpc-contract.md
//   docs/integrations/shipa-dispatch-state-rpc-contract.md
//   supabase/migrations/20261103001100_shipa_dispatch_state.sql
//   supabase/migrations/20261103001600_shipa_submission.sql

import type { ShipaCreateResult } from "./shipa-client.ts";
import type {
  ShipaEnvironment,
  ShipaFailureCode,
  ShipaLocalRejectionCode,
  ShipaOrderDraft,
} from "./shipa-contract.ts";

// ---------------------------------------------------------------------------
// Closed failures
// ---------------------------------------------------------------------------

/**
 * The closed set of failures the submission store can report.
 *
 * Nothing outside this list is ever produced, and a code never carries a
 * value: the message is fixed text and never contains an input, a secret, a
 * ciphertext, a nonce, a SQL message, a SQL detail, a hint, a cause or a
 * provider body.
 */
export type ShipaSubmissionErrorCode =
  | "invalid_request"
  | "invalid_response"
  | "conflict"
  | "upgrade_required"
  | "not_found"
  | "forbidden"
  | "ineligible"
  | "unavailable"
  | "credential_missing"
  | "decryption_failed"
  | "unknown_key_version";

/**
 * The fixed message for every code.
 *
 * The mapping is exported so a caller can map a code to a transport status
 * without re-deriving the text, and so a test can prove that a message never
 * interpolates an input.
 */
export const SHIPA_SUBMISSION_ERROR_MESSAGES: Readonly<
  Record<ShipaSubmissionErrorCode, string>
> = {
  invalid_request: "The Shipa submission request is not valid.",
  invalid_response:
    "The Shipa submission service returned an unusable response.",
  conflict:
    "The Shipa shipment changed. Reload its status before any further action.",
  upgrade_required:
    "The Shipa submission storage is not available in this deployment yet.",
  not_found: "The Shipa shipment was not found.",
  forbidden: "The Shipa submission request is not allowed.",
  ineligible: "The Shipa shipment is not eligible for submission right now.",
  unavailable: "The Shipa submission service is not available right now.",
  credential_missing: "The Shipa credential is not configured.",
  decryption_failed: "The Shipa credential could not be decrypted.",
  unknown_key_version:
    "No Shipa credential key is available for the stored key version.",
};

/**
 * The single failure type of the submission store.
 *
 * The original cause is deliberately dropped: a SQL error can quote the
 * statement and the row, and a crypto exception can quote the material it was
 * given. The code carries the meaning and the message stays fixed.
 */
export class ShipaSubmissionError extends Error {
  readonly code: ShipaSubmissionErrorCode;

  constructor(code: ShipaSubmissionErrorCode) {
    super(SHIPA_SUBMISSION_ERROR_MESSAGES[code]);
    this.name = "ShipaSubmissionError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// JSON documents
// ---------------------------------------------------------------------------

/**
 * A JSON document as it crosses the database boundary.
 *
 * The payload of a preparation is a JSON object; this type describes any JSON
 * value so a comparison can be structural rather than textual.
 */
export type ShipaSubmissionJson =
  | null
  | boolean
  | number
  | string
  | ShipaSubmissionJson[]
  | { [key: string]: ShipaSubmissionJson };

// ---------------------------------------------------------------------------
// The refusal document
// ---------------------------------------------------------------------------

/**
 * The closed set of reasons the SQL preparation layer refuses to prepare.
 *
 * Every code is SQL-owned. The core never invents a refusal and never maps a
 * refusal into a generic failure: the code is the whole answer.
 */
export type ShipaSubmissionRefusalCode =
  | "possible_dispatch_or_state_ineligible"
  | "integration_ineligible"
  | "paid_items_changed"
  | "delivery_input_invalid"
  | "integrity_or_review_changed"
  | "credential_missing"
  | "prepared_inputs_changed";

/**
 * The exact refusal document.
 *
 * It is exactly `{ready:false, shipment_id, code}` and it never carries a
 * reason beyond the code.
 */
export interface ShipaSubmissionRefusal {
  readonly ready: false;
  readonly shipmentId: string;
  readonly code: ShipaSubmissionRefusalCode;
}

// ---------------------------------------------------------------------------
// The prepared documents
// ---------------------------------------------------------------------------

/**
 * One successful preparation.
 *
 * `ready:true` is preparation only. It is not permission to send: only a
 * matching durable begin grants one create request.
 *
 * The draft and the payload carry customer delivery PII. They are INTERNAL
 * ONLY and must never be logged or returned from an execution status.
 */
export interface ShipaSubmissionPreparation {
  readonly ready: true;
  readonly shipmentId: string;
  readonly integrationId: string;
  readonly environment: ShipaEnvironment;
  /** The integration configuration revision, zero or greater. */
  readonly settingsRevision: number;
  /** The SQL-owned input fingerprint, lower-case hexadecimal. */
  readonly inputFingerprint: string;
  /** The SQL-owned credential revision, strictly positive. */
  readonly credentialRevision: number;
  /** The SQL-owned credential fingerprint, lower-case hexadecimal. */
  readonly credentialFingerprint: string;
  /** INTERNAL AND PII-BEARING. The adapter draft for one order. */
  readonly draft: ShipaOrderDraft;
  /** INTERNAL AND PII-BEARING. The SQL-built wire payload. */
  readonly payload: ShipaSubmissionJson;
  /** The SQL-owned SHA256 of the canonical payload. Never recomputed here. */
  readonly payloadHash: string;
}

/**
 * One successful begin.
 *
 * It is the full preparation plus exactly two members: the attempt token that
 * was committed and the lease expiry of that attempt.
 */
export interface ShipaSubmissionBegin extends ShipaSubmissionPreparation {
  readonly attemptToken: string;
  readonly leaseExpiresAt: string;
}

/**
 * The server-owned binding of one shipment.
 *
 * The shipment id, the integration id and the environment are values the
 * server already owns. They are never taken from a browser body, a query
 * string or a caller-supplied provider name, and the preparation answer is
 * bound against them so a preparation for another shipment, another
 * integration or another environment can never be used.
 */
export interface ShipaSubmissionBinding {
  readonly shipmentId: string;
  readonly integrationId: string;
  readonly environment: ShipaEnvironment;
}

/**
 * The credential metadata of the key that was actually loaded and decrypted.
 *
 * This is the tuple that goes into the begin request. It is never replaced
 * with the metadata of a fresher preparation: a stale loaded credential stays
 * stale, and SQL refuses the begin instead of the core silently upgrading it.
 */
export interface ShipaSubmissionCredentialBinding {
  readonly credentialRevision: number;
  readonly credentialFingerprint: string;
}

/**
 * The exact six-field begin request.
 *
 * The whole preparation context is never copied into it. The credential
 * revision and fingerprint are the ones of the loaded key.
 */
export interface ShipaSubmissionPreparedRequest {
  readonly settings_revision: number;
  readonly input_fingerprint: string;
  readonly credential_revision: number;
  readonly credential_fingerprint: string;
  readonly payload: ShipaSubmissionJson;
  readonly payload_hash: string;
}

// ---------------------------------------------------------------------------
// The safe summary
// ---------------------------------------------------------------------------

/** The states a shipment row can hold. */
export type ShipaShipmentState =
  | "queued"
  | "submitting"
  | "created"
  | "rejected"
  | "needs_review"
  | "unknown";

/**
 * The authoritative safe summary of one shipment.
 *
 * It is the SQL-owned answer of the completion RPC and the only persisted
 * state this module returns. A state is never inferred from a provider
 * outcome: `created` means the provider accepted a booking, never that the
 * shipment was delivered.
 */
export interface ShipaSubmissionSafeSummary {
  readonly shipmentId: string;
  readonly state: ShipaShipmentState;
  readonly changed: boolean;
  readonly conflict: boolean;
  readonly shipaRef: string | null;
  readonly providerStatus: string | null;
  readonly attemptCount: number;
  readonly retryCount: number;
  readonly retryAt: string | null;
  readonly lastErrorCode: string | null;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// The exact result contract
// ---------------------------------------------------------------------------

/**
 * The exact result document the completion RPC accepts.
 *
 * Accepted is exactly `{outcome, shipaRef, orderStatus}`; uncertain is
 * exactly `{outcome, code}`; a local rejection is exactly `{outcome, code}`
 * with the adapter's field and message members stripped.
 */
export type ShipaSubmissionResult =
  | {
    readonly outcome: "accepted";
    readonly shipaRef: string;
    readonly orderStatus: string | null;
  }
  | { readonly outcome: "uncertain"; readonly code: ShipaFailureCode }
  | {
    readonly outcome: "rejected_local";
    readonly code: ShipaLocalRejectionCode;
  };

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/**
 * The structural slice of a database client this store needs.
 *
 * A real Supabase client satisfies it: its `rpc` returns a promise-like
 * builder. Keeping the dependency structural avoids pulling an SDK runtime
 * into this module and keeps the fake boundary in the tests honest.
 */
export interface ShipaSubmissionRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<unknown>;
}

/**
 * One begin request.
 *
 * The attempt token is generated once, by the execution core, before the
 * begin call. It is the identity of the attempt that the durable marker
 * binds, so the answer must carry exactly this token.
 */
export interface ShipaSubmissionBeginRequest {
  readonly binding: ShipaSubmissionBinding;
  readonly preparation: ShipaSubmissionPreparation;
  /**
   * The credential metadata of the key that was actually loaded and
   * decrypted.
   */
  readonly credential: ShipaSubmissionCredentialBinding;
  readonly attemptToken: string;
}

/**
 * The internal submission store.
 *
 * It performs exactly one database call per operation. It never retries, it
 * never reads or writes a table directly and it never grants send authority:
 * a successful begin is the only answer that carries one.
 */
export interface ShipaSubmissionStore {
  /**
   * Prepares one shipment.
   *
   * Preparation is MUTATING: it may hold unattempted work for review. It never
   * issues send authority.
   */
  prepare(
    binding: ShipaSubmissionBinding,
  ): Promise<ShipaSubmissionPreparation | ShipaSubmissionRefusal>;

  /**
   * Commits one attempt.
   *
   * The credential metadata is the one of the loaded key, never the one of a
   * fresher preparation.
   */
  begin(
    request: ShipaSubmissionBeginRequest,
  ): Promise<ShipaSubmissionBegin | ShipaSubmissionRefusal>;

  /**
   * Records the real provider outcome of one attempt.
   *
   * The result comes from the real adapter and is normalised here, so the
   * adapter's field and message members can never reach the database.
   */
  complete(
    binding: ShipaSubmissionBinding,
    attemptToken: string,
    result: ShipaCreateResult,
  ): Promise<ShipaSubmissionSafeSummary>;
}
