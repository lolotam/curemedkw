// Synthetic fixtures for the Shipa admin endpoint tests.
//
// Everything in this file is fabricated. The user ids are made-up UUIDs, the
// session token is an invented string, and no real credential, key, token,
// account value or personal data exists below.
//
// Only the Supabase SDK boundary is faked. The fake combines the verified
// session lookup, the role query and the RPC calls of the existing fixtures
// into one client, and it records every session lookup, every role query and
// every database call. The authorization helper, the strict parsers, the
// settings store, the credential service, the readiness service, the Web
// Crypto primitives and the provider adapter are the real production modules.

import { encodeCanonicalBase64 } from "../../_shared/integration-credential-contract.ts";
import {
  importIntegrationMasterKey,
  type IntegrationCredentialKeyring,
} from "../../_shared/integration-credentials.ts";
import type { ShipaAuthClient } from "../../_shared/shipa-auth.ts";
import type { ShipaSettingsRpcClient } from "../../_shared/shipa-settings-store.ts";
import {
  createFakeShipaAuthClient,
  type FakeAuthUserOutcome,
  type FakeRoleOutcome,
  type RecordedAuthCall,
  type RecordedRoleQuery,
} from "./shipa-auth-fixtures.ts";
import {
  createFakeShipaSdkClient,
  type FakeShipaRpcOutcome,
  type RecordedShipaRpcCall,
} from "./shipa-configuration-service-fixtures.ts";

/** The fake SDK boundary of the admin endpoint. */
export interface FakeShipaAdminClient
  extends ShipaAuthClient, ShipaSettingsRpcClient {
  /** Every session lookup the handler made, in order. */
  readonly authCalls: readonly RecordedAuthCall[];
  /** Every role query the handler made, in order. */
  readonly roleQueries: readonly RecordedRoleQuery[];
  /** Every database call the handler made, in order. */
  readonly rpcCalls: readonly RecordedShipaRpcCall[];
  /** Queues the outcome of the next session lookup. */
  queueUser(outcome: FakeAuthUserOutcome): void;
  /** Queues the outcome of the next role query. */
  queueRole(outcome: FakeRoleOutcome): void;
  /** Queues the outcome of the next call of one RPC function. */
  respond(fn: string, outcome: FakeShipaRpcOutcome): void;
  /** The names of the RPC functions the handler called, in order. */
  calledFunctions(): readonly string[];
}

/**
 * Creates the fake SDK boundary.
 *
 * It has no database, no network and no environment access: it only records
 * calls and replays queued outcomes. A call that was never queued fails
 * loudly instead of answering silently.
 */
export function createFakeShipaAdminClient(): FakeShipaAdminClient {
  const auth = createFakeShipaAuthClient();
  const sdk = createFakeShipaSdkClient();
  return {
    auth: auth.auth,
    from: auth.from,
    rpc: sdk.rpc,
    authCalls: auth.authCalls,
    roleQueries: auth.roleQueries,
    rpcCalls: sdk.calls,
    queueUser: auth.queueUser,
    queueRole: auth.queueRole,
    respond: sdk.respond,
    calledFunctions: sdk.calledFunctions,
  };
}

/** The fake master-key reader. It records how often it was consulted. */
export interface FakeEncryptionKeyReader {
  /** The callback the runtime injects. */
  readonly read: () => string | undefined;
  /** How many times the callback was consulted. */
  callCount(): number;
}

/**
 * Creates the fake master-key reader.
 *
 * A missing value models a deployment without the master key.
 */
export function createFakeEncryptionKeyReader(
  value?: string,
): FakeEncryptionKeyReader {
  let calls = 0;
  return {
    read(): string | undefined {
      calls += 1;
      return value;
    },
    callCount(): number {
      return calls;
    },
  };
}

/**
 * Queues a verified administrator session.
 *
 * The session resolves with the given user id and the role query resolves
 * with a real admin row.
 */
export function queueAdminSession(
  client: FakeShipaAdminClient,
  userId: string,
): void {
  client.queueUser({ user: { id: userId } });
  client.queueRole({ data: { role: "admin" } });
}

/** Finds one recorded database call, or fails the test loudly. */
export function findRpcCall(
  client: FakeShipaAdminClient,
  fn: string,
): RecordedShipaRpcCall {
  const call = client.rpcCalls.find((entry) => entry.fn === fn);
  if (call === undefined) {
    throw new Error(`the handler made no ${fn} call`);
  }
  return call;
}

/** A synthetic master key in both of the forms the runtime needs. */
export interface SyntheticMasterKey {
  /** The encoded key the runtime reads through its injected callback. */
  readonly encoded: string;
  /** The keyring a stored credential was encrypted with. */
  readonly keyring: IntegrationCredentialKeyring;
  /** The key version both of them use. */
  readonly keyVersion: number;
}

/**
 * Generates a fresh master key.
 *
 * The material is random and is never written down: every test that needs a
 * key creates its own. The encoded form and the imported keyring are both
 * returned, because the runtime imports the key itself while a stored
 * credential has to be encrypted with the very same key.
 */
export async function createSyntheticMasterKey(
  keyVersion = 1,
): Promise<SyntheticMasterKey> {
  const encoded = encodeCanonicalBase64(
    crypto.getRandomValues(new Uint8Array(32)),
  );
  const key = await importIntegrationMasterKey(encoded);
  return {
    encoded,
    keyring: new Map<number, CryptoKey>([[keyVersion, key]]),
    keyVersion,
  };
}
