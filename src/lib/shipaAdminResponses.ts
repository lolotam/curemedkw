// Shipa admin — strict parsing of the admin endpoint's HTTP payloads.
//
// What this module owns
// ---------------------
// The admin endpoint answers with exactly one of two envelopes:
//
//   { success: true,  data: <the action's safe projection> }
//   { success: false, error: { code, message } }
//
// This module reads those envelopes strictly and hands the caller either a
// typed projection or a failure code.
//
// Its rules
// ---------
//   1. The wrapper is exact. A missing key, an extra key, a `success` that is
//      not exactly `true` and a missing `data` are all failures — never a
//      default and never a success.
//   2. The failure message is never used. Only a code that belongs to the
//      closed set leaves this module; the UI shows its own fixed wording.
//   3. The settings block is read with the shared settings parser, so the
//      browser and the Edge layer keep exactly one settings vocabulary.
//   4. A field the contract does not name — a key, a nonce, a ciphertext, an
//      endpoint, an actor — is refused rather than stripped.
//   5. The SQL documents are not HTTP data. The snake_case projection of the
//      database is never accepted here.
//
// Source of truth: docs/integrations/shipa-admin-endpoint-contract.md and the
// safe projections of supabase/functions/_shared/shipa-settings-responses.ts
// and shipa-readiness-responses.ts.

import {
  parseShipaSettings,
  shipaTimestampMilliseconds,
  SHIPA_MAX_REVISION,
  type ShipaCredentialMetadata,
  type ShipaEnvironment,
  type ShipaSettings,
} from "@/lib/shipaSettings";

import type { ShipaAdminErrorCode } from "@/lib/shipaAdmin";

// ---------------------------------------------------------------------------
// The safe HTTP shapes
// ---------------------------------------------------------------------------

/**
 * The settings projection of the three settings actions.
 *
 * `integrationId` is the row id of the Shipa integration, `settings` is the
 * shared settings draft with its revision and the safe credential-presence
 * metadata of both environments, and `verification` is the summary block the
 * store owns. No key, ciphertext, nonce or endpoint is part of this shape.
 */
export interface ShipaSettingsEnvelopeDto {
  readonly integrationId: string;
  readonly settings: ShipaSettings;
  readonly workerLastOkAt: string | null;
  readonly verification: { readonly sandbox: null; readonly live: null };
}

/**
 * The closed vocabulary of the safe readiness codes.
 *
 * It mirrors the permitted adapter failures plus the three local readiness
 * states of the readiness projection. A code outside this list is refused
 * rather than carried into the UI as if it were a known failure.
 */
export const SHIPA_READINESS_SAFE_CODES = [
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
  "credential_missing",
  "not_verified",
  "verification_stale",
] as const;

export type ShipaReadinessSafeCode = (typeof SHIPA_READINESS_SAFE_CODES)[number];

/** The safe readiness facts of one environment. */
export interface ShipaEnvironmentReadinessDto {
  readonly credentialPresent: boolean;
  readonly configurationReady: boolean;
  readonly probeCurrent: boolean;
  readonly credentialsVerified: boolean;
  readonly originCityMatched: boolean;
  readonly lastCheckedAt: string | null;
  readonly safeCode: ShipaReadinessSafeCode | null;
  readonly serviceEntitlement: "unconfirmed";
}

/** The safe readiness projection of the whole integration. */
export interface ShipaReadinessDto {
  readonly settingsRevision: number;
  readonly activeEnvironment: ShipaEnvironment;
  readonly environments: {
    readonly sandbox: ShipaEnvironmentReadinessDto;
    readonly live: ShipaEnvironmentReadinessDto;
  };
  readonly scheduler: {
    readonly lastOkAt: string | null;
    readonly current: boolean;
  };
}

// ---------------------------------------------------------------------------
// The parsed results
// ---------------------------------------------------------------------------

/** The result of reading one payload. */
export type ShipaAdminPayloadResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: ShipaAdminErrorCode };

// ---------------------------------------------------------------------------
// Small strict helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(record);
  if (present.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * A timestamp as the store and the readiness projection write it: the SQL
 * timestamp forms, with or without a fractional part and with either a `Z` or
 * a numeric offset. The calendar day is checked too, so an impossible date is
 * refused instead of being normalised into another one.
 */
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) return false;
  if (!Number.isFinite(shipaTimestampMilliseconds(value))) return false;
  const day = value.slice(0, 10);
  return new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

// ---------------------------------------------------------------------------
// The envelopes
// ---------------------------------------------------------------------------

/**
 * Reads the exact wrapper.
 *
 * A success envelope carries `success: true` and a `data` value. A failure
 * envelope carries `success: false` and an `error` object with exactly a
 * `code` and a `message`. The message is read only to confirm that it is
 * text; its content is discarded, because the UI must show its own fixed
 * wording rather than whatever the server said.
 */
export function parseShipaAdminEnvelope(raw: unknown): ShipaAdminPayloadResult<unknown> {
  if (!isRecord(raw)) return { ok: false, code: "invalid_response" };
  if (!hasExactKeys(raw, ["success", "data"]) && !hasExactKeys(raw, ["success", "error"])) {
    return { ok: false, code: "invalid_response" };
  }
  if (!("success" in raw)) return { ok: false, code: "invalid_response" };

  if (raw.success === false) {
    if (!("error" in raw)) return { ok: false, code: "invalid_response" };
    const failure = raw.error;
    if (!isRecord(failure)) return { ok: false, code: "invalid_response" };
    if (!hasExactKeys(failure, ["code", "message"])) {
      return { ok: false, code: "invalid_response" };
    }
    if (typeof failure.message !== "string") return { ok: false, code: "invalid_response" };
    const code = failure.code;
    if (typeof code !== "string") return { ok: false, code: "invalid_response" };
    return { ok: false, code: isKnownErrorCode(code) ? code : "unavailable" };
  }

  if (raw.success !== true) return { ok: false, code: "invalid_response" };
  if (!("data" in raw)) return { ok: false, code: "invalid_response" };
  return { ok: true, data: raw.data };
}

/**
 * The closed codes the admin endpoint can report.
 *
 * The list is duplicated here as a plain literal set so that this module has
 * no runtime dependency on the Edge error vocabulary: the endpoint module is
 * not part of the browser graph.
 */
const KNOWN_ERROR_CODES: readonly string[] = [
  "unauthenticated",
  "forbidden",
  "invalid_request",
  "invalid_json",
  "method_not_allowed",
  "payload_too_large",
  "conflict",
  "credential_in_use",
  "credential_missing",
  "invalid_response",
  "runtime_not_ready",
  "upgrade_required",
  "unavailable",
  "invalid_configuration",
  "unknown_key_version",
  "decryption_failed",
  "unhandled_error",
];

function isKnownErrorCode(value: string): value is ShipaAdminErrorCode {
  return KNOWN_ERROR_CODES.includes(value);
}

// ---------------------------------------------------------------------------
// The settings payload
// ---------------------------------------------------------------------------

const SETTINGS_PAYLOAD_KEYS = ["integrationId", "settings", "workerLastOkAt", "verification"];
const VERIFICATION_KEYS = ["sandbox", "live"];

/**
 * Reads the settings projection of `settings.read`, `settings.save` and
 * `credential.save`.
 *
 * The nested settings block is read with the shared parser, so an unknown
 * field, a credential-like field or an invalid draft is refused here exactly
 * as the Edge layer refuses it.
 */
export function parseShipaSettingsPayload(
  raw: unknown,
): ShipaAdminPayloadResult<ShipaSettingsEnvelopeDto> {
  if (!isRecord(raw)) return { ok: false, code: "invalid_response" };
  if (!hasExactKeys(raw, SETTINGS_PAYLOAD_KEYS)) return { ok: false, code: "invalid_response" };

  const integrationId = raw.integrationId;
  if (!isUuid(integrationId)) return { ok: false, code: "invalid_response" };

  const workerLastOkAt = raw.workerLastOkAt;
  if (workerLastOkAt !== null && !isTimestamp(workerLastOkAt)) {
    return { ok: false, code: "invalid_response" };
  }

  const verification = raw.verification;
  if (!isRecord(verification) || !hasExactKeys(verification, VERIFICATION_KEYS)) {
    return { ok: false, code: "invalid_response" };
  }
  if (verification.sandbox !== null || verification.live !== null) {
    return { ok: false, code: "invalid_response" };
  }

  const settings = parseShipaSettings(raw.settings);
  if (!settings.ok || settings.settings === undefined) {
    return { ok: false, code: "invalid_response" };
  }
  if (
    !Number.isSafeInteger(settings.settings.revision) ||
    settings.settings.revision > SHIPA_MAX_REVISION + 1 ||
    !validCredentialMetadata(settings.settings.sandbox.credential) ||
    !validCredentialMetadata(settings.settings.live.credential)
  ) {
    return { ok: false, code: "invalid_response" };
  }

  return {
    ok: true,
    data: {
      integrationId: integrationId.toLowerCase(),
      settings: settings.settings,
      workerLastOkAt: typeof workerLastOkAt === "string" ? workerLastOkAt : null,
      verification: { sandbox: null, live: null },
    },
  };
}

function validCredentialMetadata(metadata: ShipaCredentialMetadata): boolean {
  if (!metadata.present) return metadata.rotatedAt === null && metadata.keyVersion === null;
  return isTimestamp(metadata.rotatedAt) && Number.isSafeInteger(metadata.keyVersion) &&
    metadata.keyVersion >= 1 && metadata.keyVersion <= 2147483647;
}

// ---------------------------------------------------------------------------
// The readiness payload
// ---------------------------------------------------------------------------

const READINESS_KEYS = ["settingsRevision", "activeEnvironment", "environments", "scheduler"];
const ENVIRONMENT_KEYS = ["sandbox", "live"];
const ENVIRONMENT_READINESS_KEYS = [
  "credentialPresent",
  "configurationReady",
  "probeCurrent",
  "credentialsVerified",
  "originCityMatched",
  "lastCheckedAt",
  "safeCode",
  "serviceEntitlement",
];
const SCHEDULER_KEYS = ["lastOkAt", "current"];

/**
 * Reads the readiness projection of `readiness.read` and
 * `readiness.diagnose`.
 *
 * A diagnosis answers with the same projection, so a negative probe is
 * reported as the facts it is: the flags stay false and the safe code is
 * carried through.
 */
export function parseShipaReadinessPayload(
  raw: unknown,
): ShipaAdminPayloadResult<ShipaReadinessDto> {
  if (!isRecord(raw)) return { ok: false, code: "invalid_response" };
  if (!hasExactKeys(raw, READINESS_KEYS)) return { ok: false, code: "invalid_response" };

  const settingsRevision = raw.settingsRevision;
  if (
    typeof settingsRevision !== "number" ||
    !Number.isSafeInteger(settingsRevision) ||
    settingsRevision < 0
  ) {
    return { ok: false, code: "invalid_response" };
  }

  const activeEnvironment = raw.activeEnvironment;
  if (activeEnvironment !== "sandbox" && activeEnvironment !== "live") {
    return { ok: false, code: "invalid_response" };
  }

  const environments = raw.environments;
  if (!isRecord(environments) || !hasExactKeys(environments, ENVIRONMENT_KEYS)) {
    return { ok: false, code: "invalid_response" };
  }
  const sandbox = parseEnvironmentReadiness(environments.sandbox);
  const live = parseEnvironmentReadiness(environments.live);
  if (sandbox === null || live === null) return { ok: false, code: "invalid_response" };

  const scheduler = parseScheduler(raw.scheduler);
  if (scheduler === null) return { ok: false, code: "invalid_response" };

  return {
    ok: true,
    data: {
      settingsRevision,
      activeEnvironment,
      environments: { sandbox, live },
      scheduler,
    },
  };
}

function parseEnvironmentReadiness(
  raw: unknown,
): ShipaEnvironmentReadinessDto | null {
  if (!isRecord(raw)) return null;
  if (!hasExactKeys(raw, ENVIRONMENT_READINESS_KEYS)) return null;
  if (!isBoolean(raw.credentialPresent)) return null;
  if (!isBoolean(raw.configurationReady)) return null;
  if (!isBoolean(raw.probeCurrent)) return null;
  if (!isBoolean(raw.credentialsVerified)) return null;
  if (!isBoolean(raw.originCityMatched)) return null;

  const lastCheckedAt = raw.lastCheckedAt;
  if (lastCheckedAt !== null && !isTimestamp(lastCheckedAt)) return null;

  const safeCode = raw.safeCode;
  if (safeCode !== null && !isKnownSafeCode(safeCode)) return null;
  if (safeCode !== null && raw.credentialsVerified && raw.probeCurrent) return null;

  if (raw.serviceEntitlement !== "unconfirmed") return null;

  return {
    credentialPresent: raw.credentialPresent,
    configurationReady: raw.configurationReady,
    probeCurrent: raw.probeCurrent,
    credentialsVerified: raw.credentialsVerified,
    originCityMatched: raw.originCityMatched,
    lastCheckedAt: typeof lastCheckedAt === "string" ? lastCheckedAt : null,
    safeCode: isKnownSafeCode(safeCode) ? safeCode : null,
    serviceEntitlement: "unconfirmed",
  };
}

function parseScheduler(raw: unknown): ShipaReadinessDto["scheduler"] | null {
  if (!isRecord(raw)) return null;
  if (!hasExactKeys(raw, SCHEDULER_KEYS)) return null;
  const lastOkAt = raw.lastOkAt;
  if (lastOkAt !== null && !isTimestamp(lastOkAt)) return null;
  if (!isBoolean(raw.current)) return null;
  return { lastOkAt: typeof lastOkAt === "string" ? lastOkAt : null, current: raw.current };
}

function isKnownSafeCode(value: unknown): value is ShipaReadinessSafeCode {
  return (
    typeof value === "string" &&
    (SHIPA_READINESS_SAFE_CODES as readonly string[]).includes(value)
  );
}
