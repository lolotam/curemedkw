// Shipa review — the injected, one-call-per-operation review store.
//
// What this module is
// -------------------
// The server-side store of three review operations, each of them exactly one
// database call:
//
//   preview      -> shipa_check_integrity(_order_id, _review_snapshot)
//   requestManual-> shipa_request_manual(_order_id, _request, _actor_id)
//   readShipment -> shipa_read_shipment(_shipment_id, _actor_id)
//
// What this module deliberately does not do
// -----------------------------------------
// * It performs no retry. A refused call is refused; nothing is re-sent and
//   no fingerprint, revision or attempt is re-read.
// * It never reads before it writes, never touches a table directly and never
//   builds a key, an HTTP client, a nested store or a dispatcher.
// * It grants no authority. The integrity answer is a diagnostic, the manual
//   request records an unattempted intent, and the targeted read expires one
//   lease before it answers.
// * It never forwards browser actor claims, proofs, endpoints, credentials,
//   prepared payloads or raw documents. Only the validated SQL arguments,
//   including the server-derived actor id where required, are sent.
//
// Trust boundary
// --------------
// The actor is an INTERNAL, already-verified caller descriptor. Validating
// its UUID syntax is NOT authentication: the future endpoint authenticates
// the request and supplies the id, and SQL independently re-checks the real
// administrator role. The integrity RPC itself takes no actor argument, so
// the store does not invent one.
//
// Source of truth:
//   docs/integrations/shipa-integrity-rpc-contract.md
//   docs/integrations/shipa-intent-rpc-contract.md
//   docs/integrations/shipa-dispatch-state-rpc-contract.md

import { isPlainRecord } from "./integration-credential-contract.ts";
import {
  ShipaReviewError,
  type ShipaReviewIntegrityResult,
  type ShipaReviewManualInput,
  type ShipaReviewManualRequest,
  type ShipaReviewPreviewInput,
  type ShipaReviewPreviewRequest,
  type ShipaReviewReadInput,
  type ShipaReviewRpcClient,
  type ShipaReviewShipmentRead,
  type ShipaReviewStore,
} from "./shipa-review-contract.ts";
import {
  parseShipaReviewActor,
  parseShipaReviewInputShape,
  parseShipaReviewManualRequest,
  parseShipaReviewOrderId,
  parseShipaReviewPreviewRequest,
  parseShipaReviewShipmentId,
  SHIPA_REVIEW_MANUAL_INPUT_KEYS,
  SHIPA_REVIEW_PREVIEW_INPUT_KEYS,
  SHIPA_REVIEW_READ_INPUT_KEYS,
} from "./shipa-review-validation.ts";
import {
  mapShipaReviewSqlError,
  parseShipaReviewIntegrityResult,
  parseShipaReviewManualSummary,
  parseShipaReviewShipmentRead,
} from "./shipa-review-responses.ts";
import type { ShipaSubmissionSafeSummary } from "./shipa-submission-contract.ts";

/**
 * Creates the review store over an injected database client.
 *
 * The module holds no globals, no environment access and no top-level I/O, so
 * the store can be exercised against a fake SDK boundary without a database.
 */
export function createShipaReviewStore(
  options: { readonly client: ShipaReviewRpcClient },
): ShipaReviewStore {
  const client = options.client;

  return {
    async preview(
      input: ShipaReviewPreviewInput,
    ): Promise<ShipaReviewIntegrityResult> {
      const shape = requireInputShape(input, SHIPA_REVIEW_PREVIEW_INPUT_KEYS);
      // The actor is validated even though the integrity RPC takes none: a
      // call that carries a malformed descriptor is not served.
      requireReviewActor(shape["actor"]);
      const orderId = requireOrderId(shape["orderId"]);
      const request = requirePreviewRequest(shape["request"]);
      const snapshot: Record<string, unknown> = {
        environment: request.environment,
      };
      if (request.overrides !== undefined) {
        snapshot["overrides"] = request.overrides;
      }
      const data = await callShipaReviewRpc(client, "shipa_check_integrity", {
        _order_id: orderId,
        _review_snapshot: snapshot,
      });
      return parseShipaReviewIntegrityResult(data);
    },

    async requestManual(
      input: ShipaReviewManualInput,
    ): Promise<ShipaSubmissionSafeSummary> {
      const shape = requireInputShape(input, SHIPA_REVIEW_MANUAL_INPUT_KEYS);
      const actorId = requireReviewActor(shape["actor"]);
      const orderId = requireOrderId(shape["orderId"]);
      const request = requireManualRequest(shape["request"]);
      const data = await callShipaReviewRpc(client, "shipa_request_manual", {
        _order_id: orderId,
        _request: {
          environment: request.environment,
          overrides: request.overrides,
          expectedSettingsRevision: request.expectedSettingsRevision,
          expectedInputFingerprint: request.expectedInputFingerprint,
          reviewReason: request.reviewReason,
          acknowledgePricing: request.acknowledgePricing,
          packedConfirmed: request.packedConfirmed,
        },
        _actor_id: actorId,
      });
      return parseShipaReviewManualSummary(data);
    },

    async readShipment(
      input: ShipaReviewReadInput,
    ): Promise<ShipaReviewShipmentRead | null> {
      const shape = requireInputShape(input, SHIPA_REVIEW_READ_INPUT_KEYS);
      const actorId = requireReviewActor(shape["actor"]);
      const shipmentId = requireShipmentId(shape["shipmentId"]);
      const data = await callShipaReviewRpc(client, "shipa_read_shipment", {
        _shipment_id: shipmentId,
        _actor_id: actorId,
      });
      // A valid SQL null means the shipment does not exist. It is an answer,
      // not a failure, and it never triggers a global sweep.
      if (data === null) return null;
      return parseShipaReviewShipmentRead(data, shipmentId);
    },
  };
}

// ---------------------------------------------------------------------------
// The input guards
// ---------------------------------------------------------------------------

/**
 * Checks that a call carries exactly the named outer members.
 *
 * An injected actor, proof, provider, endpoint, credential or paid member is
 * refused rather than stripped.
 */
function requireInputShape(
  raw: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const parsed = parseShipaReviewInputShape(raw, keys);
  if (!parsed.ok) throw new ShipaReviewError("invalid_request");
  return parsed.value;
}

/**
 * Validates the internal actor descriptor and returns its user id.
 *
 * The shared actor helper stays the only owner of the actor rules, and the
 * validated id is lowercased here.
 */
function requireReviewActor(raw: unknown): string {
  const parsed = parseShipaReviewActor(raw);
  if (!parsed.ok) throw new ShipaReviewError("invalid_request");
  return parsed.value.userId.toLowerCase();
}

/** Validates the order the operation belongs to. */
function requireOrderId(raw: unknown): string {
  const parsed = parseShipaReviewOrderId(raw);
  if (!parsed.ok) throw new ShipaReviewError("invalid_request");
  return parsed.value;
}

/** Validates the shipment the targeted read belongs to. */
function requireShipmentId(raw: unknown): string {
  const parsed = parseShipaReviewShipmentId(raw);
  if (!parsed.ok) throw new ShipaReviewError("invalid_request");
  return parsed.value;
}

/** Validates the diagnostic preview request. */
function requirePreviewRequest(
  raw: unknown,
): ShipaReviewPreviewRequest {
  const parsed = parseShipaReviewPreviewRequest(raw);
  if (!parsed.ok) throw new ShipaReviewError("invalid_request");
  return parsed.value;
}

/** Validates the explicit manual review request. */
function requireManualRequest(
  raw: unknown,
): ShipaReviewManualRequest {
  const parsed = parseShipaReviewManualRequest(raw);
  if (!parsed.ok) throw new ShipaReviewError("invalid_request");
  return parsed.value;
}

// ---------------------------------------------------------------------------
// The database boundary
// ---------------------------------------------------------------------------

/**
 * Performs one database call and turns a rejected promise into a closed
 * failure.
 *
 * The original error is never returned or attached, and a call is never
 * repeated.
 */
async function callShipaReviewRpc(
  client: ShipaReviewRpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let response: unknown;
  try {
    response = await client.rpc(fn, args);
  } catch {
    // A rejected transport cannot prove whether the RPC committed. Only a
    // resolved SDK SQL-error envelope can classify a definitive refusal.
    throw new ShipaReviewError("unavailable");
  }
  if (
    !isPlainRecord(response) ||
    !Object.prototype.hasOwnProperty.call(response, "data") ||
    !Object.prototype.hasOwnProperty.call(response, "error")
  ) {
    throw new ShipaReviewError("invalid_response");
  }
  if (response["error"] !== null) {
    throw mapShipaReviewSqlError(response["error"]);
  }
  return response["data"];
}
