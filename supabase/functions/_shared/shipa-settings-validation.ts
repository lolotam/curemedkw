// Shipa delivery settings — parsing and activation readiness.
//
// This module is the validation half of the shared settings contract. It owns
// the credential-like key rejection, the strict parsers for a settings draft,
// a single environment's draft and a browser save request, and the readiness
// assessment an administrator UI needs before an integration may be activated.
//
// It is split out of `shipa-settings.ts` only to keep both files small and
// to keep the import direction one-way: the schemas live in
// `shipa-settings.ts`, this module reads them.
//
// The module is pure — no React, no Supabase, no Deno, no storage, no network
// use. Every failure it reports is a fixed, safe message: no rejected value,
// no field name from the input and no raw Zod issue ever reaches a caller.

import { z } from "zod";

import {
  SCHEDULER_HEARTBEAT_MAX_AGE_MS,
  missingShipaOriginAddressFields,
  shipaPublicSettingsForEnvironment,
  shipaPublicSettingsSchema,
  shipaSaveRequestSchema,
  shipaSettingsSchema,
  type ShipaPublicSettings,
  type ShipaSaveRequest,
  type ShipaSettings,
} from "./shipa-settings.ts";

// ---------------------------------------------------------------------------
// Credential-like key rejection
// ---------------------------------------------------------------------------

/**
 * Normalised (lower-case, separator-free) names that must never appear in a
 * settings payload. A key, token, ciphertext, signature or arbitrary endpoint
 * has no place in the safe settings contract, and an accidental one must be
 * rejected rather than silently preserved.
 */
const FORBIDDEN_SETTING_KEYS: readonly string[] = [
  "apikey",
  "apitoken",
  "accesstoken",
  "refreshtoken",
  "bearertoken",
  "authtoken",
  "token",
  "secret",
  "secretkey",
  "clientsecret",
  "webhooksecret",
  "apipassword",
  "password",
  "authorization",
  "ciphertext",
  "encryptedkey",
  "nonce",
  "signature",
  "privatekey",
  "credentialvalue",
  "apibaseurl",
  "apiurl",
  "baseurl",
  "endpoint",
  "url",
  "host",
];

/** The single safe message for a credential-like rejection. */
const FORBIDDEN_FIELD_MESSAGE =
  "Credential or endpoint fields are not allowed in public settings.";

function normalizeSettingKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, "");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Detects credential-like keys without returning untrusted names or ancestors. */
function containsForbiddenSettingKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenSettingKey);
  }
  if (!isPlainRecord(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_SETTING_KEYS.includes(normalizeSettingKey(key)) || containsForbiddenSettingKey(child)
  );
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type ShipaSettingsParseErrorCode =
  | "forbidden_credential_field"
  | "invalid_settings"
  | "invalid_request";

export interface ShipaSettingsParseResult<T> {
  ok: boolean;
  /** The parsed draft, present only when `ok` is true. */
  settings?: T;
  /** Stable machine-readable failure code, present only when `ok` is false. */
  code?: ShipaSettingsParseErrorCode;
  /** Safe validation messages; no rejected values, field names or raw Zod text. */
  messages?: string[];
}

/** The result of parsing a browser save request. */
export interface ShipaSaveRequestParseResult {
  ok: boolean;
  /** The validated request, present only when `ok` is true. */
  request?: ShipaSaveRequest;
  /** Stable machine-readable failure code, present only when `ok` is false. */
  code?: ShipaSettingsParseErrorCode;
  /** Safe validation messages; no rejected values, field names or raw Zod text. */
  messages?: string[];
}

/**
 * Parses a full settings draft. Unknown fields are rejected outright rather
 * than preserved, and credential-like fields are reported with their own
 * stable code so a caller can log "a secret was sent" instead of "invalid".
 */
export function parseShipaSettings(raw: unknown): ShipaSettingsParseResult<ShipaSettings> {
  return parseSettingsDraft(shipaSettingsSchema, raw, "invalid_settings");
}

/**
 * Parses one environment's safe settings with the same rules. The strict
 * schema means an unexpected key is rejected instead of being carried along
 * into a save payload.
 */
export function parseShipaPublicSettings(raw: unknown): ShipaSettingsParseResult<ShipaPublicSettings> {
  return parseSettingsDraft(shipaPublicSettingsSchema, raw, "invalid_settings");
}

/**
 * Parses a browser save request.
 *
 * The request must be exactly `{expectedRevision, settings}`: the expected
 * revision is a separate non-negative integer and the settings carry the five
 * safe fields only. An unknown key — a credential, a provider, an endpoint, an
 * actor, a proof — is refused rather than mapped away, and the per-environment
 * blocks exclude the server-derived credential metadata, so a browser can
 * never claim that a key exists.
 */
export function parseShipaSaveRequest(raw: unknown): ShipaSaveRequestParseResult {
  if (containsForbiddenSettingKey(raw)) {
    return {
      ok: false,
      code: "forbidden_credential_field",
      messages: [FORBIDDEN_FIELD_MESSAGE],
    };
  }
  const result = shipaSaveRequestSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      code: "invalid_request",
      messages: ["Invalid Shipa settings request."],
    };
  }
  return { ok: true, request: result.data };
}

function parseSettingsDraft<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  code: ShipaSettingsParseErrorCode,
): ShipaSettingsParseResult<T> {
  if (containsForbiddenSettingKey(raw)) {
    return {
      ok: false,
      code: "forbidden_credential_field",
      messages: [FORBIDDEN_FIELD_MESSAGE],
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      code,
      messages: ["Invalid Shipa settings."],
    };
  }
  return { ok: true, settings: result.data };
}

// ---------------------------------------------------------------------------
// Activation readiness
// ---------------------------------------------------------------------------

export type ShipaActivationIssueCode =
  | "invalid_settings"
  | "provider_reference_unavailable"
  | "provider_adapter_not_ready"
  | "credential_missing"
  | "origin_contact_missing"
  | "origin_phone_missing"
  | "origin_address_incomplete"
  | "parcel_weight_missing"
  | "scheduler_heartbeat_missing"
  | "scheduler_heartbeat_invalid"
  | "scheduler_heartbeat_in_future"
  | "scheduler_heartbeat_stale";

export interface ShipaActivationIssue {
  code: ShipaActivationIssueCode;
  message: string;
}

export interface ShipaActivationReadinessInput {
  /** The draft being evaluated. Its active environment selects the configuration to check. */
  settings: ShipaSettings;
  /**
   * Whether the captured Shipa V2 reference is available to the build that
   * would perform a real booking. The reference itself has been captured;
   * what this flag reports is whether a build that maps it to a request is
   * present. It never reports a merchant entitlement.
   */
  vendorReferenceAvailable: boolean;
  /** Whether a real provider adapter exists for this release. */
  providerAdapterReady: boolean;
  /**
   * Whether a credential is stored for the *active* environment. This is an
   * explicit server-provided flag, not a value derived from the draft.
   */
  activeEnvironmentCredentialPresent: boolean;
  /** Last successful scheduler heartbeat as an ISO timestamp, or null. */
  schedulerHeartbeatAt: string | null;
  /** Injected current time, so the check is deterministic and testable. */
  now: Date | number;
}

export interface ShipaActivationReadiness {
  /** True only when there are no issues at all. */
  ready: boolean;
  issues: ShipaActivationIssue[];
}

/**
 * Decides whether the configuration could be activated for real use.
 *
 * This is a readiness assessment of Curemed's own draft and of explicitly
 * supplied facts. It makes no connectivity claim: a ready result says the
 * local configuration is complete and the stated preconditions hold, never
 * that Shipa is reachable, authenticated or healthy.
 *
 * The pickup instructions and the service code never grant authority here.
 * They are configuration text and vocabulary; only the explicit preconditions
 * below and the saved configuration decide readiness.
 */
export function evaluateShipaActivationReadiness(
  input: ShipaActivationReadinessInput,
): ShipaActivationReadiness {
  // Typed draft edits can still contain negative/NaN numbers. Reuse the parser
  // before accessing nested fields or interpreting completeness as readiness.
  if (!parseShipaSettings(input.settings).ok) {
    return {
      ready: false,
      issues: [{ code: "invalid_settings", message: "Invalid Shipa settings." }],
    };
  }
  const issues: ShipaActivationIssue[] = [];
  const environment = input.settings.environment;
  const active = shipaPublicSettingsForEnvironment(input.settings, environment);

  if (!input.vendorReferenceAvailable) {
    issues.push({
      code: "provider_reference_unavailable",
      message:
        "The Shipa provider mapping is not available in this build, so no real booking can be attempted.",
    });
  }
  if (!input.providerAdapterReady) {
    issues.push({
      code: "provider_adapter_not_ready",
      message: "No verified provider adapter is available yet, so real activation is blocked.",
    });
  }
  if (!input.activeEnvironmentCredentialPresent) {
    issues.push({
      code: "credential_missing",
      message: `No credential is configured for the ${environment} environment.`,
    });
  }

  if (!active.origin.contactName.trim()) {
    issues.push({ code: "origin_contact_missing", message: "Origin contact name is required." });
  }
  if (!active.origin.contactPhone.trim()) {
    issues.push({ code: "origin_phone_missing", message: "Origin contact phone is required." });
  }
  const missingAddress = missingShipaOriginAddressFields(active.origin.address);
  if (missingAddress.length > 0) {
    issues.push({
      code: "origin_address_incomplete",
      message: `Origin address is missing: ${missingAddress.join(", ")}.`,
    });
  }
  if (active.parcel.weightKg === null) {
    issues.push({
      code: "parcel_weight_missing",
      message: "Parcel weight is required and must be entered in kilograms.",
    });
  }

  // The scheduler is only required for automatic dispatch. Manual booking runs
  // inline and must not depend on a background worker.
  if (input.settings.dispatchMode === "automatic_after_payment") {
    const nowMs = input.now instanceof Date ? input.now.getTime() : input.now;
    const heartbeatRaw = input.schedulerHeartbeatAt;
    if (heartbeatRaw === null || heartbeatRaw.trim() === "") {
      issues.push({
        code: "scheduler_heartbeat_missing",
        message: "Automatic dispatch needs a scheduler heartbeat; none has been recorded.",
      });
    } else if (!Number.isFinite(nowMs)) {
      issues.push({
        code: "scheduler_heartbeat_invalid",
        message: "The reference time is unusable, so the scheduler heartbeat cannot be evaluated.",
      });
    } else {
      const heartbeatMs = Date.parse(heartbeatRaw);
      if (Number.isNaN(heartbeatMs)) {
        issues.push({
          code: "scheduler_heartbeat_invalid",
          message: "The scheduler heartbeat is not a readable timestamp.",
        });
      } else if (heartbeatMs > nowMs) {
        issues.push({
          code: "scheduler_heartbeat_in_future",
          message: "The scheduler heartbeat is in the future, so it cannot be trusted.",
        });
      } else if (nowMs - heartbeatMs > SCHEDULER_HEARTBEAT_MAX_AGE_MS) {
        issues.push({
          code: "scheduler_heartbeat_stale",
          message: "The scheduler heartbeat is older than three minutes.",
        });
      }
    }
  }

  return { ready: issues.length === 0, issues };
}
