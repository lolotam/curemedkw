// Editable Shipa parcel text and safe save projection; no SDK or I/O.
import type {
  DispatchMode,
  ShipaEnvironment,
  ShipaParcelDraft,
  ShipaPublicSettings,
  ShipaSaveablePublicSettings,
  ShipaSaveableSettings,
  ShipaSettings,
} from "@/lib/shipaSettings";

// --- the draft model ---

/** The raw text of the three parcel dimensions. */
export interface ShipaDimensionsText {
  readonly lengthCm: string;
  readonly widthCm: string;
  readonly heightCm: string;
}

/** One environment's draft: the parsed values plus the raw numeric text. */
export interface ShipaEnvironmentDraft {
  readonly settings: ShipaPublicSettings;
  readonly weightText: string;
  readonly lengthText: string;
  readonly widthText: string;
  readonly heightText: string;
}

/** The whole editable draft. */
export interface ShipaDraft {
  readonly enabled: boolean;
  readonly environment: ShipaEnvironment;
  readonly dispatchMode: DispatchMode;
  readonly sandbox: ShipaEnvironmentDraft;
  readonly live: ShipaEnvironmentDraft;
}

/** Builds the draft of a saved configuration. */
export function draftFromShipaSettings(settings: ShipaSettings): ShipaDraft {
  return {
    enabled: settings.enabled,
    environment: settings.environment,
    dispatchMode: settings.dispatchMode,
    sandbox: environmentDraftFrom(settings.sandbox),
    live: environmentDraftFrom(settings.live),
  };
}

function environmentDraftFrom(settings: ShipaPublicSettings): ShipaEnvironmentDraft {
  const dimensions = settings.parcel.dimensionsCm;
  return {
    settings,
    weightText: settings.parcel.weightKg === null ? "" : String(settings.parcel.weightKg),
    lengthText: dimensions === null ? "" : String(dimensions.lengthCm),
    widthText: dimensions === null ? "" : String(dimensions.widthCm),
    heightText: dimensions === null ? "" : String(dimensions.heightCm),
  };
}

/** The result of building a write payload. */
export type BuildResult =
  | { readonly ok: true; readonly settings: ShipaSaveableSettings }
  | { readonly ok: false; readonly errors: string[] };

/**
 * Builds the write payload of a draft.
 *
 * Only the five saveable fields are produced. The nested credential metadata
 * is server-owned and read-only, so it is never carried into a payload.
 */
export function buildShipaSaveableSettings(draft: ShipaDraft): BuildResult {
  const sandbox = buildSaveableEnvironment(draft.sandbox);
  const live = buildSaveableEnvironment(draft.live);
  if (!sandbox.ok || !live.ok) {
    return {
      ok: false,
      errors: [
        ...(sandbox.ok === true ? [] : sandbox.errors),
        ...(live.ok === true ? [] : live.errors),
      ],
    };
  }
  return {
    ok: true,
    settings: {
      enabled: draft.enabled,
      environment: draft.environment,
      dispatchMode: draft.dispatchMode,
      sandbox: sandbox.value,
      live: live.value,
    },
  };
}

function buildSaveableEnvironment(
  draft: ShipaEnvironmentDraft,
): { ok: true; value: ShipaSaveablePublicSettings } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const weightKg = readPositiveNumber(draft.weightText, "Parcel weight", errors);
  const dimensionsCm = readDimensions(draft, errors);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: saveablePublic(draft.settings, { count: 1, weightKg, dimensionsCm }),
  };
}

function saveablePublic(
  value: ShipaPublicSettings,
  parcel: ShipaParcelDraft,
): ShipaSaveablePublicSettings {
  return {
    appId: value.appId,
    origin: {
      contactName: value.origin.contactName,
      contactPhone: value.origin.contactPhone,
      address: { ...value.origin.address },
    },
    serviceCode: value.serviceCode,
    autoConfirm: value.autoConfirm,
    pickupInstructions: value.pickupInstructions,
    parcel,
  };
}

function readPositiveNumber(text: string, label: string, errors: string[]): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    errors.push(`${label} must be a positive number.`);
    return null;
  }
  return value;
}

function readDimensions(
  draft: ShipaEnvironmentDraft,
  errors: string[],
): ShipaParcelDraft["dimensionsCm"] {
  const length = draft.lengthText.trim();
  const width = draft.widthText.trim();
  const height = draft.heightText.trim();
  if (length === "" && width === "" && height === "") return null;
  if (length === "" || width === "" || height === "") {
    errors.push("Enter all three parcel dimensions in centimetres, or leave all three empty.");
    return null;
  }
  const lengthCm = readPositiveNumber(length, "Parcel length", errors);
  const widthCm = readPositiveNumber(width, "Parcel width", errors);
  const heightCm = readPositiveNumber(height, "Parcel height", errors);
  if (lengthCm === null || widthCm === null || heightCm === null) return null;
  return { lengthCm, widthCm, heightCm };
}
