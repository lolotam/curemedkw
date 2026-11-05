// Shipa settings — the closed failure set, the strict SQL document parser and
// the safe response mapper.
//
// This module is the boundary between what the database returns and what the
// Edge layer is allowed to expose. It holds no I/O, no environment access, no
// logging and no cryptography.
//
// Three rules govern everything in here:
//
//   1. A raw SQL document is parsed strictly *before* it is mapped. A
//      malformed, missing or unknown field is a failure, never a default and
//      never a success.
//   2. The public envelope is built field by field from the parsed values. No
//      SQL document is ever spread into an output object.
//   3. Every failure carries a fixed message. A SQL message, detail, hint,
//      cause or rejected value is never returned, attached or logged.
//
// Source of truth for the document shape:
//   docs/integrations/shipa-settings-rpc-contract.md

import {
  isIntegrationUuid,
  isPlainRecord,
} from "./integration-credential-contract.ts";
import { shipaTimestampMilliseconds } from "./shipa-settings-validation.ts";
import {
  SHIPA_MAX_REVISION,
  shipaSettingsSchema,
  type ShipaCredentialMetadata,
  type ShipaPublicSettings,
  type ShipaSettings,
} from "./shipa-settings.ts";

// ---------------------------------------------------------------------------
// Closed failures
// ---------------------------------------------------------------------------

/**
 * The closed set of failures this settings slice can report. Nothing outside
 * this list is ever produced, and a code never carries a value: the message is
 * fixed text and never contains an input, a secret, a SQL fragment or a
 * provider response.
 */
export type ShipaSettingsErrorCode =
  | "credential_missing"
  | "conflict"
  | "forbidden"
  | "invalid_request"
  | "save_before_activation"
  | "configuration_incomplete"
  | "verification_stale"
  | "verification_failed"
  | "origin_city_unmatched"
  | "scheduler_stale"
  | "live_confirmation_required"
  | "runtime_not_ready"
  | "upgrade_required"
  | "unavailable"
  | "invalid_response";

/**
 * The fixed message for every code. The mapping is exported so a caller can
 * map a code to a transport status without re-deriving the text, and so a
 * test can prove that a message never interpolates an input.
 */
export const SHIPA_SETTINGS_ERROR_MESSAGES: Readonly<
  Record<ShipaSettingsErrorCode, string>
> = {
  credential_missing: "The Shipa credential is not configured.",
  conflict: "The Shipa settings were changed by someone else. Reload and try again.",
  forbidden: "The Shipa settings request is not allowed.",
  invalid_request: "The Shipa settings request is not valid.",
  save_before_activation: "Save configuration with delivery disabled, then verify before enabling.",
  configuration_incomplete: "Complete the pickup and parcel configuration.",
  verification_stale: "Run a new connection check before enabling delivery.",
  verification_failed: "The stored credential has not passed verification.",
  origin_city_unmatched: "The pickup city does not match the provider directory.",
  scheduler_stale: "The scheduler has no current successful run.",
  live_confirmation_required: "Switching Shipa to live needs an explicit confirmation.",
  runtime_not_ready:
    "Shipa delivery cannot be enabled yet because the delivery runtime is not ready.",
  upgrade_required: "The Shipa settings storage is not available in this deployment yet.",
  unavailable: "The Shipa settings service is not available right now.",
  invalid_response: "The Shipa settings service returned an unusable response.",
};

/**
 * The single failure type of the settings slice.
 *
 * The original cause is deliberately dropped: a SQL error can quote the
 * statement, the input or the row, and a rejected document can quote a
 * rejected value. The code carries the meaning and the message stays fixed.
 */
export class ShipaSettingsError extends Error {
  readonly code: ShipaSettingsErrorCode;

  constructor(code: ShipaSettingsErrorCode) {
    super(SHIPA_SETTINGS_ERROR_MESSAGES[code]);
    this.name = "ShipaSettingsError";
    this.code = code;
  }
}

/** The exact reason the SQL layer uses when enabling is still refused. */
const RUNTIME_NOT_READY_REASON = "shipa_runtime_not_ready";

/**
 * Maps a rejected database call to a closed code.
 *
 * The mapping is by SQLSTATE and by one exact known reason. Everything else
 * — an unknown state, a missing wrapper, a transport failure — becomes
 * `unavailable`. The SQL message, detail, hint and cause are inspected only
 * to classify the failure and are never returned or attached.
 */
export function mapShipaSqlError(error: unknown): ShipaSettingsError {
  if (isPlainRecord(error)) {
    if (error.message === "shipa_credential_missing") return new ShipaSettingsError("credential_missing");
    if (error.message === "shipa_save_before_activation") return new ShipaSettingsError("save_before_activation");
    if (error.message === "shipa_configuration_incomplete") return new ShipaSettingsError("configuration_incomplete");
    if (error.message === "shipa_verification_stale") return new ShipaSettingsError("verification_stale");
    if (error.message === "shipa_verification_failed") return new ShipaSettingsError("verification_failed");
    if (error.message === "shipa_origin_city_unmatched") return new ShipaSettingsError("origin_city_unmatched");
    if (error.message === "shipa_scheduler_stale") return new ShipaSettingsError("scheduler_stale");
    if (error.message === "shipa_live_confirmation_required") return new ShipaSettingsError("live_confirmation_required");
  }
  const sqlState = readSqlStateCode(error);
  if (sqlState === "40001" || sqlState === "23505" || sqlState === "40P01") return new ShipaSettingsError("conflict");
  if (sqlState === "42501") return new ShipaSettingsError("forbidden");
  if (sqlState === "22023") return new ShipaSettingsError("invalid_request");
  if (sqlState === "55000") {
    return hasRuntimeNotReadyReason(error)
      ? new ShipaSettingsError("runtime_not_ready")
      : new ShipaSettingsError("unavailable");
  }
  if (sqlState === "PGRST202") return new ShipaSettingsError("upgrade_required");
  return new ShipaSettingsError("unavailable");
}

function readSqlStateCode(error: unknown): string | null {
  if (!isPlainRecord(error)) return null;
  const code = error["code"];
  return typeof code === "string" ? code.trim() : null;
}

function hasRuntimeNotReadyReason(error: unknown): boolean {
  if (!isPlainRecord(error)) return false;
  for (const field of ["message", "details"]) {
    const value = error[field];
    if (typeof value !== "string") continue;
    const tokens = value.split(/[^A-Za-z0-9_]+/);
    if (tokens.some((token) => token === RUNTIME_NOT_READY_REASON)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The raw SQL document
// ---------------------------------------------------------------------------

/** The verification summary of the two environments. */
export interface ShipaSettingsVerification {
  readonly sandbox: null;
  readonly live: null;
}

/**
 * The exact document the SQL wrappers return: four top-level keys and
 * nothing else. The settings block holds the six safe keys, and each
 * environment holds its six configuration fields plus the server-derived
 * credential metadata.
 */
export interface ShipaSettingsDocument {
  readonly integration_id: string;
  readonly settings: ShipaSettings;
  readonly worker_last_ok_at: string | null;
  readonly verification: ShipaSettingsVerification;
}

/**
 * The safe envelope the Edge layer returns to a caller. The outer snake_case
 * names of the SQL document become explicit camelCase names, and the nested
 * settings keep the shared contract's own names.
 */
export interface ShipaSettingsEnvelope {
  readonly integrationId: string;
  readonly settings: ShipaSettings;
  readonly workerLastOkAt: string | null;
  readonly verification: ShipaSettingsVerification;
}

const DOCUMENT_FIELDS: readonly string[] = [
  "integration_id",
  "settings",
  "worker_last_ok_at",
  "verification",
];

const VERIFICATION_FIELDS: readonly string[] = ["sandbox", "live"];

/**
 * A SQL timestamp as JSON text, or null. The pattern accepts the timestamp
 * forms PostgreSQL returns, with or without a fractional part and with either
 * a `Z` or a numeric offset.
 */
const SQL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

function isSqlTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !SQL_TIMESTAMP_PATTERN.test(value) || !Number.isFinite(shipaTimestampMilliseconds(value))) return false;
  const date = value.slice(0, 10);
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(record);
  if (present.length !== keys.length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) return false;
  }
  return true;
}

/**
 * Parses a raw SQL document strictly.
 *
 * The document must be a plain object with exactly the four known keys, a
 * real integration id, a settings block that satisfies the shared contract,
 * a worker timestamp that is a SQL timestamp or null, and a verification
 * summary that is exactly `{sandbox:null, live:null}` — the current state of
 * the store, which has no verification writer yet.
 *
 * The credential metadata must be consistent: a present credential carries a
 * rotation timestamp and a positive key version, and an absent credential
 * carries neither. A cipher, a key or any extra field is refused.
 */
export function parseShipaSettingsDocument(raw: unknown): ShipaSettingsDocument {
  if (!isPlainRecord(raw)) throw new ShipaSettingsError("invalid_response");
  if (!hasExactKeys(raw, DOCUMENT_FIELDS)) throw new ShipaSettingsError("invalid_response");

  const integrationId = raw["integration_id"];
  if (!isIntegrationUuid(integrationId)) {
    throw new ShipaSettingsError("invalid_response");
  }

  const workerLastOkAt = raw["worker_last_ok_at"];
  if (workerLastOkAt !== null && !isSqlTimestamp(workerLastOkAt)) {
    throw new ShipaSettingsError("invalid_response");
  }

  const verification = parseShipaVerification(raw["verification"]);
  const settings = parseShipaDocumentSettings(raw["settings"]);

  return {
    integration_id: integrationId.toLowerCase(),
    settings,
    worker_last_ok_at: workerLastOkAt,
    verification,
  };
}

function parseShipaVerification(raw: unknown): ShipaSettingsVerification {
  if (!isPlainRecord(raw)) throw new ShipaSettingsError("invalid_response");
  if (!hasExactKeys(raw, VERIFICATION_FIELDS)) throw new ShipaSettingsError("invalid_response");
  if (raw["sandbox"] !== null || raw["live"] !== null) {
    throw new ShipaSettingsError("invalid_response");
  }
  return { sandbox: null, live: null };
}

function parseShipaDocumentSettings(raw: unknown): ShipaSettings {
  const parsed = shipaSettingsSchema.safeParse(raw);
  if (!parsed.success) throw new ShipaSettingsError("invalid_response");
  const settings = parsed.data;
  if (!Number.isSafeInteger(settings.revision) || settings.revision > SHIPA_MAX_REVISION + 1) {
    throw new ShipaSettingsError("invalid_response");
  }
  assertCredentialMetadata(settings.sandbox.credential);
  assertCredentialMetadata(settings.live.credential);
  return settings;
}

function assertCredentialMetadata(metadata: ShipaCredentialMetadata): void {
  if (metadata.present) {
    if (!isSqlTimestamp(metadata.rotatedAt)) throw new ShipaSettingsError("invalid_response");
    if (metadata.keyVersion === null || !Number.isSafeInteger(metadata.keyVersion)
      || metadata.keyVersion < 1 || metadata.keyVersion > 2147483647) {
      throw new ShipaSettingsError("invalid_response");
    }
    return;
  }
  if (metadata.rotatedAt !== null || metadata.keyVersion !== null) {
    throw new ShipaSettingsError("invalid_response");
  }
}

// ---------------------------------------------------------------------------
// The safe envelope
// ---------------------------------------------------------------------------

/**
 * Maps a parsed document to the safe envelope.
 *
 * Every value is copied field by field. Nothing is spread, so a SQL document
 * can never contribute a field the contract does not name, and no credential
 * tuple, ciphertext or plaintext can ride along.
 */
export function toShipaSettingsEnvelope(document: ShipaSettingsDocument): ShipaSettingsEnvelope {
  return {
    integrationId: document.integration_id,
    settings: {
      enabled: document.settings.enabled,
      environment: document.settings.environment,
      dispatchMode: document.settings.dispatchMode,
      revision: document.settings.revision,
      sandbox: toSafePublicSettings(document.settings.sandbox),
      live: toSafePublicSettings(document.settings.live),
    },
    workerLastOkAt: document.worker_last_ok_at,
    verification: { sandbox: null, live: null },
  };
}

function toSafePublicSettings(source: ShipaPublicSettings): ShipaPublicSettings {
  return {
    appId: source.appId,
    origin: {
      contactName: source.origin.contactName,
      contactPhone: source.origin.contactPhone,
      address: {
        countryCode: source.origin.address.countryCode,
        governorate: source.origin.address.governorate,
        area: source.origin.address.area,
        block: source.origin.address.block,
        street: source.origin.address.street,
        building: source.origin.address.building,
        addressLine: source.origin.address.addressLine,
      },
    },
    serviceCode: source.serviceCode,
    autoConfirm: source.autoConfirm,
    pickupInstructions: source.pickupInstructions,
    parcel: {
      count: source.parcel.count,
      weightKg: source.parcel.weightKg,
      dimensionsCm: source.parcel.dimensionsCm === null
        ? null
        : {
          lengthCm: source.parcel.dimensionsCm.lengthCm,
          widthCm: source.parcel.dimensionsCm.widthCm,
          heightCm: source.parcel.dimensionsCm.heightCm,
        },
    },
    credential: {
      present: source.credential.present,
      rotatedAt: source.credential.rotatedAt,
      keyVersion: source.credential.keyVersion,
    },
  };
}
