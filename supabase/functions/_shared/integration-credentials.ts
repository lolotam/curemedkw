// Server-only AES-256-GCM credential primitives.
//
// This module owns the Web Crypto operations: importing the master key,
// encrypting a credential into the stored envelope and decrypting an envelope
// back to its plaintext. The shapes, the closed failures and the additional
// data format live in `./integration-credential-contract.ts`.
//
// Source of truth:
//   docs/superpowers/specs/2026-11-02-shipa-delivery-design.md (section 5)
//   docs/superpowers/plans/2026-11-02-shipa-delivery.md (task 5)
//
// Trust boundary:
//   - The master key arrives as an already imported `CryptoKey`. This module
//     never reads `Deno.env` and never looks a key up by itself.
//   - The keyring is injected by the caller. Selecting the current key
//     version is a caller decision; this module never falls back to another
//     version than the one the context names.
//   - Nothing here logs. No plaintext, key material or provider response ever
//     reaches an error, a message or a returned envelope.
//
// This slice is deliberately free of storage, SQL, network and configuration.
// Preserve/replace/remove of a stored credential is a later store and action
// concern: the crypto layer must never report a storage success.

import {
  buildIntegrationCredentialAad,
  decodeCanonicalBase64,
  encodeCanonicalBase64,
  INTEGRATION_CREDENTIAL_MAX_PLAINTEXT_BYTES,
  INTEGRATION_CREDENTIAL_NONCE_BYTES,
  INTEGRATION_CREDENTIAL_TAG_BYTES,
  INTEGRATION_MASTER_KEY_BYTES,
  type IntegrationCredentialContext,
  IntegrationCredentialError,
  type IntegrationEncryptedCredential,
  normalizeIntegrationCredentialContext,
  parseIntegrationEncryptedCredential,
} from "./integration-credential-contract.ts";

/**
 * The injected set of master keys, indexed by key version. The caller owns
 * the map, the current version and the rotation procedure.
 */
export type IntegrationCredentialKeyring = ReadonlyMap<number, CryptoKey>;

const AES_GCM_ALGORITHM = "AES-GCM";
const AES_256_KEY_LENGTH_BITS = 256;
const AES_GCM_TAG_LENGTH_BITS = INTEGRATION_CREDENTIAL_TAG_BYTES * 8;

/** The algorithm shape of an imported AES key. */
type AesKeyAlgorithmShape = { readonly name: string; readonly length?: number };

// --- Key handling -----------------------------------------------------------

/**
 * Imports a master key from canonical standard base64.
 *
 * The value must decode to exactly 32 bytes. The imported key is AES-256-GCM,
 * allows encryption and decryption and is never extractable, so the raw
 * material cannot be read back out of the key object.
 */
export async function importIntegrationMasterKey(
  base64: string,
): Promise<CryptoKey> {
  if (typeof base64 !== "string") {
    throw new IntegrationCredentialError("invalid_master_key_encoding");
  }
  const keyBytes = decodeCanonicalBase64(base64);
  if (keyBytes === null) {
    throw new IntegrationCredentialError("invalid_master_key_encoding");
  }
  if (keyBytes.length !== INTEGRATION_MASTER_KEY_BYTES) {
    throw new IntegrationCredentialError("invalid_master_key_length");
  }
  try {
    return await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: AES_GCM_ALGORITHM, length: AES_256_KEY_LENGTH_BITS },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    // The original exception is dropped: it can quote the material it was
    // given.
    throw new IntegrationCredentialError("invalid_master_key_encoding");
  }
}

/**
 * Checks that a supplied key can actually perform the operations.
 *
 * A key with the wrong algorithm or length, a key that is missing a usage or
 * a key that is extractable is refused before it can be used.
 */
function assertUsableKey(key: CryptoKey): void {
  if (!(key instanceof CryptoKey)) {
    throw new IntegrationCredentialError("invalid_key_algorithm");
  }
  const algorithm = key.algorithm as AesKeyAlgorithmShape;
  if (
    algorithm.name !== AES_GCM_ALGORITHM ||
    algorithm.length !== AES_256_KEY_LENGTH_BITS
  ) {
    throw new IntegrationCredentialError("invalid_key_algorithm");
  }
  const usages = key.usages;
  if (!usages.includes("encrypt") || !usages.includes("decrypt")) {
    throw new IntegrationCredentialError("invalid_key_usage");
  }
  if (key.extractable) {
    throw new IntegrationCredentialError("invalid_key_extractable");
  }
}

/**
 * Resolves the key of exactly the requested version.
 *
 * There is no fallback: a keyring without that version fails, even when it
 * holds another usable version.
 */
function resolveKey(
  keyring: IntegrationCredentialKeyring,
  keyVersion: number,
): CryptoKey {
  const source: unknown = keyring;
  if (typeof source !== "object" || source === null) {
    throw new IntegrationCredentialError("unknown_key_version");
  }
  const lookup = (source as Partial<IntegrationCredentialKeyring>).get;
  if (typeof lookup !== "function") {
    throw new IntegrationCredentialError("unknown_key_version");
  }
  const key = lookup.call(source, keyVersion);
  if (key === undefined) {
    throw new IntegrationCredentialError("unknown_key_version");
  }
  assertUsableKey(key);
  return key;
}

// --- Encryption -------------------------------------------------------------

/**
 * Encrypts a credential into the stored envelope.
 *
 * A fresh cryptographically random 96-bit nonce is used for every call, so
 * the same plaintext never produces the same ciphertext twice. The plaintext
 * must be a nonempty UTF-8 string of at most 16 KiB.
 *
 * The returned envelope carries ciphertext and public metadata only.
 */
export async function encryptIntegrationCredential(
  plaintext: string,
  context: IntegrationCredentialContext,
  keyring: IntegrationCredentialKeyring,
): Promise<IntegrationEncryptedCredential> {
  const normalized = normalizeIntegrationCredentialContext(context);
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new IntegrationCredentialError("invalid_plaintext");
  }
  const plaintextBytes = new TextEncoder().encode(plaintext);
  if (
    new TextDecoder("utf-8", { fatal: true }).decode(plaintextBytes) !==
      plaintext ||
    plaintextBytes.length === 0 ||
    plaintextBytes.length > INTEGRATION_CREDENTIAL_MAX_PLAINTEXT_BYTES
  ) {
    throw new IntegrationCredentialError("invalid_plaintext");
  }

  const key = resolveKey(keyring, normalized.keyVersion);
  const nonce = crypto.getRandomValues(
    new Uint8Array(INTEGRATION_CREDENTIAL_NONCE_BYTES),
  );
  const additionalData = buildIntegrationCredentialAad(normalized);

  let ciphertext: Uint8Array;
  try {
    const encrypted = await crypto.subtle.encrypt(
      {
        name: AES_GCM_ALGORITHM,
        iv: nonce,
        additionalData,
        tagLength: AES_GCM_TAG_LENGTH_BITS,
      },
      key,
      plaintextBytes,
    );
    ciphertext = new Uint8Array(encrypted);
  } catch {
    throw new IntegrationCredentialError("encryption_failed");
  }

  return {
    integration_id: normalized.integrationId,
    provider: normalized.provider,
    environment: normalized.environment,
    key_version: normalized.keyVersion,
    nonce: encodeCanonicalBase64(nonce),
    ciphertext: encodeCanonicalBase64(ciphertext),
  };
}

// --- Decryption -------------------------------------------------------------

/**
 * Decrypts a stored envelope back to its plaintext.
 *
 * The envelope must match the expected context exactly: a different
 * integration, a different provider, a different environment or a different
 * key version is refused before any key is used, and the additional data
 * binds the same tuple cryptographically as well.
 *
 * The plaintext is decoded as fatal UTF-8. Corrupt bytes are a failure, never
 * a string with replacement characters.
 */
export async function decryptIntegrationCredential(
  row: unknown,
  expectedContext: IntegrationCredentialContext,
  keyring: IntegrationCredentialKeyring,
): Promise<string> {
  const envelope = parseIntegrationEncryptedCredential(row);
  const expected = normalizeIntegrationCredentialContext(expectedContext);
  if (
    envelope.integration_id !== expected.integrationId ||
    envelope.provider !== expected.provider ||
    envelope.environment !== expected.environment ||
    envelope.key_version !== expected.keyVersion
  ) {
    throw new IntegrationCredentialError("context_mismatch");
  }

  const key = resolveKey(keyring, expected.keyVersion);
  const nonce = decodeCanonicalBase64(envelope.nonce);
  const ciphertext = decodeCanonicalBase64(envelope.ciphertext);
  if (nonce === null || ciphertext === null) {
    throw new IntegrationCredentialError("invalid_envelope");
  }

  const additionalData = buildIntegrationCredentialAad(expected);
  let plaintextBytes: ArrayBuffer;
  try {
    plaintextBytes = await crypto.subtle.decrypt(
      {
        name: AES_GCM_ALGORITHM,
        iv: nonce,
        additionalData,
        tagLength: AES_GCM_TAG_LENGTH_BITS,
      },
      key,
      ciphertext,
    );
  } catch {
    // An authentication failure is reported as a fixed code. The original
    // exception is dropped.
    throw new IntegrationCredentialError("decryption_failed");
  }

  let plaintext: string;
  try {
    plaintext = new TextDecoder("utf-8", { fatal: true }).decode(
      plaintextBytes,
    );
  } catch {
    throw new IntegrationCredentialError("invalid_plaintext_encoding");
  }

  const decoded = new TextEncoder().encode(plaintext);
  if (
    decoded.length === 0 ||
    decoded.length > INTEGRATION_CREDENTIAL_MAX_PLAINTEXT_BYTES
  ) {
    throw new IntegrationCredentialError("invalid_plaintext");
  }
  return plaintext;
}
