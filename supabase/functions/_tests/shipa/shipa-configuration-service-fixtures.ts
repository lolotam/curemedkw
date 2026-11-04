// Synthetic fixtures for the Shipa configuration service tests.
//
// Everything in this file is fabricated. The identifiers are made-up UUIDs,
// the addresses and contact details are placeholders, and no credential, key,
// token, account value or personal data exists anywhere below.
//
// The fake client is the SDK boundary: it records every call and replays a
// queued outcome per RPC function. The strict parsers, the shared schemas,
// the credential loader, the Web Crypto operations, the settings store and
// the services under test are the real production modules.

import type { ShipaSettingsRpcClient } from "../../_shared/shipa-settings-store.ts";
import { ShipaConfigurationError } from "../../_shared/shipa-configuration-service-contract.ts";
import { createEnvironmentConfig } from "./shipa-settings-fixtures.ts";

/** A recorded database call. */
export interface RecordedShipaRpcCall {
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

/** The queued outcome of one database call. */
export interface FakeShipaRpcOutcome {
  /** The value the call resolves with as `data`. */
  readonly data?: unknown;
  /** A resolved SQL error, as Supabase returns it by default. */
  readonly error?: unknown;
  /** A transport promise rejection, distinct from a resolved SQL error. */
  readonly rejection?: unknown;
  /** Extra SDK envelope properties, such as status, count and statusText. */
  readonly extra?: Record<string, unknown>;
  /** A raw resolved answer, used to prove a malformed envelope is refused. */
  readonly raw?: unknown;
}

/** The fake SDK boundary. */
export interface FakeShipaSdkClient extends ShipaSettingsRpcClient {
  /** Every call the service made, in order. */
  readonly calls: RecordedShipaRpcCall[];
  /** Queues the outcome of the next call of one function. */
  respond(fn: string, outcome: FakeShipaRpcOutcome): void;
  /** The names of the RPC functions the service called, in order. */
  calledFunctions(): readonly string[];
}

/**
 * The extra SDK envelope properties a real answer carries.
 *
 * A resolved Supabase answer is `{data, error}` plus `status`, `count` and
 * `statusText`. Those extra properties never invalidate the answer.
 */
export const FAKE_SDK_ENVELOPE: Readonly<Record<string, unknown>> = {
  status: 200,
  count: 1,
  statusText: "OK",
};

/**
 * Creates the fake database client.
 *
 * It has no database, no network and no environment access: it only records
 * calls and replays queued outcomes. A call that was never queued fails
 * loudly instead of answering silently.
 */
export function createFakeShipaSdkClient(): FakeShipaSdkClient {
  const calls: RecordedShipaRpcCall[] = [];
  const queues = new Map<string, FakeShipaRpcOutcome[]>();
  return {
    calls,
    respond(fn: string, outcome: FakeShipaRpcOutcome): void {
      const queue = queues.get(fn) ?? [];
      queue.push(outcome);
      queues.set(fn, queue);
    },
    calledFunctions(): readonly string[] {
      return calls.map((call) => call.fn);
    },
    rpc(fn: string, args?: Record<string, unknown>): PromiseLike<unknown> {
      calls.push({ fn, args: args ?? {} });
      const outcome = queues.get(fn)?.shift();
      if (!outcome) {
        return Promise.reject(new Error(`unexpected rpc: ${fn}`));
      }
      if (outcome.rejection !== undefined) {
        return Promise.reject(outcome.rejection);
      }
      if ("raw" in outcome) {
        return Promise.resolve(outcome.raw);
      }
      return Promise.resolve({
        data: outcome.data ?? null,
        error: outcome.error ?? null,
        ...(outcome.extra ?? {}),
      });
    },
  };
}

/**
 * The raw credential save request.
 *
 * The request is exactly `{expectedRevision, settings, credential}`. The
 * default action preserves the stored credential.
 */
export function createCredentialSaveRequest(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    expectedRevision: 4,
    settings: {
      enabled: false,
      environment: "sandbox",
      dispatchMode: "manual_after_packing",
      sandbox: createEnvironmentConfig(),
      live: createEnvironmentConfig(),
    },
    credential: { environment: "sandbox", mode: "preserve" },
    ...overrides,
  };
}

/**
 * Awaits an action that is expected to fail and returns its closed failure.
 *
 * A success or a foreign error is rethrown, so a test can never pass by
 * accident.
 */
export async function expectConfigurationFailure(
  action: () => Promise<unknown>,
): Promise<ShipaConfigurationError> {
  try {
    await action();
  } catch (error) {
    if (error instanceof ShipaConfigurationError) return error;
    throw error;
  }
  throw new Error("the action was expected to fail");
}
