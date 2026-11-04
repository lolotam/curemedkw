// Synthetic fixtures for the Shipa credential loader tests.
//
// Everything in this file is fabricated. The integration ids are made-up
// UUIDs, the API key is an invented string, and the master key material is
// generated freshly for every test. No real credential, provider key, master
// key or personal data exists anywhere below.
//
// Only the SDK boundary is faked. The fake records every call and replays a
// queued outcome; the strict document parser, the envelope parser, the
// additional-data tuple and the Web Crypto operations are the real
// production modules.

import { encodeCanonicalBase64 } from "../../_shared/integration-credential-contract.ts";
import {
  encryptIntegrationCredential,
  importIntegrationMasterKey,
  type IntegrationCredentialKeyring,
} from "../../_shared/integration-credentials.ts";
import type { ShipaCredentialRpcClient } from "../../_shared/shipa-credential-loader.ts";

/** A made-up integration id. */
export const SHIPA_TEST_INTEGRATION_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** A second made-up integration id. */
export const SHIPA_TEST_OTHER_INTEGRATION_ID =
  "9c858901-8a57-4791-81fe-4c455b099bc9";

/** A synthetic credential value. It is not a real provider key. */
export const SHIPA_TEST_API_CREDENTIAL = "synthetic-shipa-api-key-not-real";

/**
 * A synthetic SQL-owned fingerprint: sixty-four lowercase hexadecimal
 * characters that are not the serialisation of anything.
 */
export const SHIPA_TEST_FINGERPRINT =
  "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

/** A synthetic rotation timestamp. */
export const SHIPA_TEST_ROTATED_AT = "2026-11-03T22:41:55.105Z";

/** A recorded database call. */
export interface RecordedRpcCall {
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

/** The queued outcome of one database call. */
export interface FakeRpcOutcome {
  /** The value the call resolves with. */
  readonly data?: unknown;
  /** A resolved SQL error, as Supabase returns it by default. */
  readonly error?: unknown;
  /** A transport promise rejection, distinct from a resolved SQL error. */
  readonly rejection?: unknown;
  /** Extra SDK envelope properties, such as status, count and statusText. */
  readonly extra?: Record<string, unknown>;
}

/** The fake SDK boundary. */
export interface FakeShipaCredentialRpcClient extends ShipaCredentialRpcClient {
  /** Every call the loader made, in order. */
  readonly calls: RecordedRpcCall[];
  /** Queues the outcome of the next call. */
  queue(outcome: FakeRpcOutcome): void;
}

/**
 * Creates the fake database client. It has no database, no network and no
 * environment access: it only records calls and replays queued outcomes.
 */
export function createFakeShipaCredentialRpcClient(): FakeShipaCredentialRpcClient {
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
      if (outcome.rejection !== undefined) {
        return Promise.reject(outcome.rejection);
      }
      const data = "data" in outcome ? outcome.data : null;
      return Promise.resolve({
        data,
        error: outcome.error ?? null,
        ...(outcome.extra ?? {}),
      });
    },
  };
}

/** A freshly generated keyring for the tests. */
export interface SyntheticKeyring {
  readonly keyring: IntegrationCredentialKeyring;
  readonly keyVersion: number;
}

/**
 * Generates a fresh master key and wraps it in a keyring.
 *
 * The material is random and is never written down: every test that needs a
 * key creates its own.
 */
export async function createSyntheticKeyring(
  keyVersion = 1,
): Promise<SyntheticKeyring> {
  const material = encodeCanonicalBase64(
    crypto.getRandomValues(new Uint8Array(32)),
  );
  const key = await importIntegrationMasterKey(material);
  return {
    keyring: new Map<number, CryptoKey>([[keyVersion, key]]),
    keyVersion,
  };
}

/** The options of a synthetic stored credential. */
export interface SyntheticCredentialOptions {
  readonly keyring: IntegrationCredentialKeyring;
  readonly keyVersion?: number;
  readonly integrationId?: string;
  readonly environment?: "sandbox" | "live";
  readonly plaintext?: string;
  readonly credentialRevision?: number;
  readonly credentialFingerprint?: string;
  readonly rotatedAt?: string;
}

/**
 * Encrypts a synthetic credential and returns the exact four-key document
 * the SQL wrapper returns.
 */
export async function createStoredCredentialDocument(
  options: SyntheticCredentialOptions,
): Promise<Record<string, unknown>> {
  const keyVersion = options.keyVersion ?? 1;
  const envelope = await encryptIntegrationCredential(
    options.plaintext ?? SHIPA_TEST_API_CREDENTIAL,
    {
      integrationId: options.integrationId ?? SHIPA_TEST_INTEGRATION_ID,
      provider: "shipa",
      environment: options.environment ?? "sandbox",
      keyVersion,
    },
    options.keyring,
  );
  return {
    envelope,
    credential_revision: options.credentialRevision ?? 3,
    rotated_at: options.rotatedAt ?? SHIPA_TEST_ROTATED_AT,
    credential_fingerprint: options.credentialFingerprint ??
      SHIPA_TEST_FINGERPRINT,
  };
}

/**
 * Builds a well-formed envelope that no key can decrypt.
 *
 * It is used to prove that the metadata of a stored credential does not need
 * a successful decryption.
 */
export function createUndecryptableEnvelope(
  integrationId: string = SHIPA_TEST_INTEGRATION_ID,
  environment: "sandbox" | "live" = "sandbox",
  keyVersion = 1,
): Record<string, unknown> {
  return {
    integration_id: integrationId,
    provider: "shipa",
    environment,
    key_version: keyVersion,
    nonce: encodeCanonicalBase64(new Uint8Array(12)),
    ciphertext: encodeCanonicalBase64(
      crypto.getRandomValues(new Uint8Array(64)),
    ),
  };
}
