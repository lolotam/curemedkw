// Shipa review — the closed failure surface, the safe types and the internal
// store contract of the authenticated review boundary.
//
// What this module is
// -------------------
// The vocabulary of three server-side operations on the Shipa review path:
//
//   shipa_check_integrity  — a diagnostic preview of one order
//   shipa_request_manual   — an explicit staff review/adoption of one order
//   shipa_read_shipment    — a targeted, MUTATING read of one shipment
//
// It owns the closed error codes and their fixed messages, the fixed review
// reason vocabulary, the safe request and result shapes and the structural
// database client the store is built over.
//
// What this module deliberately does not do
// -----------------------------------------
// * It grants no dispatch authority. The integrity answer is diagnostic only:
//   it is never paid evidence, never eligibility and never permission to send
//   a provider request.
// * It never invents a provider booking. A manual request records and adopts an
//   unattempted intent; it never creates a shipment with a carrier.
// * It holds no I/O, no globals, no environment access and no logging. Every
//   failure it reports is fixed text: a rejected value, a SQL message, a SQL
//   detail, a hint, a provider body and a fingerprint never reach a caller.
//
// Trust boundary
// --------------
// The actor is an INTERNAL, already-verified caller descriptor produced by the
// future endpoint's authenticated `auth.getUser` result and its real-role
// lookup. Verifying the UUID syntax here is NOT authentication: it only keeps
// a malformed or browser-supplied descriptor from reaching the database. SQL
// independently re-checks the real administrator role.
//
// Source of truth:
//   docs/integrations/shipa-integrity-rpc-contract.md
//   docs/integrations/shipa-intent-rpc-contract.md
//   docs/integrations/shipa-dispatch-state-rpc-contract.md
//   supabase/migrations/20261103001200_shipa_integrity.sql
//   supabase/migrations/20261103001500_shipa_intents.sql
//   supabase/migrations/20261103001100_shipa_dispatch_state.sql

import type { ShipaServiceActor } from "./shipa-configuration-service-contract.ts";
import type { ShipaEnvironment } from "./shipa-settings.ts";
import type { ShipaSubmissionSafeSummary } from "./shipa-submission-contract.ts";

// ---------------------------------------------------------------------------
// Closed failures
// ---------------------------------------------------------------------------

/**
 * The closed set of failures the review slice can report.
 *
 * Nothing outside this list is ever produced, and a code never carries a
 * value: the message is fixed text and never contains an input, a SQL message,
 * a SQL detail, a hint, a cause, a fingerprint or an upstream body.
 */
export type ShipaReviewErrorCode =
  | "invalid_request"
  | "forbidden"
  | "conflict"
  | "not_found"
  | "not_eligible"
  | "needs_reconciliation"
  | "upgrade_required"
  | "unavailable"
  | "invalid_response";

/**
 * The fixed message of every code.
 *
 * The mapping is exported so a caller can map a code to a transport status
 * without re-deriving the text, and so a test can prove that a message never
 * interpolates an input.
 */
export const SHIPA_REVIEW_ERROR_MESSAGES: Readonly<
  Record<ShipaReviewErrorCode, string>
> = {
  invalid_request: "The Shipa review request is not valid.",
  forbidden: "The Shipa review request is not allowed.",
  conflict: "The Shipa review state changed while it was being applied. Reload and try again.",
  not_found: "The Shipa review target does not exist.",
  not_eligible: "The Shipa order is not eligible for this request right now.",
  needs_reconciliation:
    "The Shipa shipment may already have been dispatched and needs reconciliation.",
  upgrade_required: "The Shipa review storage is not available in this deployment yet.",
  unavailable: "The Shipa review service is not available right now.",
  invalid_response: "The Shipa review service returned an unusable response.",
};

/**
 * The single failure type of the review slice.
 *
 * The original cause is deliberately dropped: a SQL error can quote the
 * statement and the row. The code carries the meaning and the message stays
 * fixed.
 */
export class ShipaReviewError extends Error {
  readonly code: ShipaReviewErrorCode;

  constructor(code: ShipaReviewErrorCode) {
    super(SHIPA_REVIEW_ERROR_MESSAGES[code]);
    this.name = "ShipaReviewError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// The review reasons
// ---------------------------------------------------------------------------

/**
 * The fixed review reason codes SQL can return.
 *
 * The list is closed: an unknown code is an unusable answer, not a new reason.
 * SQL returns them deduplicated and sorted.
 */
export const SHIPA_REVIEW_REASONS = [
  "catalog_missing",
  "catalog_price_mismatch",
  "item_total_mismatch",
  "items_missing",
  "subtotal_mismatch",
  "coupon_requires_review",
  "discount_mismatch",
  "order_total_mismatch",
  "unsupported_fee_or_tax",
  "unsupported_currency",
  "destination_incomplete",
  "origin_or_service_incomplete",
  "parcel_incomplete",
] as const;

/** One fixed review reason. */
export type ShipaReviewReason = (typeof SHIPA_REVIEW_REASONS)[number];

// ---------------------------------------------------------------------------
// The request shapes
// ---------------------------------------------------------------------------

/**
 * The permitted destination patch of one review request.
 *
 * Every member is optional and every present value is a plain string. The
 * values are never trimmed, normalised or digit-folded here: SQL owns the
 * effective delivery snapshot and its integrity diagnostics.
 */
export interface ShipaReviewDestinationOverride {
  readonly contactName?: string;
  readonly contactPhone?: string;
  readonly countryCode?: string;
  readonly governorate?: string;
  readonly city?: string;
  readonly addressLine?: string;
  readonly area?: string;
  readonly block?: string;
  readonly street?: string;
  readonly building?: string;
}

/**
 * The complete parcel override of one review request.
 *
 * It is the shared frozen parcel shape: one parcel, an optional weight and an
 * optional set of dimensions. No weight, dimension, block, coordinate or
 * address is invented.
 */
export interface ShipaReviewParcelOverride {
  readonly count: 1;
  readonly weightKg: number | null;
  readonly dimensionsCm: {
    readonly lengthCm: number;
    readonly widthCm: number;
    readonly heightCm: number;
  } | null;
}

/** The permitted delivery overrides of one review request. */
export interface ShipaReviewOverrides {
  readonly destination?: ShipaReviewDestinationOverride;
  readonly parcel?: ShipaReviewParcelOverride;
}

/**
 * The diagnostic preview request.
 *
 * It carries an environment and the optional delivery overrides, and nothing
 * else: no payment fact, amount, catalog price, coupon discount, trusted
 * flag, endpoint, credential, provider state or acknowledgement.
 */
export interface ShipaReviewPreviewRequest {
  readonly environment: ShipaEnvironment;
  readonly overrides?: ShipaReviewOverrides;
}

/**
 * The explicit manual review request.
 *
 * `packedConfirmed` is CureMed staff confirmation, not a Shipa API field, and
 * `acknowledgePricing` is an explicit boolean: only SQL decides which pricing
 * differences a staff member may acknowledge.
 */
export interface ShipaReviewManualRequest {
  readonly environment: ShipaEnvironment;
  readonly overrides: ShipaReviewOverrides;
  readonly expectedSettingsRevision: number;
  readonly expectedInputFingerprint: string;
  readonly reviewReason: string;
  readonly acknowledgePricing: boolean;
  readonly packedConfirmed: true;
}

// ---------------------------------------------------------------------------
// The result shapes
// ---------------------------------------------------------------------------

/**
 * The safe integrity preview.
 *
 * `accepted` means the integrity check found no review issue. It is NOT paid
 * evidence, dispatch eligibility, entitlement or permission to send a provider
 * request.
 */
export interface ShipaReviewIntegrityResult {
  readonly accepted: boolean;
  readonly reasons: readonly ShipaReviewReason[];
  readonly inputFingerprint: string;
  readonly settingsRevision: number;
}

/** Where a shipment intent came from. */
export type ShipaReviewSource = "manual" | "automatic";

/**
 * The safe read of one shipment.
 *
 * It is the existing safe summary plus the safe metadata of the intent. It
 * never carries a prepared draft, a payload, a payload hash, a credential or
 * an attempt token.
 */
export interface ShipaReviewShipmentRead extends ShipaSubmissionSafeSummary {
  readonly orderId: string;
  readonly environment: ShipaEnvironment;
  readonly source: ShipaReviewSource;
  readonly customerRef: string;
  readonly createdAt: string;
  readonly reviewedFingerprint: string | null;
  readonly inputFingerprint: string | null;
}

// ---------------------------------------------------------------------------
// The store contract
// ---------------------------------------------------------------------------

/**
 * The structural slice of a database client this store needs.
 *
 * A real Supabase client satisfies it: its `rpc` returns a promise-like
 * builder. Keeping the dependency structural avoids pulling an SDK runtime
 * into this module and keeps the fake boundary in the tests honest.
 */
export interface ShipaReviewRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<unknown>;
}

/**
 * The raw input of one preview call.
 *
 * The members are deliberately `unknown`: the store validates them, so a
 * malformed or injected value is a runtime refusal rather than a value the
 * compiler pretends is safe.
 */
export interface ShipaReviewPreviewInput {
  /** The internal verified actor descriptor. */
  readonly actor: unknown;
  /** The order the preview belongs to. */
  readonly orderId: unknown;
  /** The raw request document. */
  readonly request: unknown;
}

/** The raw input of one manual request call. */
export interface ShipaReviewManualInput {
  /** The internal verified actor descriptor. */
  readonly actor: unknown;
  /** The order the review belongs to. */
  readonly orderId: unknown;
  /** The raw request document. */
  readonly request: unknown;
}

/** The raw input of one targeted read call. */
export interface ShipaReviewReadInput {
  /** The internal verified actor descriptor. */
  readonly actor: unknown;
  /** The shipment the read targets. */
  readonly shipmentId: unknown;
}

/**
 * The internal review store.
 *
 * It performs exactly one database call per operation. It never retries, never
 * reads before it writes, never touches a table directly and never builds a
 * key, an HTTP client, a nested store or a dispatcher.
 */
export interface ShipaReviewStore {
  /**
   * Previews the integrity of one order.
   *
   * The answer is diagnostic only: it is never paid evidence, eligibility or
   * permission to dispatch.
   */
  preview(input: ShipaReviewPreviewInput): Promise<ShipaReviewIntegrityResult>;

  /**
   * Records and adopts one explicit manual review.
   *
   * The operation records an unattempted intent and its review only. It issues
   * no provider request and no dispatch authority.
   */
  requestManual(
    input: ShipaReviewManualInput,
  ): Promise<ShipaSubmissionSafeSummary>;

  /**
   * Reads one targeted shipment.
   *
   * The underlying RPC is MUTATING: it expires that shipment's lease before it
   * answers. It is never a read-only health probe and never a global sweep.
   */
  readShipment(
    input: ShipaReviewReadInput,
  ): Promise<ShipaReviewShipmentRead | null>;
}

/** The verified actor descriptor this slice accepts. */
export type ShipaReviewActor = ShipaServiceActor;
