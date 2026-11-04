// Shipa admin — synthetic fixtures and the fake SDK boundary.
//
// Credentials, integration IDs, provider responses and the SDK boundary are
// synthetic. Some nonsecret office fields use the owner-approved CureMed
// configuration. Transport, parsers and components run without network access
// or real secrets.
//
// The two environments carry different non-secret values, different credential
// metadata, so a test that confuses sandbox with live
// fails instead of passing by accident.

import {
  KUWAIT_COUNTRY_CODE,
  type ShipaEnvironment,
  type ShipaPublicSettings,
  type ShipaSettings,
} from "@/lib/shipaSettings";
import type {
  ShipaEnvironmentReadinessDto,
  ShipaReadinessDto,
  ShipaSettingsEnvelopeDto,
} from "@/lib/shipaAdminResponses";
import type { ShipaAdminInvoke, ShipaAdminInvokeResult } from "@/lib/shipaAdmin";
import { buildShipaSaveableSettings, draftFromShipaSettings } from "@/lib/shipaAdmin";
import type { ShipaSaveableSettings } from "@/lib/shipaSettings";

/**
 * A typed key that is obviously not a credential.
 *
 * It is used only where a test is exercising the replacement path, and it
 * never reaches a store: the transport hands it to the fake boundary and
 * forgets it.
 */
export const TEST_KEY = "fake-key";

/** The synthetic integration id of the fixture envelope. */
export const SYNTHETIC_INTEGRATION_ID = "11111111-2222-4333-8444-555555555555";

// ---------------------------------------------------------------------------
// The settings fixtures
// ---------------------------------------------------------------------------

/** The sandbox draft: complete, with a stored key. */
export function sandboxSettingsFixture(): ShipaPublicSettings {
  return {
    appId: "sandbox-app-0001",
    origin: {
      contactName: "Warehouse desk",
      contactPhone: "+96500000001",
      address: {
        countryCode: KUWAIT_COUNTRY_CODE,
        governorate: "Hawalli",
        area: "Hawally",
        block: "",
        street: "Tunis St",
        building: "Grand Hyper Hawally 2 complex",
        addressLine: "",
      },
    },
    serviceCode: "Next Day",
    autoConfirm: false,
    pickupInstructions: "Ask for the warehouse manager.",
    parcel: {
      count: 1,
      weightKg: 2.5,
      dimensionsCm: { lengthCm: 20, widthCm: 15, heightCm: 10 },
    },
    credential: { present: true, rotatedAt: "2026-10-01T09:00:00Z", keyVersion: 1 },
  };
}

/** The live draft: different values and no stored key yet. */
export function liveSettingsFixture(): ShipaPublicSettings {
  return {
    appId: "live-app-0002",
    origin: {
      contactName: "CureMed company",
      contactPhone: "+96567664810",
      address: {
        countryCode: KUWAIT_COUNTRY_CODE,
        governorate: "Hawalli",
        area: "Hawally",
        block: "",
        street: "Tunis St",
        building: "Grand Hyper Hawally 2 complex",
        addressLine:
          "CureMed's Office, 2nd floor, office 2, Grand Hyper Hawally 2 complex, Tunis St, Hawally",
      },
    },
    serviceCode: "On Demand",
    autoConfirm: true,
    pickupInstructions: "Pickup 09:00-16:00 Asia/Kuwait.",
    parcel: {
      count: 1,
      weightKg: 4,
      dimensionsCm: null,
    },
    credential: { present: false, rotatedAt: null, keyVersion: null },
  };
}

/** The complete saved settings of the fixture. */
export function settingsFixture(): ShipaSettings {
  return {
    enabled: false,
    environment: "sandbox",
    dispatchMode: "manual_after_packing",
    revision: 7,
    sandbox: sandboxSettingsFixture(),
    live: liveSettingsFixture(),
  };
}

export interface SettingsEnvelopeOverrides {
  readonly integrationId?: string;
  readonly settings?: ShipaSettings;
  readonly workerLastOkAt?: string | null;
}

/** The settings envelope of the three settings actions. */
export function settingsEnvelopeFixture(
  overrides: SettingsEnvelopeOverrides = {},
): ShipaSettingsEnvelopeDto {
  return {
    integrationId: overrides.integrationId ?? SYNTHETIC_INTEGRATION_ID,
    settings: overrides.settings ?? settingsFixture(),
    workerLastOkAt: overrides.workerLastOkAt === undefined
      ? "2026-11-03T10:00:00Z"
      : overrides.workerLastOkAt,
    verification: { sandbox: null, live: null },
  };
}

/** A successful write advances exactly one persisted settings revision. */
export function writtenSettingsFixture(
  revision = 8,
  settings = settingsFixture(),
): ShipaSettingsEnvelopeDto {
  return settingsEnvelopeFixture({ settings: { ...settings, revision } });
}

/**
 * The saveable payload of the fixture settings.
 *
 * It is built with the real production builder, so the fixture can never drift
 * from the contract the transport sends.
 */
export function saveableSettingsFixture(): ShipaSaveableSettings {
  const built = buildShipaSaveableSettings(draftFromShipaSettings(settingsFixture()));
  if (!built.ok) throw new Error("The synthetic settings fixture must be saveable.");
  return built.settings;
}

// ---------------------------------------------------------------------------
// The readiness fixtures
// ---------------------------------------------------------------------------

/** The sandbox readiness facts of the fixture. */
export function sandboxReadinessFixture(): ShipaEnvironmentReadinessDto {
  return {
    credentialPresent: true,
    configurationReady: true,
    probeCurrent: true,
    credentialsVerified: true,
    originCityMatched: true,
    lastCheckedAt: "2026-11-03T10:00:00Z",
    safeCode: null,
    serviceEntitlement: "unconfirmed",
  };
}

/** The live readiness facts of the fixture: never verified. */
export function liveReadinessFixture(): ShipaEnvironmentReadinessDto {
  return {
    credentialPresent: false,
    configurationReady: true,
    probeCurrent: false,
    credentialsVerified: false,
    originCityMatched: false,
    lastCheckedAt: null,
    safeCode: "credential_missing",
    serviceEntitlement: "unconfirmed",
  };
}

export interface ReadinessOverrides {
  readonly settingsRevision?: number;
  readonly activeEnvironment?: ShipaEnvironment;
  readonly sandbox?: Partial<ShipaEnvironmentReadinessDto>;
  readonly live?: Partial<ShipaEnvironmentReadinessDto>;
  readonly scheduler?: Partial<ShipaReadinessDto["scheduler"]>;
}

/** The readiness projection of the two readiness actions. */
export function readinessFixture(overrides: ReadinessOverrides = {}): ShipaReadinessDto {
  return {
    settingsRevision: overrides.settingsRevision ?? 7,
    activeEnvironment: overrides.activeEnvironment ?? "sandbox",
    environments: {
      sandbox: { ...sandboxReadinessFixture(), ...(overrides.sandbox ?? {}) },
      live: { ...liveReadinessFixture(), ...(overrides.live ?? {}) },
    },
    scheduler: {
      lastOkAt: "2026-11-03T10:00:00Z",
      current: true,
      ...(overrides.scheduler ?? {}),
    },
  };
}

// ---------------------------------------------------------------------------
// The SDK-level responses
// ---------------------------------------------------------------------------

/** A successful HTTP 200 with a safe projection. */
export function successResponse(data: unknown): ShipaAdminInvokeResult {
  return { data: { success: true, data }, error: null };
}

/**
 * A refused HTTP response.
 *
 * The SDK hands the response to the client in `error.context`, so the fixture
 * does the same. The body is read at most once, exactly as the real response
 * would be.
 */
export function failureResponse(
  code: string,
  message = "server side text",
): ShipaAdminInvokeResult {
  return {
    data: null,
    error: {
      context: {
        json: async () => ({ success: false, error: { code, message } }),
      },
    },
  };
}

/** A transport failure: the invocation itself rejected. */
export function rejectedResponse(reason = "network down"): ShipaAdminInvokeResult {
  return { data: null, error: new Error(reason) };
}

// ---------------------------------------------------------------------------
// The fake SDK boundary
// ---------------------------------------------------------------------------

/** One recorded call. */
export interface RecordedCall {
  readonly functionName: string;
  readonly body: unknown;
}

/** The fake boundary of the transport. */
export interface FakeInvoke {
  readonly invoke: ShipaAdminInvoke;
  readonly calls: RecordedCall[];
  /** Queues one resolved response. */
  queueResult(result: ShipaAdminInvokeResult): void;
  /** Queues one rejection. */
  queueError(error: unknown): void;
  /** Delays one actual SDK response to exercise concurrent response ordering. */
  queueDeferred(response: Promise<ShipaAdminInvokeResult>): void;
}

type QueuedCall =
  | { readonly kind: "result"; readonly result: ShipaAdminInvokeResult }
  | { readonly kind: "deferred"; readonly result: Promise<ShipaAdminInvokeResult> }
  | { readonly kind: "error"; readonly error: unknown };

/**
 * Creates the fake `functions.invoke` boundary.
 *
 * The queue is explicit: an action the test did not prepare fails loudly
 * instead of returning an empty success, so an unexpected extra call is a
 * visible failure rather than a silent one.
 */
export function createFakeInvoke(): FakeInvoke {
  const calls: RecordedCall[] = [];
  const queue: QueuedCall[] = [];

  const invoke: ShipaAdminInvoke = async (functionName, options) => {
    calls.push({ functionName, body: options.body });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("Unexpected Shipa admin call.");
    }
    if (next.kind === "error") throw next.error;
    return next.result;
  };

  return {
    invoke,
    calls,
    queueResult(result) {
      queue.push({ kind: "result", result });
    },
    queueError(error) {
      queue.push({ kind: "error", error });
    },
    queueDeferred(result) {
      queue.push({ kind: "deferred", result });
    },
  };
}

/**
 * Reads the action of one recorded call.
 *
 * The action name and the request are the only things a test may look at; the
 * body is otherwise opaque.
 */
export function recordedAction(call: RecordedCall): {
  action: string;
  request?: Record<string, unknown>;
} {
  const body = call.body;
  if (typeof body !== "object" || body === null) return { action: "" };
  const record = body as Record<string, unknown>;
  const request = record.request;
  return {
    action: typeof record.action === "string" ? record.action : "",
    request: typeof request === "object" && request !== null
      ? (request as Record<string, unknown>)
      : undefined,
  };
}
