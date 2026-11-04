// Shipa delivery settings — the shared, browser-safe configuration contract.
//
// What this module is
// -------------------
// A typed description of Curemed's own Shipa configuration draft (origin,
// one-parcel defaults, service code, pickup instructions, auto-confirmation
// and credential presence metadata) plus the pure helpers an administrator UI
// needs: switch environment, switch dispatch mode, patch one environment's
// draft and decide whether the configuration is complete enough to be
// activated.
//
// Browser and Edge code share these schemas; SQL validates persisted writes separately.
//
// What this module deliberately is not
// ------------------------------------
// * A provider wire mapping. The Shipa Delivery V2 reference has now been
//   captured, and the mapping from Curemed's configuration to a Shipa
//   request lives in `shipa-contract.ts`. This module describes Curemed's
//   *configuration* only: the service codes below validate a vocabulary, not
//   a merchant entitlement. A captured category is not proof that the
//   account may use it.
// * A storage layer. Nothing here is persisted, read back or saved. The Edge
//   store that does that lives in `shipa-settings-store.ts` and the SQL
//   wrappers it calls are the only writers.
// * A credential store. Only *safe* metadata is modelled: whether a key
//   exists for an environment, when it was rotated and which key version it
//   belongs to. A key value, token, ciphertext or arbitrary endpoint is never
//   part of these types and is rejected on the way in.
//
// The module is pure — no React, no Supabase, no Deno, no storage, no network
// use — so it can be unit-tested directly and reused by the settings UI, the
// order delivery panel and later server code.

import { z } from "npm:zod@3.25.76";

export const DISPATCH_MODES = ["manual_after_packing", "automatic_after_payment"] as const;
export type DispatchMode = (typeof DISPATCH_MODES)[number];

export const SHIPA_ENVIRONMENTS = ["sandbox", "live"] as const;
export type ShipaEnvironment = (typeof SHIPA_ENVIRONMENTS)[number];

/**
 * The captured domestic Shipa service vocabulary.
 *
 * `Cross Border` is deliberately absent: this release is Kuwait domestic
 * only, so a cross-border code is refused rather than quietly accepted.
 *
 * This list validates *vocabulary*. It is never a merchant entitlement: the
 * captured account reference lists these categories, but a captured category
 * does not prove that the account may book it, and nothing here may be used
 * to claim that a service is available to Curemed.
 */
export const SHIPA_SERVICE_CODES = ["On Demand", "Same Day", "Next Day"] as const;
export type ShipaServiceCode = (typeof SHIPA_SERVICE_CODES)[number];

/**
 * Kuwait is fixed for the first release: Curemed ships domestically only, and
 * the country is not an editable field.
 */
export const KUWAIT_COUNTRY_CODE = "KW";

/** The longest pickup instruction text a draft may carry. */
export const SHIPA_MAX_PICKUP_INSTRUCTIONS_LENGTH = 1000;

/**
 * The highest expected revision a save may carry. The returned stored
 * revision may be one greater, up to the database integer maximum. The expected revision is checked
 * before a save so a stale writer is refused instead of overwriting a newer
 * configuration.
 */
export const SHIPA_MAX_REVISION = 2147483646;

/** A scheduler heartbeat older than this is stale for automatic dispatch. */
export const SCHEDULER_HEARTBEAT_MAX_AGE_MS = 3 * 60 * 1000;

export const dispatchModeSchema = z.enum(DISPATCH_MODES);
export const shipaEnvironmentSchema = z.enum(SHIPA_ENVIRONMENTS);
export const shipaServiceCodeSchema = z.enum(SHIPA_SERVICE_CODES);

/**
 * The pickup address Curemed hands to the carrier. Field names follow the
 * existing order address snapshot in `src/lib/db.ts` (governorate, area,
 * block, street, building, addressLine) so a future UI can reuse the same
 * labels without translation.
 *
 * `area` is a Shipa city directory name, not a free-text neighbourhood.
 * Curemed's validated directory city is `Hawally`, but the generic defaults
 * stay empty: the pickup address, contact and phone are manager runtime
 * inputs, not a hardcoded merchant address.
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
 * The safe, non-secret settings for one environment.
 *
 * `serviceCode` is null or one of the captured domestic codes. `autoConfirm`
 * is a boolean and defaults to false, which preserves the provider's
 * documented receiver-confirmation SMS behaviour. `pickupInstructions` is
 * free text for the carrier's pickup team, capped at 1000 characters; it is
 * a manager runtime input and never implies a mode change, a backfill or any
 * activation authority.
 */
export const shipaPublicSettingsSchema = z
  .object({
    appId: z.string().nullable(),
    origin: shipaOriginSchema,
    serviceCode: shipaServiceCodeSchema.nullable(),
    autoConfirm: z.boolean(),
    pickupInstructions: z.string().max(SHIPA_MAX_PICKUP_INSTRUCTIONS_LENGTH),
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

/**
 * One environment's configuration *without* the server-derived credential
 * metadata. This is what a browser save may carry: the credential block is
 * read-only metadata owned by the server, so it can neither be sent nor be
 * changed from a save payload.
 */
export const shipaSaveablePublicSettingsSchema = z
  .object({
    appId: z.string().nullable(),
    origin: shipaOriginSchema,
    serviceCode: shipaServiceCodeSchema.nullable(),
    autoConfirm: z.boolean(),
    pickupInstructions: z.string().max(SHIPA_MAX_PICKUP_INSTRUCTIONS_LENGTH),
    parcel: shipaParcelDraftSchema,
  })
  .strict();

/**
 * The settings a browser save may carry: exactly five keys. The revision is
 * not part of it — the expected revision travels separately, so an atomic
 * save advances the revision exactly once.
 */
export const shipaSaveableSettingsSchema = z
  .object({
    enabled: z.boolean(),
    environment: shipaEnvironmentSchema,
    dispatchMode: dispatchModeSchema,
    sandbox: shipaSaveablePublicSettingsSchema,
    live: shipaSaveablePublicSettingsSchema,
  })
  .strict();

/**
 * The exact browser save request: an expected revision and the settings
 * patch. Any other top-level key — an actor, a provider, an endpoint, a
 * proof — is unknown and refused rather than mapped away.
 */
export const shipaSaveRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative().max(SHIPA_MAX_REVISION),
    settings: shipaSaveableSettingsSchema,
  })
  .strict();

export type ShipaOriginAddress = z.infer<typeof shipaOriginAddressSchema>;
export type ShipaOrigin = z.infer<typeof shipaOriginSchema>;
export type ShipaParcelDimensions = z.infer<typeof shipaParcelDimensionsSchema>;
export type ShipaParcelDraft = z.infer<typeof shipaParcelDraftSchema>;
export type ShipaCredentialMetadata = z.infer<typeof shipaCredentialMetadataSchema>;
export type ShipaPublicSettings = z.infer<typeof shipaPublicSettingsSchema>;
export type ShipaSettings = z.infer<typeof shipaSettingsSchema>;
export type ShipaSaveablePublicSettings = z.infer<typeof shipaSaveablePublicSettingsSchema>;
export type ShipaSaveableSettings = z.infer<typeof shipaSaveableSettingsSchema>;
export type ShipaSaveRequest = z.infer<typeof shipaSaveRequestSchema>;

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

/**
 * Safe defaults: an empty draft, no service, no auto-confirmation and no
 * pickup text. Nothing about the pickup address, contact, phone or service
 * is hardcoded here — those are manager runtime inputs.
 */
export function createDefaultShipaPublicSettings(): ShipaPublicSettings {
  return {
    appId: null,
    origin: createDefaultShipaOrigin(),
    serviceCode: null,
    autoConfirm: false,
    pickupInstructions: "",
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
  serviceCode?: ShipaServiceCode | null;
  autoConfirm?: boolean;
  pickupInstructions?: string;
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
    autoConfirm: pick(patch.autoConfirm, base.autoConfirm),
    pickupInstructions: pick(patch.pickupInstructions, base.pickupInstructions),
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
// Address completeness
// ---------------------------------------------------------------------------

/**
 * The address fields that are always required, whatever else is supplied.
 *
 * `block` is not required: the captured contract does not require it, and an
 * invented requirement would refuse configurations the carrier accepts.
 */
export const REQUIRED_SHIPA_ORIGIN_ADDRESS_FIELDS = ["governorate", "area"] as const;

/**
 * The structured fields that identify a pickup point when no freeform
 * address line is supplied.
 */
export const REQUIRED_SHIPA_STRUCTURED_ADDRESS_FIELDS = ["street", "building"] as const;

/**
 * Names of the required origin address fields that are still missing.
 *
 * A complete freeform address line is acceptable on its own: with the
 * contact, phone, governorate and area present, the carrier can locate the
 * pickup point without a block/street/building breakdown. Without such an
 * address line, the structured street and building must be supplied. Nothing
 * else is invented: no block requirement, no PACI code and no coordinates.
 */
export function missingShipaOriginAddressFields(address: ShipaOriginAddress): string[] {
  const missing: string[] = [];
  for (const field of REQUIRED_SHIPA_ORIGIN_ADDRESS_FIELDS) {
    if (!address[field].trim()) missing.push(field);
  }
  if (!address.addressLine.trim()) {
    for (const field of REQUIRED_SHIPA_STRUCTURED_ADDRESS_FIELDS) {
      if (!address[field].trim()) missing.push(field);
    }
  }
  return missing;
}

/**
 * True when the address carries enough information to identify a pickup
 * point. The contact name and phone are checked separately.
 */
export function isShipaOriginAddressComplete(address: ShipaOriginAddress): boolean {
  return missingShipaOriginAddressFields(address).length === 0;
}
