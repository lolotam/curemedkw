// Shipa configuration services — the closed failure surface, the strict action
// parsing and the safe readiness shapes.
//
// This module is the single error vocabulary of the credential service and the
// readiness service. It owns the closed codes, their fixed messages, the SQL
// failure mapping, the validated actor and the strict parsers of the two
// server actions. The readiness shapes live with the readiness parser in
// `shipa-readiness-responses.ts`.
//
// It holds no I/O, no cryptography, no network access and no logging. Every
// failure it reports is fixed text: a rejected value, an API key, a
// ciphertext, a nonce, a fingerprint, a SQL fragment and an upstream body
// never reach a caller.
//
// Source of truth:
//   docs/integrations/shipa-settings-rpc-contract.md
//   docs/integrations/shipa-readiness-rpc-contract.md
//   docs/superpowers/plans/2026-11-02-shipa-delivery.md (tasks 5, 6)
//
// Trust boundary: the actor is a server-verified descriptor. A browser payload
// is never actor authority, so every action is parsed from a strict shape
// that has no room for an actor, an endpoint, a proof or a credential.

import { z } from "zod";

import {
  INTEGRATION_CREDENTIAL_MAX_PLAINTEXT_BYTES,
  isIntegrationUuid,
  isPlainRecord,
} from "./integration-credential-contract.ts";
import {
  SHIPA_MAX_REVISION,
  shipaEnvironmentSchema,
  type ShipaSaveableSettings,
} from "./shipa-settings.ts";
import { parseShipaSaveRequest } from "./shipa-settings-validation.ts";
import type { ShipaEnvironment } from "./shipa-contract.ts";

// ---------------------------------------------------------------------------
// Closed failures
// ---------------------------------------------------------------------------

/**
 * The closed set of failures the configuration services can report.
 *
 * Nothing outside this list is ever produced, and a code never carries a
 * value: the message is fixed text and never contains an input, a secret, a
 * ciphertext, a nonce, a SQL message, a SQL detail, a hint or a cause.
 */
export type ShipaConfigurationErrorCode =
  | "invalid_request"
  | "invalid_configuration"
  | "conflict"
  | "forbidden"
  | "credential_in_use"
  | "runtime_not_ready"
  | "upgrade_required"
  | "unavailable"
  | "invalid_response"
  | "credential_missing"
  | "unknown_key_version"
  | "decryption_failed";

/**
 * The fixed message for every code.
 *
 * The mapping is exported so a caller can map a code to a transport status
 * without re-deriving the text, and so a test can prove that a message never
 * interpolates an input.
 */
export const SHIPA_CONFIGURATION_ERROR_MESSAGES: Readonly<
  Record<ShipaConfigurationErrorCode, string>
> = {
  invalid_request: "The Shipa configuration request is not valid.",
  invalid_configuration:
    "The Shipa configuration service is not set up correctly.",
  conflict:
    "The Shipa configuration was changed by someone else. Reload and try again.",
  forbidden: "The Shipa configuration request is not allowed.",
  credential_in_use:
    "The Shipa credential is still in use by an order that may still be dispatched.",
  runtime_not_ready:
    "Shipa delivery cannot be enabled yet because the delivery runtime is not ready.",
  upgrade_required:
    "The Shipa configuration storage is not available in this deployment yet.",
  unavailable: "The Shipa configuration service is not available right now.",
  invalid_response:
    "The Shipa configuration service returned an unusable response.",
  credential_missing: "The Shipa credential is not configured.",
  unknown_key_version:
    "No Shipa credential key is available for the stored key version.",
  decryption_failed: "The Shipa credential could not be decrypted.",
};

/**
 * The single failure type of the configuration services.
 *
 * The original cause is deliberately dropped: a SQL error can quote the
 * statement and the row, and a crypto exception can quote the material it was
 * given. The code carries the meaning and the message stays fixed.
 */
export class ShipaConfigurationError extends Error {
  readonly code: ShipaConfigurationErrorCode;

  constructor(code: ShipaConfigurationErrorCode) {
    super(SHIPA_CONFIGURATION_ERROR_MESSAGES[code]);
    this.name = "ShipaConfigurationError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// The actor
// ---------------------------------------------------------------------------

/**
 * The verified server descriptor of the administrator behind a request.
 *
 * It is produced by the authentication layer and is never read from a request
 * body, a header or a query string.
 */
export interface ShipaServiceActor {
  readonly userId: string;
}

/**
 * Validates the actor descriptor.
 *
 * Only the user id crosses the boundary, and only in its real UUID syntax. A
 * descriptor that carries anything else — a role, a token, a claim, a raw
 * request field — is refused rather than partly trusted.
 */
export function requireShipaServiceActor(actor: unknown): ShipaServiceActor {
  if (!isPlainRecord(actor)) {
    throw new ShipaConfigurationError("invalid_request");
  }
  if (!hasExactRecordKeys(actor, ["userId"])) {
    throw new ShipaConfigurationError("invalid_request");
  }
  const userId = actor["userId"];
  if (!isIntegrationUuid(userId)) {
    throw new ShipaConfigurationError("invalid_request");
  }
  return { userId: userId.toLowerCase() };
}

// ---------------------------------------------------------------------------
// Strict action parsing
// ---------------------------------------------------------------------------

/** True when the record carries exactly the named own keys and nothing else. */
export function hasExactRecordKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const present = Object.keys(record);
  if (present.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

/**
 * The credential action of one save.
 *
 * `replace` carries the new key, `preserve` and `remove` carry none. The
 * discriminator is closed: there is no fourth mode.
 */
export type ShipaCredentialAction =
  | { readonly environment: ShipaEnvironment; readonly mode: "preserve" }
  | { readonly environment: ShipaEnvironment; readonly mode: "remove" }
  /** The new key. Present only for `replace`. */
  | {
    readonly environment: ShipaEnvironment;
    readonly mode: "replace";
    readonly apiKey: string;
  };

/** The validated credential save action. */
export interface ShipaCredentialSaveRequest {
  readonly expectedRevision: number;
  /** The validated safe settings patch. */
  readonly settings: ShipaSaveableSettings;
  readonly credential: ShipaCredentialAction;
}

/** The validated readiness diagnosis action. */
export interface ShipaReadinessDiagnosisRequest {
  readonly expectedRevision: number;
  readonly environment: ShipaEnvironment;
}

/**
 * The result of parsing one action.
 *
 * A refused action carries no reason beyond the fact of the refusal: the
 * fixed message of `invalid_request` is the whole answer, so a rejected value
 * and a raw schema issue never reach a caller.
 */
export type ShipaConfigurationParseResult<T> =
  | { readonly ok: true; readonly request: T }
  | { readonly ok: false };

const credentialActionSchema = z.discriminatedUnion("mode", [
  z.object({
    environment: shipaEnvironmentSchema,
    mode: z.literal("preserve"),
  }).strict(),
  z.object({
    environment: shipaEnvironmentSchema,
    mode: z.literal("replace"),
    apiKey: z.string().trim().refine((credential) =>
      new TextEncoder().encode(credential).byteLength <=
        INTEGRATION_CREDENTIAL_MAX_PLAINTEXT_BYTES
    ),
  }).strict(),
  z.object({
    environment: shipaEnvironmentSchema,
    mode: z.literal("remove"),
  }).strict(),
]);

const credentialSaveRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative().max(SHIPA_MAX_REVISION),
  settings: z.unknown(),
  credential: credentialActionSchema,
}).strict();

const readinessDiagnosisRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative().max(SHIPA_MAX_REVISION),
  environment: shipaEnvironmentSchema,
}).strict();

/**
 * Parses the raw credential save request.
 *
 * The request is exactly `{expectedRevision, settings, credential}`. An
 * unknown top-level key — an actor, an endpoint, a proof, a ciphertext, an
 * envelope, a credential metadata block — is refused rather than mapped away,
 * and the settings are validated by the existing shared parser instead of a
 * second copy of the schema.
 */
export function parseShipaCredentialSaveRequest(
  raw: unknown,
): ShipaConfigurationParseResult<ShipaCredentialSaveRequest> {
  if (!isPlainRecord(raw)) return { ok: false };
  if (
    !hasExactRecordKeys(raw, ["expectedRevision", "settings", "credential"])
  ) {
    return { ok: false };
  }
  const parsed = credentialSaveRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };

  const expectedRevision = parsed.data.expectedRevision;
  const settingsParsed = parseShipaSaveRequest({
    expectedRevision,
    settings: parsed.data.settings,
  });
  const saveRequest = settingsParsed.request;
  if (!settingsParsed.ok || saveRequest === undefined) {
    return { ok: false };
  }

  const credential: ShipaCredentialAction = parsed.data.credential;

  return {
    ok: true,
    request: {
      expectedRevision,
      settings: saveRequest.settings,
      credential,
    },
  };
}

/**
 * Parses the raw readiness diagnosis request.
 *
 * The request is exactly `{expectedRevision, environment}`. A caller
 * observation, a proof, an endpoint, a key, an actor id and every other field
 * are refused before any I/O: the observation is built on the server.
 */
export function parseShipaReadinessDiagnosisRequest(
  raw: unknown,
): ShipaConfigurationParseResult<ShipaReadinessDiagnosisRequest> {
  if (!isPlainRecord(raw)) return { ok: false };
  if (!hasExactRecordKeys(raw, ["expectedRevision", "environment"])) {
    return { ok: false };
  }
  const parsed = readinessDiagnosisRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  return {
    ok: true,
    request: {
      expectedRevision: parsed.data.expectedRevision,
      environment: parsed.data.environment,
    },
  };
}

// ---------------------------------------------------------------------------
// The SQL failure mapping
// ---------------------------------------------------------------------------

/** The exact reason the SQL layer uses when a credential is still in use. */
const CREDENTIAL_IN_USE_REASON = "shipa_credential_in_use";

/** The exact reason the SQL layer uses when enabling is still refused. */
const RUNTIME_NOT_READY_REASON = "shipa_runtime_not_ready";

/**
 * Maps a rejected database call to a closed code.
 *
 * The mapping is by SQLSTATE and by one exact known reason. Everything else —
 * an unknown state or a transport failure — becomes `unavailable`; a missing
 * wrapper is `upgrade_required`. The SQL message and detail are inspected only
 * to classify the failure and are never returned or attached.
 */
export function mapShipaConfigurationSqlError(
  error: unknown,
): ShipaConfigurationError {
  const sqlState = readSqlStateCode(error);
  if (
    sqlState === "40001" || sqlState === "23505" || sqlState === "40P01"
  ) {
    return new ShipaConfigurationError("conflict");
  }
  if (sqlState === "42501") {
    return new ShipaConfigurationError("forbidden");
  }
  if (sqlState === "PGRST202") {
    return new ShipaConfigurationError("upgrade_required");
  }
  if (sqlState === "55000") {
    if (hasExactReason(error, CREDENTIAL_IN_USE_REASON)) {
      return new ShipaConfigurationError("credential_in_use");
    }
    if (hasExactReason(error, RUNTIME_NOT_READY_REASON)) {
      return new ShipaConfigurationError("runtime_not_ready");
    }
    return new ShipaConfigurationError("unavailable");
  }
  return new ShipaConfigurationError("unavailable");
}

function readSqlStateCode(error: unknown): string | null {
  if (!isPlainRecord(error)) return null;
  const code = error["code"];
  return typeof code === "string" ? code.trim() : null;
}

/**
 * Detects one exact reason token.
 *
 * The value is split on every character that is not part of a token, so a
 * longer word that merely contains the reason is not a match.
 */
function hasExactReason(error: unknown, reason: string): boolean {
  if (!isPlainRecord(error)) return false;
  for (const field of ["message", "details"]) {
    const value = error[field];
    if (typeof value !== "string") continue;
    const tokens = value.split(/[^A-Za-z0-9_]+/);
    if (tokens.some((token) => token === reason)) return true;
  }
  return false;
}
