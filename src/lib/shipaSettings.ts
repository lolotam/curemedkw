// Shipa delivery settings — internal contracts, validation and activation
// readiness.
//
// What this module is
// -------------------
// A typed description of Curemed's *own* Shipa configuration draft (origin,
// one-parcel defaults, service code, credential presence metadata) plus the
// pure helpers an administrator UI will need later: switch environment, switch
// dispatch mode, patch one environment's draft, and decide whether the
// configuration is complete enough to be activated.
//
// What this module deliberately is not
// ------------------------------------
// * The account's Shipa Delivery API V2 reference has not been captured yet.
//   There is therefore no endpoint, auth header, request payload, service
//   enum, address code or unit conversion anywhere in this file. Nothing here
//   can be translated into a Shipa request, and the vendor mapping is
//   explicitly unavailable.
// * A storage layer. Nothing is persisted, read back or saved anywhere. These
//   are local contracts; a caller must never tell an administrator that a
//   save happened because it used them.
// * A credential store. Only *safe* metadata is modelled: whether a key exists
//   for an environment, when it was rotated and which key version it belongs
//   to. A key value, token, ciphertext or arbitrary endpoint is never part of
//   these types and is rejected on the way in.
//
// The module is pure — no React, Supabase, Deno, storage or network use — so
// it can be unit-tested directly and reused by the settings UI, the order
// delivery panel and later server code.

import { z } from "zod";

/** The two dispatch modes Curemed supports. */
export const DISPATCH_MODES = ["manual_after_packing", "automatic_after_payment"] as const;
export type DispatchMode = (typeof DISPATCH_MODES)[number];

/** The two Shipa environments Curemed keeps separate. */
export const SHIPA_ENVIRONMENTS = ["sandbox", "live"] as const;
export type ShipaEnvironment = (typeof SHIPA_ENVIRONMENTS)[number];

/**
 * Kuwait is fixed for the first release: Curemed ships domestically only, and
 * the country is not an editable field.
 */
export const KUWAIT_COUNTRY_CODE = "KW";

/** A scheduler heartbeat older than this is stale for automatic dispatch. */
export const SCHEDULER_HEARTBEAT_MAX_AGE_MS = 3 * 60 * 1000;

export const dispatchModeSchema = z.enum(DISPATCH_MODES);
export const shipaEnvironmentSchema = z.enum(SHIPA_ENVIRONMENTS);

/**
 * The pickup address Curemed hands to the carrier. Field names follow the
 * existing order address snapshot in `src/lib/db.ts` (governorate, area,
 * block, street, building, addressLine) so a future UI can reuse the same
 * labels without translation.
 */
export const shipaOriginAddressSchema = z
  .object({
    countryCode: z.literal(KUWAIT_COUNTRY_CODE),
    governorate: z.string(),
    area: z.string(),
    block: z.string(),
    street: z.string(),
    building: z.string(),
    addressLine: z.string(),
  })
  .strict();

export const shipaOriginSchema = z
  .object({
    contactName: z.string(),
    contactPhone: z.string(),
    address: shipaOriginAddressSchema,
  })
  .strict();

/**
 * Parcel dimensions in centimetres. All three must be supplied together and
 * all three must be positive finite numbers.
 */
export const shipaParcelDimensionsSchema = z
  .object({
    lengthCm: z.number().finite().positive(),
    widthCm: z.number().finite().positive(),
    heightCm: z.number().finite().positive(),
  })
  .strict();

/**
 * The parcel draft. One parcel per order is fixed by the first release, so
 * the count is the literal 1 rather than a configurable number. Weight is in
 * kilograms; an unset weight is `null` and is never replaced by an invented
 * non-zero default or derived from product quantities.
 */
export const shipaParcelDraftSchema = z
  .object({
    count: z.literal(1),
    weightKg: z.number().finite().positive().nullable(),
    dimensionsCm: shipaParcelDimensionsSchema.nullable(),
  })
  .strict();

/**
 * Safe credential metadata only. `present` says whether the server holds a
 * key for this environment; the key value itself is never modelled here.
 */
export const shipaCredentialMetadataSchema = z
  .object({
    present: z.boolean(),
    rotatedAt: z.string().nullable(),
    keyVersion: z.number().int().nonnegative().nullable(),
  })
  .strict();

/**
 * The safe, non-secret settings for one environment. `serviceCode` is a free
 * string on purpose: the confirmed vendor contract defines the valid service
 * codes, and inventing an enum before that evidence exists would be a guess.
 */
export const shipaPublicSettingsSchema = z
  .object({
    appId: z.string().nullable(),
    origin: shipaOriginSchema,
    serviceCode: z.string().nullable(),
    parcel: shipaParcelDraftSchema,
    credential: shipaCredentialMetadataSchema,
  })
  .strict();

/**
 * The full internal settings draft. Sandbox and live keep separate
 * non-secret configuration; switching environment or dispatch mode never
 * copies, merges or resets the other environment's values.
 */
export const shipaSettingsSchema = z
  .object({
    enabled: z.boolean(),
    environment: shipaEnvironmentSchema,
    dispatchMode: dispatchModeSchema,
    revision: z.number().int().nonnegative(),
    sandbox: shipaPublicSettingsSchema,
    live: shipaPublicSettingsSchema,
  })
  .strict();

export type ShipaOriginAddress = z.infer<typeof shipaOriginAddressSchema>;
export type ShipaOrigin = z.infer<typeof shipaOriginSchema>;
export type ShipaParcelDimensions = z.infer<typeof shipaParcelDimensionsSchema>;
export type ShipaParcelDraft = z.infer<typeof shipaParcelDraftSchema>;
export type ShipaCredentialMetadata = z.infer<typeof shipaCredentialMetadataSchema>;
export type ShipaPublicSettings = z.infer<typeof shipaPublicSettingsSchema>;
export type ShipaSettings = z.infer<typeof shipaSettingsSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function createDefaultShipaOriginAddress(): ShipaOriginAddress {
  return {
    countryCode: KUWAIT_COUNTRY_CODE,
    governorate: "",
    area: "",
    block: "",
    street: "",
    building: "",
    addressLine: "",
  };
}

export function createDefaultShipaOrigin(): ShipaOrigin {
  return {
    contactName: "",
    contactPhone: "",
    address: createDefaultShipaOriginAddress(),
  };
}

export function createDefaultShipaParcelDraft(): ShipaParcelDraft {
  return {
    count: 1,
    weightKg: null,
    dimensionsCm: null,
  };
}

export function createDefaultShipaCredentialMetadata(): ShipaCredentialMetadata {
  return {
    present: false,
    rotatedAt: null,
    keyVersion: null,
  };
}

export function createDefaultShipaPublicSettings(): ShipaPublicSettings {
  return {
    appId: null,
    origin: createDefaultShipaOrigin(),
    serviceCode: null,
    parcel: createDefaultShipaParcelDraft(),
    credential: createDefaultShipaCredentialMetadata(),
  };
}

/**
 * Safe defaults: disabled, sandbox, manual, revision 0. A missing settings
 * row must therefore behave exactly like this draft.
 */
export function createDefaultShipaSettings(): ShipaSettings {
  return {
    enabled: false,
    environment: "sandbox",
    dispatchMode: "manual_after_packing",
    revision: 0,
    sandbox: createDefaultShipaPublicSettings(),
    live: createDefaultShipaPublicSettings(),
  };
}

/** Convenience default drafts. Treat them as read-only. */
export const DEFAULT_SHIPA_SETTINGS: ShipaSettings = createDefaultShipaSettings();
export const DEFAULT_SHIPA_PUBLIC_SETTINGS: ShipaPublicSettings = createDefaultShipaPublicSettings();

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
    FORBIDDEN_SETTING_KEYS.includes(normalizeSettingKey(key)) || containsForbiddenSettingKey(child),
  );
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type ShipaSettingsParseErrorCode = "forbidden_credential_field" | "invalid_settings";

export interface ShipaSettingsParseResult<T> {
  ok: boolean;
  /** The parsed draft, present only when `ok` is true. */
  settings?: T;
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
  return parseSettingsDraft(shipaSettingsSchema, raw);
}

/**
 * Parses one environment's safe settings with the same rules. The strict
 * schema means an unexpected key is rejected instead of being carried along
 * into a save payload.
 */
export function parseShipaPublicSettings(raw: unknown): ShipaSettingsParseResult<ShipaPublicSettings> {
  return parseSettingsDraft(shipaPublicSettingsSchema, raw);
}

function parseSettingsDraft<T>(schema: z.ZodType<T>, raw: unknown): ShipaSettingsParseResult<T> {
  if (containsForbiddenSettingKey(raw)) {
    return {
      ok: false,
      code: "forbidden_credential_field",
      messages: ["Credential or endpoint fields are not allowed in public settings."],
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      code: "invalid_settings",
      messages: ["Invalid Shipa settings."],
    };
  }
  return { ok: true, settings: result.data };
}

// ---------------------------------------------------------------------------
// Draft transitions
// ---------------------------------------------------------------------------

/** The safe settings of one environment, defaulting to the active one. */
export function shipaPublicSettingsForEnvironment(
  settings: ShipaSettings,
  environment: ShipaEnvironment = settings.environment,
): ShipaPublicSettings {
  return environment === "sandbox" ? settings.sandbox : settings.live;
}

/**
 * Switches the active environment. Both environments' drafts are kept exactly
 * as they are — no copying, no merging, no reset — and the revision is left
 * alone because bumping it belongs to the real save path.
 */
export function withShipaEnvironment(
  settings: ShipaSettings,
  environment: ShipaEnvironment,
): ShipaSettings {
  return { ...settings, environment };
}

/**
 * Switches the dispatch mode. Changing the mode must never reset the other
 * settings, so every environment draft is carried over untouched.
 */
export function withShipaDispatchMode(
  settings: ShipaSettings,
  dispatchMode: DispatchMode,
): ShipaSettings {
  return { ...settings, dispatchMode };
}

export interface ShipaOriginAddressPatch {
  countryCode?: typeof KUWAIT_COUNTRY_CODE;
  governorate?: string;
  area?: string;
  block?: string;
  street?: string;
  building?: string;
  addressLine?: string;
}

export interface ShipaOriginPatch {
  contactName?: string;
  contactPhone?: string;
  address?: ShipaOriginAddressPatch;
}

export interface ShipaParcelPatch {
  count?: 1;
  weightKg?: number | null;
  dimensionsCm?: ShipaParcelDimensions | null;
}

export interface ShipaPublicSettingsPatch {
  appId?: string | null;
  origin?: ShipaOriginPatch;
  serviceCode?: string | null;
  parcel?: ShipaParcelPatch;
  credential?: Partial<ShipaCredentialMetadata>;
}

/**
 * Merges a patch into one environment's draft. Nested objects are merged
 * field by field so an edit to the contact does not clear the address, and an
 * edit to one environment cannot clear the other. `undefined` means "not
 * supplied" and keeps the stored value; an explicit `null` clears a
 * nullable field.
 */
function pick<T>(patched: T | undefined, base: T): T {
  return patched !== undefined ? patched : base;
}

export function applyShipaPublicSettingsPatch(
  base: ShipaPublicSettings,
  patch: ShipaPublicSettingsPatch,
): ShipaPublicSettings {
  const origin: ShipaOrigin = {
    contactName: pick(patch.origin?.contactName, base.origin.contactName),
    contactPhone: pick(patch.origin?.contactPhone, base.origin.contactPhone),
    address: {
      countryCode: pick(patch.origin?.address?.countryCode, base.origin.address.countryCode),
      governorate: pick(patch.origin?.address?.governorate, base.origin.address.governorate),
      area: pick(patch.origin?.address?.area, base.origin.address.area),
      block: pick(patch.origin?.address?.block, base.origin.address.block),
      street: pick(patch.origin?.address?.street, base.origin.address.street),
      building: pick(patch.origin?.address?.building, base.origin.address.building),
      addressLine: pick(patch.origin?.address?.addressLine, base.origin.address.addressLine),
    },
  };

  const parcel: ShipaParcelDraft = {
    count: pick(patch.parcel?.count, base.parcel.count),
    weightKg: pick(patch.parcel?.weightKg, base.parcel.weightKg),
    dimensionsCm: pick(patch.parcel?.dimensionsCm, base.parcel.dimensionsCm),
  };

  const credential: ShipaCredentialMetadata = {
    present: pick(patch.credential?.present, base.credential.present),
    rotatedAt: pick(patch.credential?.rotatedAt, base.credential.rotatedAt),
    keyVersion: pick(patch.credential?.keyVersion, base.credential.keyVersion),
  };

  return {
    appId: pick(patch.appId, base.appId),
    origin,
    serviceCode: pick(patch.serviceCode, base.serviceCode),
    parcel,
    credential,
  };
}

/**
 * Applies a patch to one environment's draft and leaves the other
 * environment completely untouched.
 */
export function withShipaEnvironmentSettings(
  settings: ShipaSettings,
  environment: ShipaEnvironment,
  patch: ShipaPublicSettingsPatch,
): ShipaSettings {
  const current = shipaPublicSettingsForEnvironment(settings, environment);
  const next = applyShipaPublicSettingsPatch(current, patch);
  return environment === "sandbox"
    ? { ...settings, sandbox: next }
    : { ...settings, live: next };
}

// ---------------------------------------------------------------------------
// Activation readiness
// ---------------------------------------------------------------------------

/** Origin address fields that must be present before the integration can be activated. */
export const REQUIRED_SHIPA_ORIGIN_ADDRESS_FIELDS = [
  "governorate",
  "area",
  "block",
  "street",
  "building",
] as const;

/** Names of the required origin address fields that are still empty. */
export function missingShipaOriginAddressFields(address: ShipaOriginAddress): string[] {
  return REQUIRED_SHIPA_ORIGIN_ADDRESS_FIELDS.filter((field) => !address[field].trim());
}

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
  /** Whether the account's Shipa V2 reference has been captured. */
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
        "The Shipa V2 account reference has not been captured, so no real booking can be attempted.",
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
