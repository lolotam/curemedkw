// Shipa submission store — the one-call-per-operation internal database layer.
//
// What this module is
// -------------------
// The single place that talks to `shipa_prepare_submission`,
// `shipa_begin_submission` and `shipa_complete`. Every operation is exactly
// one call: there is no retry, no direct table access, no fallback RPC and no
// health probe.
//
// What this module deliberately does not do
// -----------------------------------------
// * It never grants send authority. A successful begin is the only answer that
//   carries one, and even then the authority is the caller's to use once.
// * It never recomputes a fingerprint, a hash or a payload. The SQL owns them.
// * It never replaces the credential metadata of the loaded key with the
//   metadata of a fresher preparation. A stale loaded credential stays stale
//   and SQL refuses the begin.
// * It never returns or attaches a SQL message, a SQL detail, a hint, a
//   cause or a provider body.
//
// Source of truth:
//   docs/integrations/shipa-submission-rpc-contract.md
//   docs/integrations/shipa-dispatch-state-rpc-contract.md
//   supabase/migrations/20261103001100_shipa_dispatch_state.sql
//   supabase/migrations/20261103001600_shipa_submission.sql

import {
  isIntegrationUuid,
  isPlainRecord,
} from "./integration-credential-contract.ts";
import { isShipaEnvironment } from "./shipa-contract.ts";
import type { ShipaCreateResult } from "./shipa-client.ts";
import {
  type ShipaSubmissionBegin,
  type ShipaSubmissionBeginRequest,
  type ShipaSubmissionBinding,
  type ShipaSubmissionCredentialBinding,
  ShipaSubmissionError,
  type ShipaSubmissionPreparation,
  type ShipaSubmissionPreparedRequest,
  type ShipaSubmissionRefusal,
  type ShipaSubmissionRpcClient,
  type ShipaSubmissionSafeSummary,
  type ShipaSubmissionStore,
} from "./shipa-submission-contract.ts";
import {
  mapShipaSubmissionSqlError,
  parseShipaSubmissionBegin,
  parseShipaSubmissionPreparation,
  parseShipaSubmissionRefusal,
  parseShipaSubmissionSafeSummary,
  toShipaSubmissionResult,
} from "./shipa-submission-responses.ts";

/** The injected dependencies of the store. */
export interface ShipaSubmissionStoreOptions {
  /** The database client. It is the RPC boundary, never a table. */
  readonly client: ShipaSubmissionRpcClient;
}

/**
 * Creates the internal submission store over one database client.
 *
 * Nothing is read, resolved or imported at construction time: the store is
 * built eagerly and every operation performs its own single call.
 */
export function createShipaSubmissionStore(
  options: ShipaSubmissionStoreOptions,
): ShipaSubmissionStore {
  const client = options.client;

  return {
    /**
     * Prepares one shipment.
     *
     * The call is MUTATING: SQL may hold unattempted work for review. A
     * refusal is returned as a refusal, never as a failure, so the caller can
     * report the SQL-owned reason.
     */
    async prepare(
      binding: ShipaSubmissionBinding,
    ): Promise<ShipaSubmissionPreparation | ShipaSubmissionRefusal> {
      const bound = requireBinding(binding);
      const data = await callShipaSubmissionRpc(
        client,
        "shipa_prepare_submission",
        { _shipment_id: bound.shipmentId },
      );
      const refusal = parseShipaSubmissionRefusal(data);
      if (refusal !== null) {
        if (refusal.shipmentId !== bound.shipmentId) {
          throw new ShipaSubmissionError("invalid_response");
        }
        return refusal;
      }
      return parseShipaSubmissionPreparation(data, bound);
    },

    /**
     * Commits one attempt.
     *
     * The request carries exactly the six prepared fields. The credential
     * revision and fingerprint are the ones of the key that was loaded and
     * decrypted, so a stale credential is refused by SQL rather than silently
     * upgraded by this layer.
     */
    async begin(
      request: ShipaSubmissionBeginRequest,
    ): Promise<ShipaSubmissionBegin | ShipaSubmissionRefusal> {
      if (
        !isPlainRecord(request) ||
        !exactKeys(request, [
          "binding",
          "preparation",
          "credential",
          "attemptToken",
        ])
      ) {
        throw new ShipaSubmissionError("invalid_request");
      }
      const bound = requireBinding(request?.binding);
      const attemptId = requireUuid(request?.attemptToken);
      const preparation = requirePreparation(request?.preparation);
      if (
        preparation.shipmentId !== bound.shipmentId ||
        preparation.integrationId !== bound.integrationId ||
        preparation.environment !== bound.environment
      ) {
        throw new ShipaSubmissionError("invalid_request");
      }
      const credential = requireCredential(request?.credential);
      const prepared = buildPreparedRequest(preparation, credential);
      const data = await callShipaSubmissionRpc(
        client,
        "shipa_begin_submission",
        {
          _shipment_id: bound.shipmentId,
          _attempt_token: attemptId,
          _prepared: prepared,
        },
      );
      const refusal = parseShipaSubmissionRefusal(data);
      if (refusal !== null) {
        if (refusal.shipmentId !== bound.shipmentId) {
          throw new ShipaSubmissionError("invalid_response");
        }
        return refusal;
      }
      return parseShipaSubmissionBegin(data, {
        binding: bound,
        preparation,
        credential,
        attemptToken: attemptId,
      });
    },

    /**
     * Records the real provider outcome of one attempt.
     *
     * The adapter result is normalised into the exact completion contract
     * first, so the adapter's field and message members can never reach the
     * database. The safe summary SQL returns is the answer: no state is
     * inferred here.
     */
    async complete(
      binding: ShipaSubmissionBinding,
      attemptToken: string,
      result: ShipaCreateResult,
    ): Promise<ShipaSubmissionSafeSummary> {
      const bound = requireBinding(binding);
      const token = requireUuid(attemptToken);
      const normalized = toShipaSubmissionResult(result);
      const data = await callShipaSubmissionRpc(client, "shipa_complete", {
        _shipment_id: bound.shipmentId,
        _attempt_token: token,
        _result: normalized,
      });
      return parseShipaSubmissionSafeSummary(data, bound.shipmentId);
    },
  };
}

// ---------------------------------------------------------------------------
// The request builders
// ---------------------------------------------------------------------------

/**
 * Builds the exact six-field begin request.
 *
 * The whole preparation context is never copied into it, and the credential
 * revision and fingerprint are the ones of the loaded key.
 */
function buildPreparedRequest(
  preparation: ShipaSubmissionPreparation,
  credential: ShipaSubmissionCredentialBinding,
): ShipaSubmissionPreparedRequest {
  return {
    settings_revision: preparation.settingsRevision,
    input_fingerprint: preparation.inputFingerprint,
    credential_revision: credential.credentialRevision,
    credential_fingerprint: credential.credentialFingerprint,
    payload: preparation.payload,
    payload_hash: preparation.payloadHash,
  };
}

// ---------------------------------------------------------------------------
// The input guards
// ---------------------------------------------------------------------------

/**
 * Validates the server-owned binding and normalises its identifiers.
 *
 * A browser never supplies these values; they are the ones the server already
 * owns. Only the syntax is checked here.
 */
function requireBinding(
  binding: ShipaSubmissionBinding,
): ShipaSubmissionBinding {
  if (
    !isPlainRecord(binding) || Object.keys(binding).length !== 3 ||
    !["shipmentId", "integrationId", "environment"].every((key) =>
      Object.hasOwn(binding, key)
    )
  ) {
    throw new ShipaSubmissionError("invalid_request");
  }
  if (!isIntegrationUuid(binding?.shipmentId)) {
    throw new ShipaSubmissionError("invalid_request");
  }
  if (!isIntegrationUuid(binding?.integrationId)) {
    throw new ShipaSubmissionError("invalid_request");
  }
  if (!isShipaEnvironment(binding?.environment)) {
    throw new ShipaSubmissionError("invalid_request");
  }
  return {
    shipmentId: binding.shipmentId.toLowerCase(),
    integrationId: binding.integrationId.toLowerCase(),
    environment: binding.environment,
  };
}

/** Validates the attempt token of one attempt. */
function requireUuid(value: unknown): string {
  if (!isIntegrationUuid(value)) {
    throw new ShipaSubmissionError("invalid_request");
  }
  return value.toLowerCase();
}

/**
 * Validates the captured preparation that a begin request carries.
 *
 * The values were produced by the strict parser of this module, so the check
 * is a guard against a caller that builds a request by hand. The hashes are
 * passed through byte for byte and are never recomputed.
 */
function requirePreparation(
  preparation: ShipaSubmissionPreparation,
): ShipaSubmissionPreparation {
  if (
    !isPlainRecord(preparation) ||
    !exactKeys(preparation, [
      "ready",
      "shipmentId",
      "integrationId",
      "environment",
      "settingsRevision",
      "inputFingerprint",
      "credentialRevision",
      "credentialFingerprint",
      "draft",
      "payload",
      "payloadHash",
    ]) || preparation.ready !== true ||
    !isIntegrationUuid(preparation.shipmentId) ||
    !isIntegrationUuid(preparation.integrationId) ||
    !isShipaEnvironment(preparation.environment)
  ) {
    throw new ShipaSubmissionError("invalid_request");
  }
  if (
    !Number.isSafeInteger(preparation.settingsRevision) ||
    preparation.settingsRevision < 0 ||
    preparation.settingsRevision > 2147483647
  ) {
    throw new ShipaSubmissionError("invalid_request");
  }
  if (
    !Number.isSafeInteger(preparation.credentialRevision) ||
    preparation.credentialRevision < 1 ||
    preparation.credentialRevision > 2147483647
  ) {
    throw new ShipaSubmissionError("invalid_request");
  }
  if (
    !isHex64(preparation.inputFingerprint) ||
    !isHex64(preparation.credentialFingerprint) ||
    !isHex64(preparation.payloadHash)
  ) {
    throw new ShipaSubmissionError("invalid_request");
  }
  if (!isPlainRecord(preparation.payload)) {
    throw new ShipaSubmissionError("invalid_request");
  }
  return preparation;
}

/**
 * Validates the credential metadata of the loaded key.
 *
 * The revision is strictly positive and the fingerprint is the SQL-owned
 * lower-case hexadecimal digest. A stale tuple is not corrected here.
 */
function requireCredential(
  credential: ShipaSubmissionCredentialBinding,
): ShipaSubmissionCredentialBinding {
  if (
    !isPlainRecord(credential) ||
    !exactKeys(credential, ["credentialRevision", "credentialFingerprint"])
  ) {
    throw new ShipaSubmissionError("invalid_request");
  }
  if (
    !Number.isSafeInteger(credential.credentialRevision) ||
    credential.credentialRevision < 1 ||
    credential.credentialRevision > 2147483647
  ) {
    throw new ShipaSubmissionError("invalid_request");
  }
  if (!isHex64(credential.credentialFingerprint)) {
    throw new ShipaSubmissionError("invalid_request");
  }
  return credential;
}

function isHex64(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function exactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(record).length === keys.length &&
    keys.every((key) => Object.hasOwn(record, key));
}

// ---------------------------------------------------------------------------
// The database boundary
// ---------------------------------------------------------------------------

/**
 * Performs one database call and turns a rejected promise into a closed
 * failure. The original error is never returned or attached.
 */
async function callShipaSubmissionRpc(
  client: ShipaSubmissionRpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let response: unknown;
  try {
    response = await client.rpc(fn, args);
  } catch (error) {
    throw mapShipaSubmissionSqlError(error);
  }
  if (
    !isPlainRecord(response) ||
    !Object.hasOwn(response, "data") ||
    !Object.hasOwn(response, "error")
  ) {
    throw new ShipaSubmissionError("invalid_response");
  }
  if (response["error"] !== null) {
    throw mapShipaSubmissionSqlError(response["error"]);
  }
  return response["data"];
}
