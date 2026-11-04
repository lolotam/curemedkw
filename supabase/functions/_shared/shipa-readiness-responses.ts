// Shipa readiness — the observation vocabulary, the strict projection parser
// and the safe readiness shapes.
//
// This module is the boundary between the readiness SQL projection and what
// the Edge layer is allowed to expose. It holds no I/O, no environment access,
// no logging and no cryptography.
//
// Four rules govern everything in here:
//
//   1. The raw SQL document is parsed strictly *before* it is mapped. A
//      malformed, missing or unknown field is a failure, never a default and
//      never a success.
//   2. The safe projection is built field by field from the parsed values. No
//      SQL document is ever spread into an output object.
//   3. Every failure carries a fixed message. A SQL message, detail, hint or
//      cause is never returned, attached or logged.
//   4. The observation vocabulary is closed. An unknown adapter code is never
//      carried into an observation or into the projection.
//
// Source of truth:
//   docs/integrations/shipa-readiness-rpc-contract.md

import { isPlainRecord } from "./integration-credential-contract.ts";
import { shipaTimestampMilliseconds } from "./shipa-settings-validation.ts";
import {
  hasExactRecordKeys,
  ShipaConfigurationError,
} from "./shipa-configuration-service-contract.ts";
import type { ShipaEnvironment } from "./shipa-contract.ts";

// ---------------------------------------------------------------------------
// The observation vocabulary
// ---------------------------------------------------------------------------

/**
 * The fixed adapter failure codes a recorded observation may carry.
 *
 * These are exactly the codes the captured provider contract allows. A local
 * configuration refusal is never a remote observation, so it never appears
 * here.
 */
export const SHIPA_OBSERVATION_FAILURE_CODES = [
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
] as const;
export type ShipaObservationFailureCode =
  (typeof SHIPA_OBSERVATION_FAILURE_CODES)[number];

/** True when the value is one of the permitted observation failure codes. */
export function isShipaObservationFailureCode(
  value: unknown,
): value is ShipaObservationFailureCode {
  return typeof value === "string" &&
    (SHIPA_OBSERVATION_FAILURE_CODES as readonly string[]).includes(value);
}

/**
 * The safe codes the readiness projection may carry.
 *
 * They are the permitted adapter failures plus the three local readiness
 * states the SQL projection documents. `unconfirmed` is not a code: the
 * entitlement is a separate literal.
 */
export const SHIPA_READINESS_SAFE_CODES = [
  ...SHIPA_OBSERVATION_FAILURE_CODES,
  "credential_missing",
  "not_verified",
  "verification_stale",
] as const;
export type ShipaReadinessSafeCode =
  (typeof SHIPA_READINESS_SAFE_CODES)[number];

/** True when the value is one of the permitted readiness safe codes. */
export function isShipaReadinessSafeCode(
  value: unknown,
): value is ShipaReadinessSafeCode {
  return typeof value === "string" &&
    (SHIPA_READINESS_SAFE_CODES as readonly string[]).includes(value);
}

/**
 * The server-built observation of one read-only provider probe.
 *
 * It carries only normalised facts: the SQL-owned fingerprint of the key that
 * was actually loaded, the country identity, the city names and a fixed
 * failure code. A key, a nonce, a ciphertext, an endpoint and a raw upstream
 * body are not part of this shape.
 */
export interface ShipaProviderObservation {
  /** The SQL-owned fingerprint of the credential that was loaded. */
  readonly credentialFingerprint: string;
  /** The verified country identity, or null for a failed probe. */
  readonly countryCode: string | null;
  /** The trimmed city names, empty for a failed probe. */
  readonly cities: readonly string[];
  /** The fixed failure code, or null for a successful probe. */
  readonly code: ShipaObservationFailureCode | null;
  /** Whether the probe proved the credential usable. */
  readonly verified: boolean;
}

// ---------------------------------------------------------------------------
// The safe readiness shapes
// ---------------------------------------------------------------------------

/**
 * The safe readiness facts of one environment.
 *
 * Every boolean is an observation, never activation permission. The
 * entitlement stays the literal `unconfirmed`: a directory vocabulary or a
 * valid key never establishes a merchant entitlement.
 */
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

/**
 * The safe readiness projection of the whole integration.
 *
 * It carries no key, no nonce, no ciphertext, no credential fingerprint and no
 * city directory. The scheduler receipt states whether a matching receipt
 * exists, never that a shipment was booked.
 */
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

/**
 * The three-key acknowledgment of a recorded observation.
 *
 * It is an internal intermediate in the SQL shape. It never reaches a caller
 * and it carries no remote detail.
 */
export interface ShipaObservationAcknowledgement {
  readonly recorded: boolean;
  readonly origin_city_matched: boolean;
  readonly remote_probe_ok: boolean;
}

// ---------------------------------------------------------------------------
// The raw SQL document
// ---------------------------------------------------------------------------

/** The readiness facts of one environment, as SQL returns them. */
export interface ShipaEnvironmentReadinessDocument {
  readonly credential_present: boolean;
  readonly configuration_ready: boolean;
  readonly probe_current: boolean;
  readonly credentials_verified: boolean;
  readonly origin_city_matched: boolean;
  readonly last_checked_at: string | null;
  readonly safe_code: ShipaReadinessSafeCode | null;
  readonly service_entitlement: "unconfirmed";
}

/** The exact document `shipa_read_readiness` returns. */
export interface ShipaReadinessDocument {
  readonly settings_revision: number;
  readonly active_environment: ShipaEnvironment;
  readonly environments: {
    readonly sandbox: ShipaEnvironmentReadinessDocument;
    readonly live: ShipaEnvironmentReadinessDocument;
  };
  readonly scheduler: {
    readonly last_ok_at: string | null;
    readonly current: boolean;
  };
}

const DOCUMENT_FIELDS: readonly string[] = [
  "settings_revision",
  "active_environment",
  "environments",
  "scheduler",
];

const ENVIRONMENT_FIELDS: readonly string[] = ["sandbox", "live"];

const ENVIRONMENT_READINESS_FIELDS: readonly string[] = [
  "credential_present",
  "configuration_ready",
  "probe_current",
  "credentials_verified",
  "origin_city_matched",
  "last_checked_at",
  "safe_code",
  "service_entitlement",
];

const SCHEDULER_FIELDS: readonly string[] = ["last_ok_at", "current"];

const ACKNOWLEDGEMENT_FIELDS: readonly string[] = [
  "recorded",
  "origin_city_matched",
  "remote_probe_ok",
];

/**
 * A SQL timestamp as JSON text, or null.
 *
 * The pattern accepts the timestamp forms PostgreSQL returns, with or without
 * a fractional part and with either a `Z` or a numeric offset. The calendar
 * day is checked as well, so an impossible date is refused instead of being
 * normalised into another one.
 */
const SQL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

function isSqlTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !SQL_TIMESTAMP_PATTERN.test(value) ||
    !Number.isFinite(shipaTimestampMilliseconds(value))
  ) {
    return false;
  }
  const day = value.slice(0, 10);
  return new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new ShipaConfigurationError("invalid_response");
  }
  return value;
}

function requireTimestampOrNull(value: unknown): string | null {
  if (value === null) return null;
  if (!isSqlTimestamp(value)) {
    throw new ShipaConfigurationError("invalid_response");
  }
  return value;
}

function requireEnvironment(value: unknown): ShipaEnvironment {
  if (value !== "sandbox" && value !== "live") {
    throw new ShipaConfigurationError("invalid_response");
  }
  return value;
}

/**
 * Reads the safe code of one environment.
 *
 * A code outside the permitted set is refused: an unknown code is never
 * carried into the projection as if it were a known failure.
 */
function readSafeCode(value: unknown): ShipaReadinessSafeCode | null {
  if (value === null) return null;
  if (!isShipaReadinessSafeCode(value)) {
    throw new ShipaConfigurationError("invalid_response");
  }
  return value;
}

// ---------------------------------------------------------------------------
// The strict parser
// ---------------------------------------------------------------------------

/**
 * Parses the raw readiness document strictly.
 *
 * The document must be a plain object with exactly the four known keys, a
 * non-negative integer revision, a real environment name, exactly the two
 * environment blocks and exactly the scheduler block. An unknown field, a
 * missing field, a non-boolean flag, a malformed timestamp, an unknown safe
 * code and an entitlement other than `unconfirmed` are all refused before
 * anything is mapped.
 */
export function parseShipaReadinessDocument(
  raw: unknown,
): ShipaReadinessDocument {
  if (!isPlainRecord(raw)) {
    throw new ShipaConfigurationError("invalid_response");
  }
  if (!hasExactRecordKeys(raw, DOCUMENT_FIELDS)) {
    throw new ShipaConfigurationError("invalid_response");
  }

  const settingsRevision = raw["settings_revision"];
  if (
    typeof settingsRevision !== "number" ||
    !Number.isSafeInteger(settingsRevision) ||
    settingsRevision < 0
  ) {
    throw new ShipaConfigurationError("invalid_response");
  }

  const environments = raw["environments"];
  if (!isPlainRecord(environments)) {
    throw new ShipaConfigurationError("invalid_response");
  }
  if (!hasExactRecordKeys(environments, ENVIRONMENT_FIELDS)) {
    throw new ShipaConfigurationError("invalid_response");
  }

  return {
    settings_revision: settingsRevision,
    active_environment: requireEnvironment(raw["active_environment"]),
    environments: {
      sandbox: parseEnvironmentReadiness(environments["sandbox"]),
      live: parseEnvironmentReadiness(environments["live"]),
    },
    scheduler: parseScheduler(raw["scheduler"]),
  };
}

function parseEnvironmentReadiness(
  raw: unknown,
): ShipaEnvironmentReadinessDocument {
  if (!isPlainRecord(raw)) {
    throw new ShipaConfigurationError("invalid_response");
  }
  if (!hasExactRecordKeys(raw, ENVIRONMENT_READINESS_FIELDS)) {
    throw new ShipaConfigurationError("invalid_response");
  }

  const safeCode = readSafeCode(raw["safe_code"]);
  if (safeCode !== null && raw["credentials_verified"] === true && raw["probe_current"] === true) {
    throw new ShipaConfigurationError("invalid_response");
  }
  if (raw["service_entitlement"] !== "unconfirmed") {
    throw new ShipaConfigurationError("invalid_response");
  }

  return {
    credential_present: requireBoolean(raw["credential_present"]),
    configuration_ready: requireBoolean(raw["configuration_ready"]),
    probe_current: requireBoolean(raw["probe_current"]),
    credentials_verified: requireBoolean(raw["credentials_verified"]),
    origin_city_matched: requireBoolean(raw["origin_city_matched"]),
    last_checked_at: requireTimestampOrNull(raw["last_checked_at"]),
    safe_code: safeCode,
    service_entitlement: "unconfirmed",
  };
}

function parseScheduler(raw: unknown): ShipaReadinessDocument["scheduler"] {
  if (!isPlainRecord(raw)) {
    throw new ShipaConfigurationError("invalid_response");
  }
  if (!hasExactRecordKeys(raw, SCHEDULER_FIELDS)) {
    throw new ShipaConfigurationError("invalid_response");
  }
  return {
    last_ok_at: requireTimestampOrNull(raw["last_ok_at"]),
    current: requireBoolean(raw["current"]),
  };
}

/**
 * Parses the three-key acknowledgment of a recorded observation.
 *
 * The acknowledgment is exactly `{recorded, origin_city_matched,
 * remote_probe_ok}`. An unrecorded observation is refused: a write that did
 * not record is not a successful diagnosis.
 */
export function parseShipaObservationAcknowledgement(
  raw: unknown,
): ShipaObservationAcknowledgement {
  if (!isPlainRecord(raw)) {
    throw new ShipaConfigurationError("invalid_response");
  }
  if (!hasExactRecordKeys(raw, ACKNOWLEDGEMENT_FIELDS)) {
    throw new ShipaConfigurationError("invalid_response");
  }
  const recorded = requireBoolean(raw["recorded"]);
  if (!recorded) {
    throw new ShipaConfigurationError("invalid_response");
  }
  return {
    recorded,
    origin_city_matched: requireBoolean(raw["origin_city_matched"]),
    remote_probe_ok: requireBoolean(raw["remote_probe_ok"]),
  };
}

// ---------------------------------------------------------------------------
// The safe mapper
// ---------------------------------------------------------------------------

/**
 * Maps a parsed readiness document to the safe projection.
 *
 * Every value is copied field by field. Nothing is spread, so the SQL
 * document can never contribute a field the contract does not name, and no
 * fingerprint, key, nonce or ciphertext can ride along.
 */
export function toShipaReadinessDto(
  document: ShipaReadinessDocument,
): ShipaReadinessDto {
  return {
    settingsRevision: document.settings_revision,
    activeEnvironment: document.active_environment,
    environments: {
      sandbox: toSafeEnvironmentReadiness(document.environments.sandbox),
      live: toSafeEnvironmentReadiness(document.environments.live),
    },
    scheduler: {
      lastOkAt: document.scheduler.last_ok_at,
      current: document.scheduler.current,
    },
  };
}

function toSafeEnvironmentReadiness(
  source: ShipaEnvironmentReadinessDocument,
): ShipaEnvironmentReadinessDto {
  return {
    credentialPresent: source.credential_present,
    configurationReady: source.configuration_ready,
    probeCurrent: source.probe_current,
    credentialsVerified: source.credentials_verified,
    originCityMatched: source.origin_city_matched,
    lastCheckedAt: source.last_checked_at,
    safeCode: source.safe_code,
    serviceEntitlement: source.service_entitlement,
  };
}
