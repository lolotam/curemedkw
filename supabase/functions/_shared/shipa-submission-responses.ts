// Shipa submission answers — the strict parsers of the three SQL documents and
// the fixed failure mapping.
//
// What this module is
// -------------------
// Together with shipa-submission-validation.ts, turns unknown database answers
// into typed documents. This module owns the refusal, prepared,
// begin document and the safe summary, the normalisation of the real adapter
// result into the exact completion contract, the structural JSON comparison
// and delegates structural primitives and SQLSTATE mapping to that module.
//
// What this module deliberately does not do
// -----------------------------------------
// * It never recomputes a SHA256, a fingerprint or a payload. The hashes are
//   SQL-owned and are passed through byte for byte.
// * It never accepts a draft as an untyped value. The draft is parsed field by
//   field, an unknown key is refused rather than spread, and the real
//   `buildShipaOrderPayload` stays the authority for local business
//   validation.
// * It never returns a SQL message, a SQL detail, a hint, a cause or a
//   provider body.
//
// Source of truth:
//   docs/integrations/shipa-submission-rpc-contract.md
//   docs/integrations/shipa-dispatch-state-rpc-contract.md
//   supabase/migrations/20261103001100_shipa_dispatch_state.sql
//   supabase/migrations/20261103001600_shipa_submission.sql

import { isPlainRecord } from "./integration-credential-contract.ts";
import {
  isShipaEnvironment,
  isValidShipaOrderId,
  type ShipaFailureCode,
  type ShipaLocalRejectionCode,
} from "./shipa-contract.ts";
import type { ShipaCreateResult } from "./shipa-client.ts";
import {
  type ShipaShipmentState,
  type ShipaSubmissionBegin,
  type ShipaSubmissionBinding,
  type ShipaSubmissionCredentialBinding,
  ShipaSubmissionError,
  type ShipaSubmissionPreparation,
  type ShipaSubmissionRefusal,
  type ShipaSubmissionRefusalCode,
  type ShipaSubmissionResult,
  type ShipaSubmissionSafeSummary,
} from "./shipa-submission-contract.ts";

import {
  hasExactKeys,
  invalidResponse,
  isBoundedText,
  parseShipaSubmissionDraft,
  readBoolean,
  readCount,
  readHex64,
  readJsonObject,
  readNullableBoundedText,
  readNullableReference,
  readNullableTimestamp,
  readRevision,
  readTimestamp,
  readUuid,
  shipaJsonEqual,
} from "./shipa-submission-validation.ts";
export {
  isShipaSubmissionJson,
  mapShipaSubmissionSqlError,
  parseShipaSubmissionDraft,
  shipaJsonEqual,
} from "./shipa-submission-validation.ts";

// ---------------------------------------------------------------------------
// The exact key sets
// ---------------------------------------------------------------------------

const REFUSAL_KEYS = ["ready", "shipment_id", "code"] as const;

const PREPARATION_KEYS = [
  "ready",
  "shipment_id",
  "integration_id",
  "environment",
  "settings_revision",
  "input_fingerprint",
  "credential_revision",
  "credential_fingerprint",
  "draft",
  "payload",
  "payload_hash",
] as const;

const BEGIN_KEYS = [
  "ready",
  "shipment_id",
  "integration_id",
  "environment",
  "settings_revision",
  "input_fingerprint",
  "credential_revision",
  "credential_fingerprint",
  "draft",
  "payload",
  "payload_hash",
  "attempt_token",
  "lease_expires_at",
] as const;

const SUMMARY_KEYS = [
  "shipment_id",
  "state",
  "changed",
  "conflict",
  "shipa_ref",
  "provider_status",
  "attempt_count",
  "retry_count",
  "retry_at",
  "last_error_code",
  "updated_at",
] as const;

const SHIPMENT_STATES: readonly ShipaShipmentState[] = [
  "queued",
  "submitting",
  "created",
  "rejected",
  "needs_review",
  "unknown",
];

const REFUSAL_CODES: readonly ShipaSubmissionRefusalCode[] = [
  "possible_dispatch_or_state_ineligible",
  "integration_ineligible",
  "paid_items_changed",
  "delivery_input_invalid",
  "integrity_or_review_changed",
  "credential_missing",
  "prepared_inputs_changed",
];

// The completion RPC accepts exactly the current adapter vocabulary. The
// adapter already produces only these codes; the lists exist so a value that
// reaches the database boundary from anywhere else is refused before the call
// instead of being rejected by SQL afterwards.
const FAILURE_CODES: readonly ShipaFailureCode[] = [
  "invalid_request",
  "invalid_order_ref",
  "timeout",
  "network_error",
  "redirect_refused",
  "not_found",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "server_error",
  "unexpected_status",
  "malformed_response",
  "invalid_response",
  "response_too_large",
  "missing_reference",
];

const LOCAL_REJECTION_CODES: readonly ShipaLocalRejectionCode[] = [
  "unexpected_field",
  "invalid_customer_ref",
  "invalid_package_ref",
  "invalid_order_type",
  "missing_category",
  "invalid_category",
  "cross_border_not_supported",
  "invalid_auto_confirm",
  "invalid_country",
  "invalid_contact_name",
  "invalid_contact_phone",
  "invalid_city",
  "invalid_address",
  "invalid_email",
  "invalid_coordinates",
  "invalid_package_name",
  "invalid_package_description",
  "invalid_package_weight",
  "invalid_package_dimensions",
];

// ---------------------------------------------------------------------------
// Patterns and bounds
// ---------------------------------------------------------------------------

/** The largest provider status the completion RPC keeps. */
const MAX_PROVIDER_STATUS_LENGTH = 120;

/** The largest internal error code the safe summary keeps. */
const MAX_ERROR_CODE_LENGTH = 200;

// ---------------------------------------------------------------------------
// The refusal document
// ---------------------------------------------------------------------------

/**
 * Parses the exact refusal document.
 *
 * It returns `null` when the answer is not a refusal, so a caller can tell a
 * refusal apart from an unusable answer. An unknown code is not a refusal:
 * the answer is refused as an unusable response instead.
 */
export function parseShipaSubmissionRefusal(
  raw: unknown,
): ShipaSubmissionRefusal | null {
  if (!isPlainRecord(raw)) return null;
  if (raw["ready"] !== false) return null;
  if (!hasExactKeys(raw, REFUSAL_KEYS)) return null;
  const shipmentId = readUuid(raw["shipment_id"]);
  const code = raw["code"];
  if (shipmentId === null) return null;
  if (!isRefusalCode(code)) return null;
  return { ready: false, shipmentId, code };
}

function isRefusalCode(value: unknown): value is ShipaSubmissionRefusalCode {
  return typeof value === "string" &&
    (REFUSAL_CODES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// The prepared document
// ---------------------------------------------------------------------------

/**
 * Parses the prepared document and binds it to the server-owned input.
 *
 * A preparation for another shipment, another integration or another
 * environment is refused: the answer cannot be used for the work that asked
 * for it.
 */
export function parseShipaSubmissionPreparation(
  raw: unknown,
  binding: ShipaSubmissionBinding,
): ShipaSubmissionPreparation {
  if (!isPlainRecord(raw)) throw invalidResponse();
  if (raw["ready"] !== true) throw invalidResponse();
  if (!hasExactKeys(raw, PREPARATION_KEYS)) throw invalidResponse();
  const preparation = readPreparationFields(raw);
  requireBindingMatch(preparation, binding);
  return preparation;
}

/**
 * What a begin answer must agree with.
 *
 * The credential tuple is the one of the loaded key, never the one of a
 * fresher preparation: a stale loaded credential stays stale.
 */
export interface ShipaSubmissionBeginExpectation {
  readonly binding: ShipaSubmissionBinding;
  readonly preparation: ShipaSubmissionPreparation;
  readonly credential: ShipaSubmissionCredentialBinding;
  readonly attemptToken: string;
}

/**
 * Parses the begin answer.
 *
 * A begin answer is the full preparation plus exactly the attempt token and
 * the lease expiry. The token must be the one that was generated for this
 * attempt, and the context must agree with the captured preparation and with
 * the loaded credential. A malformed, mismatched or unknown answer never
 * authorises a provider request.
 */
export function parseShipaSubmissionBegin(
  raw: unknown,
  expected: ShipaSubmissionBeginExpectation,
): ShipaSubmissionBegin {
  if (!isPlainRecord(raw)) throw invalidResponse();
  if (raw["ready"] !== true) throw invalidResponse();
  if (!hasExactKeys(raw, BEGIN_KEYS)) throw invalidResponse();
  const attemptToken = readUuid(raw["attempt_token"]);
  const leaseExpiresAt = readTimestamp(raw["lease_expires_at"]);
  if (attemptToken === null || leaseExpiresAt === null) {
    throw invalidResponse();
  }
  if (attemptToken !== expected.attemptToken.toLowerCase()) {
    throw invalidResponse();
  }
  const preparation = readPreparationFields(raw);
  requireBindingMatch(preparation, expected.binding);
  if (preparation.settingsRevision !== expected.preparation.settingsRevision) {
    throw invalidResponse();
  }
  if (preparation.inputFingerprint !== expected.preparation.inputFingerprint) {
    throw invalidResponse();
  }
  if (
    preparation.credentialRevision !== expected.credential.credentialRevision
  ) {
    throw invalidResponse();
  }
  if (
    preparation.credentialFingerprint !==
      expected.credential.credentialFingerprint
  ) {
    throw invalidResponse();
  }
  if (preparation.payloadHash !== expected.preparation.payloadHash) {
    throw invalidResponse();
  }
  if (!shipaJsonEqual(preparation.payload, expected.preparation.payload)) {
    throw invalidResponse();
  }
  if (!shipaJsonEqual(preparation.draft, expected.preparation.draft)) {
    throw invalidResponse();
  }
  return { ...preparation, attemptToken, leaseExpiresAt };
}

function readPreparationFields(
  record: Record<string, unknown>,
): ShipaSubmissionPreparation {
  const shipmentId = readUuid(record["shipment_id"]);
  const integrationId = readUuid(record["integration_id"]);
  const environment = record["environment"];
  const settingsRevision = readRevision(record["settings_revision"], 0);
  const credentialRevision = readRevision(record["credential_revision"], 1);
  const inputFingerprint = readHex64(record["input_fingerprint"]);
  const credentialFingerprint = readHex64(record["credential_fingerprint"]);
  const payloadHash = readHex64(record["payload_hash"]);
  const draft = parseShipaSubmissionDraft(record["draft"]);
  const payload = readJsonObject(record["payload"]);
  if (
    shipmentId === null || integrationId === null ||
    !isShipaEnvironment(environment) ||
    settingsRevision === null || credentialRevision === null ||
    inputFingerprint === null || credentialFingerprint === null ||
    payloadHash === null || payload === null
  ) {
    throw invalidResponse();
  }
  return {
    ready: true,
    shipmentId,
    integrationId,
    environment,
    settingsRevision,
    inputFingerprint,
    credentialRevision,
    credentialFingerprint,
    draft,
    payload,
    payloadHash,
  };
}

function requireBindingMatch(
  preparation: ShipaSubmissionPreparation,
  binding: ShipaSubmissionBinding,
): void {
  if (preparation.shipmentId !== binding.shipmentId.toLowerCase()) {
    throw invalidResponse();
  }
  if (preparation.integrationId !== binding.integrationId.toLowerCase()) {
    throw invalidResponse();
  }
  if (preparation.environment !== binding.environment) {
    throw invalidResponse();
  }
}

// ---------------------------------------------------------------------------
// The safe summary
// ---------------------------------------------------------------------------

/**
 * Parses the safe summary and binds it to the shipment that asked for it.
 *
 * The summary is the authoritative persisted state. Nothing here infers a
 * state from a provider outcome.
 */
export function parseShipaSubmissionSafeSummary(
  raw: unknown,
  shipmentId: string,
): ShipaSubmissionSafeSummary {
  if (!isPlainRecord(raw)) throw invalidResponse();
  if (!hasExactKeys(raw, SUMMARY_KEYS)) throw invalidResponse();
  const id = readUuid(raw["shipment_id"]);
  const state = raw["state"];
  const changed = readBoolean(raw["changed"]);
  const conflict = readBoolean(raw["conflict"]);
  const shipaRef = readNullableReference(raw["shipa_ref"]);
  const providerStatus = readNullableBoundedText(
    raw["provider_status"],
    MAX_PROVIDER_STATUS_LENGTH,
  );
  const attemptCount = readCount(raw["attempt_count"], 4);
  const retryCount = readCount(raw["retry_count"], 3);
  const retryAt = readNullableTimestamp(raw["retry_at"]);
  const lastErrorCode = readNullableBoundedText(
    raw["last_error_code"],
    MAX_ERROR_CODE_LENGTH,
  );
  const updatedAt = readTimestamp(raw["updated_at"]);
  if (
    id === null || id !== shipmentId.toLowerCase() ||
    !isShipmentState(state) || changed === null || conflict === null ||
    shipaRef === undefined || providerStatus === undefined ||
    attemptCount === null || retryCount === null || retryAt === undefined ||
    lastErrorCode === undefined || updatedAt === null
  ) {
    throw invalidResponse();
  }
  if (
    (state === "created") !== (shipaRef !== null) ||
    (["submitting", "unknown", "created"].includes(state) &&
      attemptCount === 0) ||
    (state === "unknown" && retryAt !== null)
  ) {
    throw invalidResponse();
  }
  return {
    shipmentId: id,
    state,
    changed,
    conflict,
    shipaRef,
    providerStatus,
    attemptCount,
    retryCount,
    retryAt,
    lastErrorCode,
    updatedAt,
  };
}

function isShipmentState(value: unknown): value is ShipaShipmentState {
  return typeof value === "string" &&
    (SHIPMENT_STATES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// The result contract
// ---------------------------------------------------------------------------

/**
 * Normalises the real adapter result into the exact completion contract.
 *
 * The adapter's `field` and `message` members are dropped: only the closed
 * outcome and the closed code survive. A reference or a status that the
 * completion RPC would refuse is refused here, before the call.
 */
export function toShipaSubmissionResult(
  result: ShipaCreateResult,
): ShipaSubmissionResult {
  if (result.outcome === "accepted") {
    const shipaRef = result.shipaRef;
    const orderStatus = result.orderStatus;
    if (!isValidShipaOrderId(shipaRef)) {
      throw new ShipaSubmissionError("invalid_request");
    }
    if (
      orderStatus !== null &&
      !isBoundedText(orderStatus, MAX_PROVIDER_STATUS_LENGTH)
    ) {
      throw new ShipaSubmissionError("invalid_request");
    }
    return { outcome: "accepted", shipaRef, orderStatus };
  }
  if (result.outcome === "uncertain") {
    if (!(FAILURE_CODES as readonly string[]).includes(result.code)) {
      throw new ShipaSubmissionError("invalid_request");
    }
    return { outcome: "uncertain", code: result.code };
  }
  if (result.outcome === "rejected_local") {
    if (!(LOCAL_REJECTION_CODES as readonly string[]).includes(result.code)) {
      throw new ShipaSubmissionError("invalid_request");
    }
    return { outcome: "rejected_local", code: result.code };
  }
  throw new ShipaSubmissionError("invalid_request");
}
