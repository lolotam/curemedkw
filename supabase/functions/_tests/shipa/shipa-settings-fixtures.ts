// Synthetic fixtures for the Shipa settings store tests.
//
// Everything in this file is fabricated. The identifiers are made-up UUIDs,
// the addresses and contact details are placeholders, and no credential, key,
// token, account value or personal data exists anywhere below.
//
// The fake client is the SDK boundary: it records every call and replays a
// queued outcome. The parser, the shared schemas and the store under test are
// the real production modules.

import type { ShipaSettingsRpcClient } from "../../_shared/shipa-settings-store.ts";

/** A made-up integration id. */
export const SHIPA_TEST_INTEGRATION_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** A made-up administrator id. */
export const SHIPA_TEST_ACTOR_ID = "9c858901-8a57-4791-81fe-4c455b099bc9";

export interface RecordedRpcCall {
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

export interface FakeRpcOutcome {
  /** The value the fake call resolves with. */
  readonly result?: unknown;
  /** A resolved SQL error, as Supabase returns it by default. */
  readonly error?: unknown;
  /** A transport promise rejection, distinct from a resolved SQL error. */
  readonly rejection?: unknown;
}

export interface FakeShipaRpcClient extends ShipaSettingsRpcClient {
  /** Every call the store made, in order. */
  readonly calls: RecordedRpcCall[];
  /** Queues the outcome of the next call. */
  queue(outcome: FakeRpcOutcome): void;
}

/**
 * Creates a fake database client. It has no database, no network and no
 * environment access: it only records calls and replays queued outcomes.
 */
export function createFakeShipaRpcClient(): FakeShipaRpcClient {
  const calls: RecordedRpcCall[] = [];
  const outcomes: FakeRpcOutcome[] = [];
  return {
    calls,
    queue(outcome: FakeRpcOutcome): void {
      outcomes.push(outcome);
    },
    rpc(fn: string, args?: Record<string, unknown>): PromiseLike<unknown> {
      calls.push({ fn, args: args ?? {} });
      const outcome = outcomes.shift();
      if (!outcome) {
        return Promise.reject(new Error("no queued outcome"));
      }
      if (outcome.rejection !== undefined) return Promise.reject(outcome.rejection);
      return Promise.resolve({ data: outcome.result ?? null, error: outcome.error ?? null });
    },
  };
}

/**
 * The six configuration fields of one environment, without the derived
 * credential metadata. This is what a browser save may carry.
 */
export function createEnvironmentConfig(): Record<string, unknown> {
  return {
    appId: "app-test",
    origin: {
      contactName: "Curemed",
      contactPhone: "+96550000000",
      address: {
        countryCode: "KW",
        governorate: "Hawalli",
        area: "Hawally",
        block: "",
        street: "",
        building: "",
        addressLine: "Warehouse 3",
      },
    },
    serviceCode: "Same Day",
    autoConfirm: false,
    pickupInstructions: "",
    parcel: {
      count: 1,
      weightKg: 1.5,
      dimensionsCm: { lengthCm: 20, widthCm: 15, heightCm: 10 },
    },
  };
}

/**
 * One environment as the SQL document carries it: the six configuration
 * fields plus the derived credential metadata.
 */
export function createEnvironmentSettings(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...createEnvironmentConfig(),
    credential: { present: false, rotatedAt: null, keyVersion: null },
    ...overrides,
  };
}

/** The six safe keys of the settings block, with its revision. */
export function createSettingsBlock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enabled: false,
    environment: "sandbox",
    dispatchMode: "manual_after_packing",
    revision: 0,
    sandbox: createEnvironmentSettings(),
    live: createEnvironmentSettings(),
    ...overrides,
  };
}

/** The exact four-key document the SQL wrappers return. */
export function createSettingsDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    integration_id: SHIPA_TEST_INTEGRATION_ID,
    settings: createSettingsBlock(),
    worker_last_ok_at: null,
    verification: { sandbox: null, live: null },
    ...overrides,
  };
}

/** A browser save request: an expected revision and the five safe fields. */
export function createSaveRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    expectedRevision: 4,
    settings: {
      enabled: false,
      environment: "sandbox",
      dispatchMode: "manual_after_packing",
      sandbox: createEnvironmentConfig(),
      live: createEnvironmentConfig(),
    },
    ...overrides,
  };
}

/** A database error shaped like the ones the client surfaces. */
export function createSqlError(
  code: string,
  message: string,
  details: string | null = null,
): Record<string, unknown> {
  return { code, message, details, hint: null };
}
