// Nonsecret pickup defaults and pure readiness projections used by the editor.
import {
  KUWAIT_COUNTRY_CODE,
  missingShipaOriginAddressFields,
  SCHEDULER_HEARTBEAT_MAX_AGE_MS,
  type ShipaEnvironment,
  type ShipaPublicSettingsPatch,
  type ShipaSaveablePublicSettings,
} from "@/lib/shipaSettings";
import type { ShipaReadinessDto } from "@/lib/shipaAdminResponses";
import {
  type BuildResult,
  buildShipaSaveableSettings,
  draftFromShipaSettings,
  type ShipaDraft,
} from "@/lib/shipaAdminDraft";
import type { ShipaSettings } from "@/lib/shipaSettings";

export interface ShipaActivationContext {
  draft: ShipaDraft | null;
  saved: ShipaSettings | null;
  built: BuildResult | null;
  readiness: ShipaReadinessDto | null;
  newKeyPending: boolean;
  nowMs: number;
}

/** Established automation keeps its saved state; new activation uses saved proofs only. */
export function shipaAutomaticActivationIssues(context: ShipaActivationContext): string[] {
  const { draft, saved, built, readiness, newKeyPending, nowMs } = context;
  if (draft === null || saved === null || built === null || built.ok === false) return [];
  if (!draft.enabled || draft.dispatchMode !== "automatic_after_payment") return [];
  if (
    saved.enabled && saved.dispatchMode === "automatic_after_payment" &&
    saved.environment === draft.environment
  ) return [];
  const issues: string[] = [];
  const active = built.settings[draft.environment];
  const missing = missingShipaConfigurationFields(active);
  if (missing.length > 0) {
    issues.push(`Complete the ${draft.environment} configuration: ${missing.join(", ")}.`);
  }
  const stored = buildShipaSaveableSettings(draftFromShipaSettings(saved));
  if (
    stored.ok === false ||
    JSON.stringify(stored.settings[draft.environment]) !== JSON.stringify(active)
  ) {
    issues.push(
      "Save the environment configuration with delivery disabled before enabling automatic dispatch.",
    );
  }
  if (newKeyPending) {
    issues.push(
      "Save the API key with delivery disabled, then verify it before enabling automatic dispatch.",
    );
  }
  if (!saved[draft.environment].credential.present) {
    issues.push(`No API key is stored for the ${draft.environment} environment.`);
  }
  if (readiness === null) {
    return [...issues, "Readiness has not been read, so automatic dispatch cannot be enabled yet."];
  }
  if (
    readiness.settingsRevision !== saved.revision ||
    readiness.activeEnvironment !== saved.environment
  ) {
    issues.push(
      "The readiness facts belong to a different revision or environment. Reload before enabling automatic dispatch.",
    );
  }
  if (!isShipaSchedulerCurrent(readiness, nowMs)) {
    issues.push(
      "The scheduler heartbeat is missing, stale or in the future, so automatic dispatch cannot be enabled yet.",
    );
  }
  const facts = readiness.environments[draft.environment];
  if (
    !facts.credentialPresent || !facts.configurationReady || !facts.probeCurrent ||
    !facts.credentialsVerified || !facts.originCityMatched
  ) {
    issues.push(
      `Verify the saved ${draft.environment} credential, configuration and pickup city before enabling automatic dispatch.`,
    );
  }
  return issues;
}

/**
 * The non-secret CureMed pickup details.
 *
 * They are applied only to the selected environment, only when the
 * administrator asks for them, and never to the parcel: a weight, a dimension
 * and a location are never invented.
 */
export const CUREMED_PICKUP_PATCH: ShipaPublicSettingsPatch = {
  origin: {
    contactName: "CureMed company",
    contactPhone: "+96567664810",
    address: {
      countryCode: KUWAIT_COUNTRY_CODE,
      governorate: "Hawally",
      area: "Hawally",
      block: "",
      street: "Tunis St",
      building: "Grand Hyper Hawally 2 complex",
      addressLine:
        "CureMed's Office, 2nd floor, office 2, Grand Hyper Hawally 2 complex, Tunis St, Hawally",
    },
  },
  serviceCode: "Next Day",
  pickupInstructions:
    "Pickup 09:00-16:00 Asia/Kuwait. Call before collection to confirm the order is packed and ready.",
};

/**
 * The configuration that is still missing for an environment.
 *
 * The checks mirror the shared activation contract: a contact, a phone, a
 * locatable address and an explicit parcel weight. Nothing else is invented.
 */
export function missingShipaConfigurationFields(value: ShipaSaveablePublicSettings): string[] {
  const missing: string[] = [];
  if (!value.origin.contactName.trim()) missing.push("contact name");
  if (!value.origin.contactPhone.trim()) missing.push("contact phone");
  const address = missingShipaOriginAddressFields(value.origin.address);
  if (address.length > 0) missing.push(`address (${address.join(", ")})`);
  if (value.parcel.weightKg === null) missing.push("parcel weight");
  if (value.serviceCode === null) missing.push("delivery service");
  return missing;
}

/**
 * True when the scheduler heartbeat is current.
 *
 * A missing, unreadable or future receipt is not a current receipt, and a
 * receipt older than three minutes is stale. The UI never refreshes the
 * timestamp on its own.
 */
export function isShipaSchedulerCurrent(readiness: ShipaReadinessDto, nowMs: number): boolean {
  if (!readiness.scheduler.current) return false;
  const lastOkAt = readiness.scheduler.lastOkAt;
  if (lastOkAt === null) return false;
  const heartbeatMs = Date.parse(lastOkAt);
  if (!Number.isFinite(heartbeatMs)) return false;
  if (heartbeatMs > nowMs) return false;
  return nowMs - heartbeatMs <= SCHEDULER_HEARTBEAT_MAX_AGE_MS;
}

/** The plain words of a probe outcome. A negative probe stays negative. */
export function describeShipaProbeOutcome(
  environment: ShipaEnvironment,
  facts: { credentialsVerified: boolean; probeCurrent: boolean; safeCode: string | null },
): string {
  const label = environment === "live" ? "live" : "sandbox";
  if (facts.credentialsVerified && facts.probeCurrent) {
    return `The last check verified the ${label} credential.`;
  }
  if (!facts.credentialsVerified) {
    return `The last check did not verify the ${label} credential${
      facts.safeCode ? ` (${facts.safeCode})` : ""
    }.`;
  }
  return `The last check is no longer current for ${label}${
    facts.safeCode ? ` (${facts.safeCode})` : ""
  }.`;
}
