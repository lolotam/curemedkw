// Shipa shipment actions — the action vocabulary, the strict parsers and the
// closed HTTP failure surface of the authenticated shipment endpoint.
//
// What this module owns
// ---------------------
// Three things the endpoint would otherwise repeat:
//
//   1. The shipment action vocabulary. The endpoint accepts exactly three
//      discriminated shipment actions, and each one has exactly one body
//      shape. An unknown action, an unknown top-level field, a missing
//      request and a nested actor, proof, endpoint, credential, integration,
//      paid, retry or source field are all refused here.
//   2. The strict parsers of the three bodies. They reuse the existing review
//      request parsers and the existing UUID helpers, so no business, phone,
//      parcel or payment schema is written a second time.
//   3. The closed failure surface. Every failure the shipment actions can
//      report has a fixed code, a fixed status and fixed text.
//
// What this module deliberately does not do
// -----------------------------------------
// * It grants no dispatch authority and it performs no I/O. The canonical
//   binding, the credential and the provider request belong to the manual
//   service.
// * It never reads the environment, never logs and never keeps a secret.
//   A rejected body is never echoed, and no rejected value, SQL message,
//   upstream detail, fingerprint, draft or key reaches a caller.
//
// Trust boundary
// --------------
// The actor is never part of a shipment body. A body actor, a body role, a
// body proof, an identity-like header and an identity-like query parameter
// are all refused or ignored: only the verified session identity is authority.

import {
  hasExactRecordKeys,
  ShipaConfigurationError,
  type ShipaConfigurationErrorCode,
} from "./shipa-configuration-service-contract.ts";
import {
  ShipaCredentialLoaderError,
  type ShipaCredentialLoaderErrorCode,
} from "./shipa-credential-loader-contract.ts";
import { isShipaExecutionBudgetError } from "./shipa-execution-budget.ts";
import {
  SHIPA_REVIEW_ERROR_MESSAGES,
  ShipaReviewError,
  type ShipaReviewErrorCode,
  type ShipaReviewManualRequest,
  type ShipaReviewPreviewRequest,
} from "./shipa-review-contract.ts";
import {
  parseShipaReviewManualRequest,
  parseShipaReviewOrderId,
  parseShipaReviewPreviewRequest,
  parseShipaReviewShipmentId,
} from "./shipa-review-validation.ts";
import {
  ShipaSubmissionError,
  type ShipaSubmissionErrorCode,
} from "./shipa-submission-contract.ts";
import { isPlainRecord } from "./integration-credential-contract.ts";

// ---------------------------------------------------------------------------
// The action vocabulary
// ---------------------------------------------------------------------------

/** The three shipment actions of the admin endpoint. */
export const SHIPA_SHIPMENT_ACTIONS = [
  "shipment.preview",
  "shipment.read",
  "shipment.create",
] as const;

/** The action name of one shipment request. */
export type ShipaShipmentAction = (typeof SHIPA_SHIPMENT_ACTIONS)[number];

/**
 * One validated shipment action.
 *
 * The nested requests are the validated review requests. The order and the
 * shipment are the validated identifiers, already lower-cased. No member
 * carries an actor, a role, a proof, an integration, an endpoint, a
 * credential, a paid flag, a retry count or a source.
 */
export type ShipaShipmentParsedAction =
  | {
    readonly action: "shipment.preview";
    readonly orderId: string;
    readonly request: ShipaReviewPreviewRequest;
  }
  | {
    readonly action: "shipment.read";
    readonly shipmentId: string;
  }
  | {
    readonly action: "shipment.create";
    readonly orderId: string;
    readonly request: ShipaReviewManualRequest;
  };

/** The closed result of parsing one shipment request body. */
export type ShipaShipmentParseResult =
  | { readonly ok: true; readonly action: ShipaShipmentParsedAction }
  | { readonly ok: false };

/**
 * True when the body names one of the three shipment actions.
 *
 * The endpoint uses it to choose the failure vocabulary of a refused body:
 * a refused shipment action is answered with the shipment wording and never
 * with the configuration wording.
 */
export function isShipaShipmentActionRequest(raw: unknown): boolean {
  if (!isPlainRecord(raw)) return false;
  const action = raw["action"];
  return typeof action === "string" &&
    (SHIPA_SHIPMENT_ACTIONS as readonly string[]).includes(action);
}

/**
 * Parses the shipment request body.
 *
 * The body is exactly one of the three shapes. A body that names an unknown
 * action, carries an unknown top-level field, omits the request of a write
 * action, or carries a nested actor, proof, endpoint, credential, integration,
 * paid, retry or source field is refused before any key read, any database
 * call and any provider request.
 */
export function parseShipaShipmentAction(
  raw: unknown,
): ShipaShipmentParseResult {
  if (!isPlainRecord(raw)) return { ok: false };

  const action = raw["action"];
  switch (action) {
    case "shipment.preview": {
      if (!hasExactRecordKeys(raw, ["action", "orderId", "request"])) {
        return { ok: false };
      }
      const orderId = parseShipaReviewOrderId(raw["orderId"]);
      if (!orderId.ok) return { ok: false };
      const request = parseShipaReviewPreviewRequest(raw["request"]);
      if (!request.ok) return { ok: false };
      return {
        ok: true,
        action: { action, orderId: orderId.value, request: request.value },
      };
    }

    case "shipment.read": {
      if (!hasExactRecordKeys(raw, ["action", "shipmentId"])) {
        return { ok: false };
      }
      const shipmentId = parseShipaReviewShipmentId(raw["shipmentId"]);
      if (!shipmentId.ok) return { ok: false };
      return {
        ok: true,
        action: { action, shipmentId: shipmentId.value },
      };
    }

    case "shipment.create": {
      if (!hasExactRecordKeys(raw, ["action", "orderId", "request"])) {
        return { ok: false };
      }
      const orderId = parseShipaReviewOrderId(raw["orderId"]);
      if (!orderId.ok) return { ok: false };
      const request = parseShipaReviewManualRequest(raw["request"]);
      if (!request.ok) return { ok: false };
      return {
        ok: true,
        action: { action, orderId: orderId.value, request: request.value },
      };
    }

    default:
      return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// The closed failure surface
// ---------------------------------------------------------------------------

/**
 * The closed set of failures the shipment actions can report.
 *
 * Nothing outside this list is ever produced, and a code never carries a
 * value: the message is fixed text and never contains an input, a SQL
 * message, a SQL detail, a hint, a cause, a fingerprint or an upstream body.
 */
export type ShipaShipmentErrorCode =
  | ShipaReviewErrorCode
  | "operation_uncertain";

/**
 * The fixed message of every code.
 *
 * The nine shared codes reuse the fixed review wording. The tenth one is
 * specific to this slice: it means the canonical state must be reloaded, and
 * it is never permission to retry.
 */
export const SHIPA_SHIPMENT_ERROR_MESSAGES: Readonly<
  Record<ShipaShipmentErrorCode, string>
> = {
  ...SHIPA_REVIEW_ERROR_MESSAGES,
  operation_uncertain:
    "The Shipa shipment may already have been dispatched. Reload its state before any further action.",
};

/** The transport status every closed code maps to. */
const SHIPA_SHIPMENT_ERROR_STATUS: Readonly<
  Record<ShipaShipmentErrorCode, number>
> = {
  invalid_request: 400,
  forbidden: 403,
  conflict: 409,
  not_found: 404,
  not_eligible: 409,
  needs_reconciliation: 409,
  upgrade_required: 503,
  unavailable: 503,
  invalid_response: 502,
  operation_uncertain: 503,
};

/**
 * The single failure type of the shipment actions.
 *
 * The original cause is deliberately dropped: a SQL error can quote the
 * statement and the row, and a crypto exception can quote the material it
 * was given. The code carries the meaning and the message stays fixed.
 */
export class ShipaShipmentError extends Error {
  readonly code: ShipaShipmentErrorCode;

  constructor(code: ShipaShipmentErrorCode) {
    super(SHIPA_SHIPMENT_ERROR_MESSAGES[code]);
    this.name = "ShipaShipmentError";
    this.code = code;
  }
}

/** One mapped failure. It carries a code, a status and fixed text only. */
export interface ShipaShipmentFailure {
  readonly code: ShipaShipmentErrorCode;
  readonly status: number;
  readonly message: string;
}

/**
 * Maps a failure of the shipment graph onto the closed shipment surface.
 *
 * A closed failure keeps its code. Anything else becomes `unavailable` with
 * fixed text: the original message, stack and cause are never returned.
 */
export function mapShipaShipmentFailure(
  error: unknown,
): ShipaShipmentFailure {
  if (error instanceof ShipaShipmentError) {
    return failureFor(error.code);
  }
  if (error instanceof ShipaReviewError) {
    return failureFor(error.code);
  }
  if (error instanceof ShipaConfigurationError) {
    return failureFor(mapConfigurationCode(error.code));
  }
  if (error instanceof ShipaCredentialLoaderError) {
    return failureFor(mapLoaderCode(error.code));
  }
  if (error instanceof ShipaSubmissionError) {
    return failureFor(mapSubmissionCode(error.code));
  }
  if (isShipaExecutionBudgetError(error)) {
    return failureFor("operation_uncertain");
  }
  return failureFor("unavailable");
}

/** Maps a closed configuration code onto the shipment vocabulary. */
function mapConfigurationCode(
  code: ShipaConfigurationErrorCode,
): ShipaShipmentErrorCode {
  switch (code) {
    case "invalid_request":
      return "invalid_request";
    case "upgrade_required":
      return "upgrade_required";
    case "forbidden":
      return "forbidden";
    case "conflict":
      return "conflict";
    case "invalid_response":
      return "invalid_response";
    default:
      return "unavailable";
  }
}

/** Maps a closed loader code onto the shipment vocabulary. */
function mapLoaderCode(
  code: ShipaCredentialLoaderErrorCode,
): ShipaShipmentErrorCode {
  switch (code) {
    case "invalid_binding":
      return "invalid_request";
    case "invalid_response":
    case "context_mismatch":
      return "invalid_response";
    case "unknown_key_version":
    case "upgrade_required":
      return "upgrade_required";
    default:
      return "unavailable";
  }
}

/** Maps a closed submission code onto the shipment vocabulary. */
function mapSubmissionCode(
  code: ShipaSubmissionErrorCode,
): ShipaShipmentErrorCode {
  switch (code) {
    case "invalid_request":
      return "invalid_request";
    case "forbidden":
      return "forbidden";
    case "conflict":
      return "conflict";
    case "not_found":
      return "not_found";
    case "ineligible":
      return "not_eligible";
    case "invalid_response":
      return "invalid_response";
    case "upgrade_required":
      return "upgrade_required";
    default:
      return "unavailable";
  }
}

/** Builds one failure with its fixed status and fixed message. */
function failureFor(code: ShipaShipmentErrorCode): ShipaShipmentFailure {
  return {
    code,
    status: SHIPA_SHIPMENT_ERROR_STATUS[code],
    message: SHIPA_SHIPMENT_ERROR_MESSAGES[code],
  };
}

// ---------------------------------------------------------------------------
// The safe shipment summary
// ---------------------------------------------------------------------------

/**
 * The safe summary of the shipment one manual request produced.
 *
 * It carries the shipment, its order, its environment and the two counters of
 * the recorded attempt. It never carries a draft, a payload, a payload hash,
 * a credential, an attempt token, a fingerprint or a raw provider answer.
 */
export interface ShipaManualShipmentSummary {
  readonly shipmentId: string;
  readonly orderId: string;
  readonly environment: string;
  readonly state: string;
  readonly attemptCount: number;
  readonly retryCount: number;
  readonly updatedAt: string;
}
