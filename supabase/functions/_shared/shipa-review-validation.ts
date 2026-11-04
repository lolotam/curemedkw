// Shipa review — the strict, pure request parsers of the review boundary.
//
// What this module is
// -------------------
// The boundary between an untrusted request and the two review requests that
// reach the database. It parses the preview request, the manual request, the
// delivery overrides, the verified actor and the identifiers.
//
// Every parser is pure and total: it returns `{ok:true,value}` or
// `{ok:false,code:"invalid_request"}` and never throws a raw validation
// error, a Zod issue list or the rejected value.
//
// What this module deliberately does not do
// -----------------------------------------
// * It never trims, normalises or digit-folds a phone number or an address.
//   PostgreSQL's `btrim` and the effective delivery snapshot own that, and
//   the review reason of a blank field is SQL's decision.
// * It never invents a weight, a dimension, a block, a coordinate, a price, a
//   payment fact, a source, a retry count or an identity.
// * It never accepts a second parcel schema: the shared frozen parcel shape
//   is the only parcel authority.
// * It never duplicates the role or session rules. The shared actor helper
//   stays the single owner of the actor descriptor.
//
// Source of truth:
//   docs/integrations/shipa-integrity-rpc-contract.md
//   docs/integrations/shipa-intent-rpc-contract.md
//   supabase/migrations/20261103001200_shipa_integrity.sql
//   supabase/migrations/20261103001500_shipa_intents.sql

import { isPlainRecord } from "./integration-credential-contract.ts";
import {
  hasExactRecordKeys,
  requireShipaServiceActor,
  type ShipaServiceActor,
} from "./shipa-configuration-service-contract.ts";
import {
  type ShipaEnvironment,
  shipaEnvironmentSchema,
  shipaParcelDraftSchema,
} from "./shipa-settings.ts";
import { readHex64, readRevision, readUuid } from "./shipa-submission-validation.ts";
import type {
  ShipaReviewDestinationOverride,
  ShipaReviewManualRequest,
  ShipaReviewOverrides,
  ShipaReviewParcelOverride,
  ShipaReviewPreviewRequest,
} from "./shipa-review-contract.ts";

// ---------------------------------------------------------------------------
// The parse result
// ---------------------------------------------------------------------------

/**
 * The closed outcome of a strict parser.
 *
 * A refusal carries a code and nothing else: no issue list, no raw value and
 * no explanation of which member failed.
 */
export type ShipaReviewParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: "invalid_request" };

function invalidRequest<T>(): ShipaReviewParseResult<T> {
  return { ok: false, code: "invalid_request" };
}

// ---------------------------------------------------------------------------
// The exact key sets
// ---------------------------------------------------------------------------

/** The outer members of one preview call. */
export const SHIPA_REVIEW_PREVIEW_INPUT_KEYS = ["actor", "orderId", "request"];

/** The outer members of one manual call. */
export const SHIPA_REVIEW_MANUAL_INPUT_KEYS = ["actor", "orderId", "request"];

/** The outer members of one targeted read. */
export const SHIPA_REVIEW_READ_INPUT_KEYS = ["actor", "shipmentId"];

const PREVIEW_REQUEST_KEYS = ["environment"];
const PREVIEW_REQUEST_OPTIONAL_KEYS = ["overrides"];

const MANUAL_REQUEST_KEYS = [
  "environment",
  "overrides",
  "expectedSettingsRevision",
  "expectedInputFingerprint",
  "reviewReason",
  "acknowledgePricing",
  "packedConfirmed",
];

const OVERRIDE_KEYS = ["destination", "parcel"];

const DESTINATION_KEYS: readonly string[] = [
  "contactName",
  "contactPhone",
  "countryCode",
  "governorate",
  "city",
  "addressLine",
  "area",
  "block",
  "street",
  "building",
];

// ---------------------------------------------------------------------------
// The bounds
// ---------------------------------------------------------------------------

/** The longest permitted value of one delivery override member. */
export const SHIPA_REVIEW_MAX_OVERRIDE_CODE_POINTS = 1000;

/** The longest permitted review reason, measured in code points. */
export const SHIPA_REVIEW_MAX_REASON_CODE_POINTS = 1000;

/** The highest settings revision a request may expect. */
export const SHIPA_REVIEW_MAX_REVISION = 2147483647;

// ---------------------------------------------------------------------------
// The outer shape
// ---------------------------------------------------------------------------

/**
 * Checks that a call carries exactly the named outer members.
 *
 * An injected actor, proof, provider, endpoint, credential or paid member is
 * refused here rather than stripped: a request that carries authority it was
 * never given is not a request this slice may serve.
 */
export function parseShipaReviewInputShape(
  raw: unknown,
  keys: readonly string[],
): ShipaReviewParseResult<Record<string, unknown>> {
  if (!isPlainRecord(raw)) return invalidRequest();
  if (!hasExactRecordKeys(raw, keys)) return invalidRequest();
  return { ok: true, value: raw };
}

// ---------------------------------------------------------------------------
// The actor
// ---------------------------------------------------------------------------

/**
 * Validates the internal actor descriptor.
 *
 * The shared helper stays the only owner of the actor rules. Its refusal is
 * remapped onto this slice's closed code and its cause is dropped.
 */
export function parseShipaReviewActor(
  raw: unknown,
): ShipaReviewParseResult<ShipaServiceActor> {
  try {
    return { ok: true, value: requireShipaServiceActor(raw) };
  } catch {
    return invalidRequest();
  }
}

// ---------------------------------------------------------------------------
// The identifiers
// ---------------------------------------------------------------------------

/** Validates one order UUID and returns it lowercased. */
export function parseShipaReviewOrderId(
  raw: unknown,
): ShipaReviewParseResult<string> {
  const orderId = readUuid(raw);
  return orderId === null ? invalidRequest() : { ok: true, value: orderId };
}

/** Validates one shipment UUID and returns it lowercased. */
export function parseShipaReviewShipmentId(
  raw: unknown,
): ShipaReviewParseResult<string> {
  const shipmentId = readUuid(raw);
  return shipmentId === null ? invalidRequest() : { ok: true, value: shipmentId };
}

// ---------------------------------------------------------------------------
// The delivery overrides
// ---------------------------------------------------------------------------

/**
 * Parses the permitted delivery overrides.
 *
 * An empty override object is valid: SQL decides what an empty patch means.
 * An unknown member, an unknown nested member, a non-string value or an
 * overlong value is refused.
 */
function parseOverrides(raw: unknown): ShipaReviewOverrides | null {
  if (!isPlainRecord(raw)) return null;
  const present = Object.keys(raw);
  for (const key of present) {
    if (!OVERRIDE_KEYS.includes(key)) return null;
  }
  const overrides: {
    destination?: ShipaReviewDestinationOverride;
    parcel?: ShipaReviewParcelOverride;
  } = {};
  if (Object.prototype.hasOwnProperty.call(raw, "destination")) {
    const destination = parseDestination(raw["destination"]);
    if (destination === null) return null;
    overrides.destination = destination;
  }
  if (Object.prototype.hasOwnProperty.call(raw, "parcel")) {
    const parcel = parseParcel(raw["parcel"]);
    if (parcel === null) return null;
    overrides.parcel = parcel;
  }
  return overrides;
}

/**
 * Parses the partial destination patch.
 *
 * The values are copied verbatim. Trimming, phone normalisation and digit
 * folding belong to SQL, and an Arabic or Persian digit must survive the
 * boundary untouched.
 */
function parseDestination(
  raw: unknown,
): ShipaReviewDestinationOverride | null {
  if (!isPlainRecord(raw)) return null;
  const present = Object.keys(raw);
  const destination: Record<string, string> = {};
  for (const key of present) {
    if (!DESTINATION_KEYS.includes(key)) return null;
    const member = raw[key];
    if (typeof member !== "string") return null;
    if (exceedsCodePointLimit(member, SHIPA_REVIEW_MAX_OVERRIDE_CODE_POINTS)) {
      return null;
    }
    destination[key] = member;
  }
  return destination as ShipaReviewDestinationOverride;
}

/**
 * Parses the complete parcel override.
 *
 * The shared frozen parcel shape is the only authority: one parcel, an
 * optional weight and an optional set of dimensions. A second parcel schema
 * would drift from the settings SQL, so it is never written here.
 */
function parseParcel(raw: unknown): ShipaReviewParcelOverride | null {
  const parsed = shipaParcelDraftSchema.safeParse(raw);
  return parsed.success ? (parsed.data as ShipaReviewParcelOverride) : null;
}

// ---------------------------------------------------------------------------
// The requests
// ---------------------------------------------------------------------------

/**
 * Parses the diagnostic preview request.
 *
 * The request is exactly an environment and, optionally, the delivery
 * overrides. It accepts no payment fact, amount, catalog price, coupon
 * discount, trusted flag, endpoint, credential, provider state or
 * acknowledgement.
 */
export function parseShipaReviewPreviewRequest(
  raw: unknown,
): ShipaReviewParseResult<ShipaReviewPreviewRequest> {
  if (!isPlainRecord(raw)) return invalidRequest();
  if (
    !hasRequiredAndOptionalKeys(
      raw,
      PREVIEW_REQUEST_KEYS,
      PREVIEW_REQUEST_OPTIONAL_KEYS,
    )
  ) {
    return invalidRequest();
  }
  const environment = parseEnvironment(raw["environment"]);
  if (environment === null) return invalidRequest();
  if (!Object.prototype.hasOwnProperty.call(raw, "overrides")) {
    return { ok: true, value: { environment } };
  }
  const overrides = parseOverrides(raw["overrides"]);
  if (overrides === null) return invalidRequest();
  return { ok: true, value: { environment, overrides } };
}

/**
 * Parses the explicit manual review request.
 *
 * The request is exactly the seven members SQL accepts. The overrides are
 * required here: a manual review always states the delivery patch it applies.
 */
export function parseShipaReviewManualRequest(
  raw: unknown,
): ShipaReviewParseResult<ShipaReviewManualRequest> {
  if (!isPlainRecord(raw)) return invalidRequest();
  if (!hasExactRecordKeys(raw, MANUAL_REQUEST_KEYS)) return invalidRequest();
  const environment = parseEnvironment(raw["environment"]);
  if (environment === null) return invalidRequest();
  const overrides = parseOverrides(raw["overrides"]);
  if (overrides === null) return invalidRequest();
  const expectedSettingsRevision = readRevision(
    raw["expectedSettingsRevision"],
    0,
  );
  if (expectedSettingsRevision === null) return invalidRequest();
  const expectedInputFingerprint = readHex64(raw["expectedInputFingerprint"]);
  if (expectedInputFingerprint === null) return invalidRequest();
  const reviewReason = parseReviewReason(raw["reviewReason"]);
  if (reviewReason === null) return invalidRequest();
  const acknowledgePricing = raw["acknowledgePricing"];
  if (typeof acknowledgePricing !== "boolean") return invalidRequest();
  if (raw["packedConfirmed"] !== true) return invalidRequest();
  return {
    ok: true,
    value: {
      environment,
      overrides,
      expectedSettingsRevision,
      expectedInputFingerprint,
      reviewReason,
      acknowledgePricing,
      packedConfirmed: true,
    },
  };
}

// ---------------------------------------------------------------------------
// The small readers
// ---------------------------------------------------------------------------

/** Reads the environment of one request. */
function parseEnvironment(raw: unknown): ShipaEnvironment | null {
  const parsed = shipaEnvironmentSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Reads the review reason.
 *
 * PostgreSQL's `btrim` removes the ASCII space from both ends, and that is
 * the length the database checks. The original value is returned untouched:
 * SQL trims its own copy, and this module never mutates a reviewer's words.
 */
function parseReviewReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = trimAsciiSpaces(raw);
  if (trimmed.length === 0) return null;
  if (exceedsCodePointLimit(trimmed, SHIPA_REVIEW_MAX_REASON_CODE_POINTS)) {
    return null;
  }
  return raw;
}

/** Removes the ASCII space from both ends, exactly as `btrim` does. */
function trimAsciiSpaces(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === " ") start += 1;
  while (end > start && value[end - 1] === " ") end -= 1;
  return value.slice(start, end);
}

/**
 * True when a text is longer than the limit in Unicode code points.
 *
 * The count walks code points, so a supplementary character costs one and not
 * two, and an Arabic or Persian digit counts as the single character it is.
 */
function exceedsCodePointLimit(value: string, maximum: number): boolean {
  let count = 0;
  for (const _character of value) {
    count += 1;
    if (count > maximum) return true;
  }
  return false;
}

/**
 * True when a record carries the required members and, at most, the optional
 * ones — and nothing else.
 */
function hasRequiredAndOptionalKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const present = Object.keys(record);
  if (present.length < required.length) return false;
  if (present.length > required.length + optional.length) return false;
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) return false;
  }
  return present.every((key) => required.includes(key) || optional.includes(key));
}
