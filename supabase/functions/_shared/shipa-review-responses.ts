// Shipa review — the strict safe response parsers and the SQL-state mapping.
//
// What this module is
// -------------------
// The boundary between a database answer and a caller. It turns the three
// answers of the review path into typed, safe documents:
//
//   shipa_check_integrity — the four-key diagnostic document
//   shipa_request_manual  — the existing eleven-key dispatch summary
//   shipa_read_shipment   — the eleven-key summary plus seven safe members
//
// It also owns the mapping of a rejected database call onto the closed code
// set of this slice.
//
// What this module deliberately does not do
// -----------------------------------------
// * It never returns a SQL message, a SQL detail, a hint, a cause, a raw
//   document or an extra member. The upstream text is read only to classify a
//   failure and is never returned or attached.
// * It never weakens or duplicates the existing safe summary parser. The
//   eleven summary members are projected and handed to it unchanged.
// * It never infers a state. A manual answer that is not an unattempted,
//   queued intent is refused rather than re-described.
//
// Source of truth:
//   docs/integrations/shipa-integrity-rpc-contract.md
//   docs/integrations/shipa-dispatch-state-rpc-contract.md
//   supabase/migrations/20261103001200_shipa_integrity.sql
//   supabase/migrations/20261103001500_shipa_intents.sql
//   supabase/migrations/20261103001100_shipa_dispatch_state.sql

import { isPlainRecord } from "./integration-credential-contract.ts";
import {
  hasExactKeys,
  readHex64,
  readNullableReference,
  readRevision,
  readTimestamp,
  readUuid,
} from "./shipa-submission-validation.ts";
import { parseShipaSubmissionSafeSummary } from "./shipa-submission-responses.ts";
import type { ShipaSubmissionSafeSummary } from "./shipa-submission-contract.ts";
import {
  SHIPA_REVIEW_REASONS,
  ShipaReviewError,
  type ShipaReviewErrorCode,
  type ShipaReviewIntegrityResult,
  type ShipaReviewReason,
  type ShipaReviewShipmentRead,
  type ShipaReviewSource,
} from "./shipa-review-contract.ts";
import type { ShipaEnvironment } from "./shipa-settings.ts";

// ---------------------------------------------------------------------------
// The exact key sets
// ---------------------------------------------------------------------------

/** The four members of the integrity document. */
const INTEGRITY_KEYS = [
  "accepted",
  "reasons",
  "input_fingerprint",
  "settings_revision",
];

/** The eleven members of the existing safe dispatch summary. */
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
];

/** The eighteen members of the targeted read. */
const READ_KEYS = [
  ...SUMMARY_KEYS,
  "order_id",
  "environment",
  "source",
  "customer_ref",
  "created_at",
  "reviewed_fingerprint",
  "input_fingerprint",
];

const REVIEW_SOURCES: readonly ShipaReviewSource[] = ["manual", "automatic"];

// ---------------------------------------------------------------------------
// The fixed failure tokens
// ---------------------------------------------------------------------------

/** The 55000 message that means the shipment may already have dispatched. */
const RECONCILIATION_REASON = "shipa_possible_dispatch_requires_reconciliation";

/**
 * The 55000 messages that mean the order is not eligible for this request.
 *
 * The list is exact. An unknown 55000 is an unavailable service, never a
 * guess about eligibility.
 */
const NOT_ELIGIBLE_REASONS: readonly string[] = [
  "shipa_ordering_disabled",
  "shipa_integration_ineligible",
  "shared_payment_activation_required",
  "shipa_verified_paid_receipt_required",
  "shipa_paid_items_changed",
  "shipa_integrity_requires_correction",
];

// ---------------------------------------------------------------------------
// The integrity document
// ---------------------------------------------------------------------------

/**
 * Parses the integrity document into the safe projection.
 *
 * The document has exactly four members. An unknown reason, a duplicated
 * reason, an accepted document that still carries reasons and a rejected
 * document without reasons are all refused: the diagnostic answer must be
 * internally consistent before a caller may act on it.
 */
export function parseShipaReviewIntegrityResult(
  raw: unknown,
): ShipaReviewIntegrityResult {
  if (!isPlainRecord(raw)) throw invalidReviewResponse();
  if (!hasExactKeys(raw, INTEGRITY_KEYS)) throw invalidReviewResponse();
  const accepted = raw["accepted"];
  if (typeof accepted !== "boolean") throw invalidReviewResponse();
  const reasons = parseReasons(raw["reasons"]);
  if (reasons === null) throw invalidReviewResponse();
  const inputFingerprint = readHex64(raw["input_fingerprint"]);
  if (inputFingerprint === null) throw invalidReviewResponse();
  const settingsRevision = readRevision(raw["settings_revision"], 0);
  if (settingsRevision === null) throw invalidReviewResponse();
  if (accepted !== (reasons.length === 0)) throw invalidReviewResponse();
  return { accepted, reasons, inputFingerprint, settingsRevision };
}

/**
 * Parses the reason array.
 *
 * The vocabulary is closed, the reasons are unique and every member is a
 * string. SQL returns them deduplicated and sorted; a duplicate means the
 * answer was not produced by that SQL.
 */
function parseReasons(raw: unknown): ShipaReviewReason[] | null {
  if (!Array.isArray(raw)) return null;
  const items: readonly unknown[] = raw;
  const reasons: ShipaReviewReason[] = [];
  for (const item of items) {
    if (typeof item !== "string") return null;
    if (!(SHIPA_REVIEW_REASONS as readonly string[]).includes(item)) return null;
    const reason = item as ShipaReviewReason;
    if (reasons.includes(reason)) return null;
    reasons.push(reason);
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// The manual summary
// ---------------------------------------------------------------------------

/**
 * Parses the answer of one manual request.
 *
 * A manual request records and adopts an unattempted intent. The answer must
 * therefore be a queued shipment with no attempt, no provider reference and
 * no retry time. An attempted or created answer is refused: it would describe
 * a dispatch this operation never performed.
 */
export function parseShipaReviewManualSummary(
  raw: unknown,
): ShipaSubmissionSafeSummary {
  if (!isPlainRecord(raw)) throw invalidReviewResponse();
  const shipmentId = readUuid(raw["shipment_id"]);
  if (shipmentId === null) throw invalidReviewResponse();
  const summary = parseSummary(raw, shipmentId);
  if (
    summary.state !== "queued" ||
    summary.attemptCount !== 0 ||
    summary.shipaRef !== null ||
    summary.retryAt !== null
  ) {
    throw invalidReviewResponse();
  }
  return summary;
}

// ---------------------------------------------------------------------------
// The targeted read
// ---------------------------------------------------------------------------

/**
 * Parses the answer of one targeted read.
 *
 * The full eighteen-member key set is checked first, so a document that
 * carries a payload, a credential or any other extra member is refused before
 * a single member is projected. The eleven summary members are then handed to
 * the existing safe summary parser, which stays their only authority.
 */
export function parseShipaReviewShipmentRead(
  raw: unknown,
  expectedShipmentId: string,
): ShipaReviewShipmentRead {
  if (!isPlainRecord(raw)) throw invalidReviewResponse();
  if (!hasExactKeys(raw, READ_KEYS)) throw invalidReviewResponse();
  const shipmentId = readUuid(raw["shipment_id"]);
  if (shipmentId === null) throw invalidReviewResponse();
  if (shipmentId !== expectedShipmentId.toLowerCase()) {
    throw invalidReviewResponse();
  }
  const orderId = readUuid(raw["order_id"]);
  if (orderId === null) throw invalidReviewResponse();
  const environment = raw["environment"];
  if (!isReviewEnvironment(environment)) throw invalidReviewResponse();
  const source = raw["source"];
  if (!isReviewSource(source)) throw invalidReviewResponse();
  const customerRef = readNullableReference(raw["customer_ref"]);
  if (customerRef === null || customerRef === undefined || customerRef.length > 64) {
    throw invalidReviewResponse();
  }
  const createdAt = readTimestamp(raw["created_at"]);
  if (createdAt === null) throw invalidReviewResponse();
  const reviewedFingerprint = readNullableHex64(raw["reviewed_fingerprint"]);
  if (reviewedFingerprint === undefined) throw invalidReviewResponse();
  const inputFingerprint = readNullableHex64(raw["input_fingerprint"]);
  if (inputFingerprint === undefined) throw invalidReviewResponse();
  const summary = parseSummary(projectSummary(raw), shipmentId);
  return {
    shipmentId: summary.shipmentId,
    state: summary.state,
    changed: summary.changed,
    conflict: summary.conflict,
    shipaRef: summary.shipaRef,
    providerStatus: summary.providerStatus,
    attemptCount: summary.attemptCount,
    retryCount: summary.retryCount,
    retryAt: summary.retryAt,
    lastErrorCode: summary.lastErrorCode,
    updatedAt: summary.updatedAt,
    orderId,
    environment,
    source,
    customerRef,
    createdAt,
    reviewedFingerprint,
    inputFingerprint,
  };
}

/**
 * Projects the eleven summary members of a read.
 *
 * Nothing else is copied: the read is never spread into a result, so an extra
 * member of the answer can never reach a caller.
 */
function projectSummary(raw: Record<string, unknown>): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const key of SUMMARY_KEYS) projected[key] = raw[key];
  return projected;
}

/**
 * Hands a document to the existing safe summary parser.
 *
 * The parser is the single owner of the state, counter and timestamp rules.
 * Its own failure is remapped onto this slice's closed code and its cause is
 * dropped.
 */
function parseSummary(
  raw: unknown,
  shipmentId: string,
): ShipaSubmissionSafeSummary {
  try {
    return parseShipaSubmissionSafeSummary(raw, shipmentId);
  } catch {
    throw invalidReviewResponse();
  }
}

/** Reads a fingerprint that may be absent. */
function readNullableHex64(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return readHex64(value) ?? undefined;
}

/** True for the environment this slice accepts. */
function isReviewEnvironment(value: unknown): value is ShipaEnvironment {
  return value === "sandbox" || value === "live";
}

/** True for the source this slice accepts. */
function isReviewSource(value: unknown): value is ShipaReviewSource {
  return typeof value === "string" &&
    (REVIEW_SOURCES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// The SQL-state mapping
// ---------------------------------------------------------------------------

/**
 * Maps a rejected database call onto the closed code set.
 *
 * The mapping is by SQLSTATE. The one exception is 55000, which is classified
 * by its exact message token: only the known tokens are recognised and an
 * unknown 55000 is an unavailable service. The upstream text is never
 * returned, attached or interpolated.
 */
export function mapShipaReviewSqlError(error: unknown): ShipaReviewError {
  const sqlState = readSqlStateCode(error);
  if (sqlState === "22023") return new ShipaReviewError("invalid_request");
  if (sqlState === "42501") return new ShipaReviewError("forbidden");
  if (
    sqlState === "40001" || sqlState === "23505" || sqlState === "40P01"
  ) {
    return new ShipaReviewError("conflict");
  }
  if (sqlState === "P0002") return new ShipaReviewError("not_found");
  if (sqlState === "PGRST202") return new ShipaReviewError("upgrade_required");
  if (sqlState === "55000") {
    return new ShipaReviewError(classifyIneligibleMessage(error));
  }
  return new ShipaReviewError("unavailable");
}

/**
 * Classifies one 55000 answer by its exact message token.
 *
 * Only the token is read. The message is compared, never returned.
 */
function classifyIneligibleMessage(error: unknown): ShipaReviewErrorCode {
  const message = readSqlMessage(error);
  if (message === RECONCILIATION_REASON) return "needs_reconciliation";
  if (message !== null && NOT_ELIGIBLE_REASONS.includes(message)) return "not_eligible";
  return "unavailable";
}

/** Reads the SQLSTATE of a database error. */
function readSqlStateCode(error: unknown): string | null {
  if (!isPlainRecord(error)) return null;
  const code = error["code"];
  return typeof code === "string" ? code.trim() : null;
}

/** Reads the message of a database error for an exact token comparison. */
function readSqlMessage(error: unknown): string | null {
  if (!isPlainRecord(error)) return null;
  const message = error["message"];
  return typeof message === "string" ? message : null;
}

/** The single unusable-answer failure of this slice. */
function invalidReviewResponse(): ShipaReviewError {
  return new ShipaReviewError("invalid_response");
}
