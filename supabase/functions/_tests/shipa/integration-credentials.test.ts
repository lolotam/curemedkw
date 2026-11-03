// Behavioural tests for the server-only AES-256-GCM credential primitives.
//
// The real Web Crypto implementation does the work here. Nothing is mocked,
// no internal module is replaced and no master key is hardcoded: every test
// generates its own random key material and imports it through the public
// entry point.
//
// A failing assertion inside a test is never treated as evidence. Each
// tamper case first proves that the untampered envelope decrypts, so a
// failure can only come from the tamper itself.

import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "jsr:@std/assert@1.0.19";

import {
  buildIntegrationCredentialAad,
  decodeCanonicalBase64,
  encodeCanonicalBase64,
  INTEGRATION_CREDENTIAL_ERROR_MESSAGES,
  INTEGRATION_CREDENTIAL_MAX_PLAINTEXT_BYTES,
  INTEGRATION_CREDENTIAL_NONCE_BYTES,
  type IntegrationCredentialContext,
  IntegrationCredentialError,
  type IntegrationCredentialErrorCode,
  type IntegrationEncryptedCredential,
} from "../../_shared/integration-credential-contract.ts";
import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
  importIntegrationMasterKey,
  type IntegrationCredentialKeyring,
} from "../../_shared/integration-credentials.ts";

const BASE_CONTEXT: IntegrationCredentialContext = {
  integrationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  provider: "shipa",
  environment: "sandbox",
  keyVersion: 1,
};

/** A synthetic credential value. It is not a real provider key. */
const PLAINTEXT = "test-key-only-not-a-real-credential";

function randomMasterKeyMaterial(): string {
  return encodeCanonicalBase64(crypto.getRandomValues(new Uint8Array(32)));
}

async function randomMasterKey(): Promise<CryptoKey> {
  return await importIntegrationMasterKey(randomMasterKeyMaterial());
}

function keyring(
  version: number,
  key: CryptoKey,
): IntegrationCredentialKeyring {
  return new Map<number, CryptoKey>([[version, key]]);
}

async function expectCredentialError(
  code: IntegrationCredentialErrorCode,
  action: () => Promise<unknown>,
): Promise<IntegrationCredentialError> {
  const error = await assertRejects(action, IntegrationCredentialError);
  assertEquals(error.code, code);
  assertEquals(error.message, INTEGRATION_CREDENTIAL_ERROR_MESSAGES[code]);
  return error;
}

Deno.test("round trips a credential through the real Web Crypto implementation", async () => {
  const key = await randomMasterKey();
  const ring = keyring(1, key);

  const envelope = await encryptIntegrationCredential(
    PLAINTEXT,
    BASE_CONTEXT,
    ring,
  );

  assertEquals(Object.keys(envelope).sort(), [
    "ciphertext",
    "environment",
    "integration_id",
    "key_version",
    "nonce",
    "provider",
  ]);
  assertEquals(envelope.integration_id, BASE_CONTEXT.integrationId);
  assertEquals(envelope.provider, "shipa");
  assertEquals(envelope.environment, "sandbox");
  assertEquals(envelope.key_version, 1);
  assertEquals(JSON.stringify(envelope).includes(PLAINTEXT), false);

  const decrypted = await decryptIntegrationCredential(
    envelope,
    BASE_CONTEXT,
    ring,
  );
  assertEquals(decrypted, PLAINTEXT);
});

Deno.test("uses a fresh nonce and a fresh ciphertext for every write", async () => {
  const key = await randomMasterKey();
  const ring = keyring(1, key);

  const first = await encryptIntegrationCredential(
    PLAINTEXT,
    BASE_CONTEXT,
    ring,
  );
  const second = await encryptIntegrationCredential(
    PLAINTEXT,
    BASE_CONTEXT,
    ring,
  );

  assertNotEquals(first.nonce, second.nonce);
  assertNotEquals(first.ciphertext, second.ciphertext);

  const nonceBytes = decodeCanonicalBase64(first.nonce);
  assert(nonceBytes !== null);
  assertEquals(nonceBytes.length, INTEGRATION_CREDENTIAL_NONCE_BYTES);

  // Both ciphertexts still decrypt to the same plaintext.
  assertEquals(
    await decryptIntegrationCredential(first, BASE_CONTEXT, ring),
    PLAINTEXT,
  );
  assertEquals(
    await decryptIntegrationCredential(second, BASE_CONTEXT, ring),
    PLAINTEXT,
  );
});

Deno.test("binds the ciphertext to the integration identity", async () => {
  const key = await randomMasterKey();
  const ring = keyring(1, key);
  const envelope = await encryptIntegrationCredential(
    PLAINTEXT,
    BASE_CONTEXT,
    ring,
  );

  // A different integration.
  await expectCredentialError(
    "context_mismatch",
    () =>
      decryptIntegrationCredential(envelope, {
        ...BASE_CONTEXT,
        integrationId: "9c858901-8a57-4791-81fe-4c455b099bc9",
      }, ring),
  );

  // The other environment, with the same master key.
  await expectCredentialError(
    "context_mismatch",
    () =>
      decryptIntegrationCredential(envelope, {
        ...BASE_CONTEXT,
        environment: "live",
      }, ring),
  );

  // Another key version.
  await expectCredentialError(
    "context_mismatch",
    () =>
      decryptIntegrationCredential(envelope, {
        ...BASE_CONTEXT,
        keyVersion: 2,
      }, ring),
  );

  // A provider that this contract does not know.
  await expectCredentialError(
    "invalid_envelope",
    () =>
      decryptIntegrationCredential(
        {
          ...envelope,
          provider: "other" as unknown as "shipa",
        },
        BASE_CONTEXT,
        ring,
      ),
  );
});

Deno.test("fails to decrypt after a ciphertext tamper", async () => {
  const key = await randomMasterKey();
  const ring = keyring(1, key);
  const envelope = await encryptIntegrationCredential(
    PLAINTEXT,
    BASE_CONTEXT,
    ring,
  );

  // Control: the untampered envelope decrypts.
  assertEquals(
    await decryptIntegrationCredential(envelope, BASE_CONTEXT, ring),
    PLAINTEXT,
  );

  const ciphertextBytes = decodeCanonicalBase64(envelope.ciphertext);
  assert(ciphertextBytes !== null);
  const tamperedBytes = Uint8Array.from(ciphertextBytes);
  tamperedBytes[0] = tamperedBytes[0] ^ 0x01;
  const tampered: IntegrationEncryptedCredential = {
    ...envelope,
    ciphertext: encodeCanonicalBase64(tamperedBytes),
  };

  const error = await expectCredentialError(
    "decryption_failed",
    () => decryptIntegrationCredential(tampered, BASE_CONTEXT, ring),
  );
  assertEquals(error.message.includes(PLAINTEXT), false);
});

Deno.test("fails to decrypt after a nonce tamper", async () => {
  const key = await randomMasterKey();
  const ring = keyring(1, key);
  const envelope = await encryptIntegrationCredential(
    PLAINTEXT,
    BASE_CONTEXT,
    ring,
  );

  assertEquals(
    await decryptIntegrationCredential(envelope, BASE_CONTEXT, ring),
    PLAINTEXT,
  );

  const nonceBytes = decodeCanonicalBase64(envelope.nonce);
  assert(nonceBytes !== null);
  const tamperedNonce = Uint8Array.from(nonceBytes);
  tamperedNonce[0] = tamperedNonce[0] ^ 0x01;

  await expectCredentialError(
    "decryption_failed",
    () =>
      decryptIntegrationCredential(
        {
          ...envelope,
          nonce: encodeCanonicalBase64(tamperedNonce),
        },
        BASE_CONTEXT,
        ring,
      ),
  );
});

Deno.test("fails to decrypt a payload sealed with another additional data tuple", async () => {
  const key = await randomMasterKey();
  const ring = keyring(1, key);

  const forge = async (
    additionalData: Uint8Array<ArrayBuffer>,
  ): Promise<IntegrationEncryptedCredential> => {
    const nonce = crypto.getRandomValues(
      new Uint8Array(INTEGRATION_CREDENTIAL_NONCE_BYTES),
    );
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData, tagLength: 128 },
      key,
      new TextEncoder().encode(PLAINTEXT),
    );
    return {
      integration_id: BASE_CONTEXT.integrationId,
      provider: "shipa",
      environment: "sandbox",
      key_version: 1,
      nonce: encodeCanonicalBase64(nonce),
      ciphertext: encodeCanonicalBase64(new Uint8Array(encrypted)),
    };
  };

  // The same values in a different order.
  const reordered = new TextEncoder().encode(
    JSON.stringify([
      1,
      "shipa",
      BASE_CONTEXT.integrationId,
      BASE_CONTEXT.environment,
      BASE_CONTEXT.keyVersion,
    ]),
  );
  const reorderedEnvelope = await forge(reordered);
  await expectCredentialError(
    "decryption_failed",
    () => decryptIntegrationCredential(reorderedEnvelope, BASE_CONTEXT, ring),
  );

  // Another purpose in the first position.
  const otherPurpose = new TextEncoder().encode(
    JSON.stringify([
      2,
      BASE_CONTEXT.integrationId,
      "shipa",
      BASE_CONTEXT.environment,
      BASE_CONTEXT.keyVersion,
    ]),
  );
  const otherPurposeEnvelope = await forge(otherPurpose);
  await expectCredentialError(
    "decryption_failed",
    () =>
      decryptIntegrationCredential(otherPurposeEnvelope, BASE_CONTEXT, ring),
  );

  // Another provider inside the tuple.
  const otherProvider = new TextEncoder().encode(
    JSON.stringify([
      1,
      BASE_CONTEXT.integrationId,
      "other",
      BASE_CONTEXT.environment,
      BASE_CONTEXT.keyVersion,
    ]),
  );
  const otherProviderEnvelope = await forge(otherProvider);
  await expectCredentialError(
    "decryption_failed",
    () =>
      decryptIntegrationCredential(otherProviderEnvelope, BASE_CONTEXT, ring),
  );
});

Deno.test("never falls back to another key version", async () => {
  const key = await randomMasterKey();
  const otherKey = await randomMasterKey();
  const ring = keyring(1, key);
  const envelope = await encryptIntegrationCredential(
    PLAINTEXT,
    BASE_CONTEXT,
    ring,
  );

  // The keyring holds a usable key, but not for the version of the envelope.
  const wrongRing = keyring(2, otherKey);
  await expectCredentialError(
    "unknown_key_version",
    () => decryptIntegrationCredential(envelope, BASE_CONTEXT, wrongRing),
  );

  // An empty keyring fails the same way.
  await expectCredentialError(
    "unknown_key_version",
    () =>
      decryptIntegrationCredential(
        envelope,
        BASE_CONTEXT,
        new Map<number, CryptoKey>(),
      ),
  );
});

Deno.test("refuses an invalid master key", async () => {
  await expectCredentialError(
    "invalid_master_key_encoding",
    () => importIntegrationMasterKey("not base64 at all"),
  );
  await expectCredentialError(
    "invalid_master_key_encoding",
    () => importIntegrationMasterKey("aGVsbG8"),
  );
  await expectCredentialError(
    "invalid_master_key_length",
    () => importIntegrationMasterKey(encodeCanonicalBase64(new Uint8Array(16))),
  );
  await expectCredentialError(
    "invalid_master_key_length",
    () => importIntegrationMasterKey(encodeCanonicalBase64(new Uint8Array(33))),
  );
  await expectCredentialError(
    "invalid_master_key_length",
    () => importIntegrationMasterKey(""),
  );
});

Deno.test("imports a nonextractable AES-256-GCM master key", async () => {
  const key = await importIntegrationMasterKey(randomMasterKeyMaterial());

  assertEquals(key.extractable, false);
  const algorithm = key.algorithm as { name: string; length?: number };
  assertEquals(algorithm.name, "AES-GCM");
  assertEquals(algorithm.length, 256);
  assertEquals(key.usages.includes("encrypt"), true);
  assertEquals(key.usages.includes("decrypt"), true);
});

Deno.test("refuses a key with the wrong algorithm, length or usage", async () => {
  const material = crypto.getRandomValues(new Uint8Array(32));

  const wrongAlgorithm = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-CBC" },
    false,
    ["encrypt", "decrypt"],
  );
  const wrongLength = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(16)),
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt", "decrypt"],
  );
  const missingUsage = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const extractableKey = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  await expectCredentialError(
    "invalid_key_algorithm",
    () =>
      encryptIntegrationCredential(
        PLAINTEXT,
        BASE_CONTEXT,
        keyring(1, wrongAlgorithm),
      ),
  );
  await expectCredentialError(
    "invalid_key_algorithm",
    () =>
      encryptIntegrationCredential(
        PLAINTEXT,
        BASE_CONTEXT,
        keyring(1, wrongLength),
      ),
  );
  await expectCredentialError(
    "invalid_key_usage",
    () =>
      encryptIntegrationCredential(
        PLAINTEXT,
        BASE_CONTEXT,
        keyring(1, missingUsage),
      ),
  );
  await expectCredentialError(
    "invalid_key_extractable",
    () =>
      encryptIntegrationCredential(
        PLAINTEXT,
        BASE_CONTEXT,
        keyring(1, extractableKey),
      ),
  );
});

Deno.test("refuses an envelope that is not the exact stored shape", async () => {
  const key = await randomMasterKey();
  const ring = keyring(1, key);
  const envelope = await encryptIntegrationCredential(
    PLAINTEXT,
    BASE_CONTEXT,
    ring,
  );

  await expectCredentialError(
    "invalid_envelope",
    () =>
      decryptIntegrationCredential(
        { ...envelope, credential_revision: 2 },
        BASE_CONTEXT,
        ring,
      ),
  );
  await expectCredentialError(
    "invalid_envelope",
    () =>
      decryptIntegrationCredential(
        {
          integration_id: envelope.integration_id,
          provider: envelope.provider,
          environment: envelope.environment,
          key_version: envelope.key_version,
          nonce: envelope.nonce,
        },
        BASE_CONTEXT,
        ring,
      ),
  );
  await expectCredentialError(
    "invalid_envelope",
    () =>
      decryptIntegrationCredential(
        { ...envelope, keyVersion: 1 },
        BASE_CONTEXT,
        ring,
      ),
  );
});

Deno.test("enforces the plaintext bounds in UTF-8 bytes", async () => {
  const key = await randomMasterKey();
  const ring = keyring(1, key);

  await expectCredentialError(
    "invalid_plaintext",
    () => encryptIntegrationCredential("", BASE_CONTEXT, ring),
  );

  await expectCredentialError(
    "invalid_plaintext",
    () =>
      encryptIntegrationCredential(
        "a".repeat(INTEGRATION_CREDENTIAL_MAX_PLAINTEXT_BYTES + 1),
        BASE_CONTEXT,
        ring,
      ),
  );

  // Three byte characters: the string is far shorter than the limit in code
  // units but longer than the limit in bytes.
  const multiByte = "€".repeat(5462);
  assertEquals(
    multiByte.length < INTEGRATION_CREDENTIAL_MAX_PLAINTEXT_BYTES,
    true,
  );
  await expectCredentialError(
    "invalid_plaintext",
    () => encryptIntegrationCredential(multiByte, BASE_CONTEXT, ring),
  );

  // The exact ceiling is accepted and round trips.
  const atLimit = "a".repeat(INTEGRATION_CREDENTIAL_MAX_PLAINTEXT_BYTES);
  const envelope = await encryptIntegrationCredential(
    atLimit,
    BASE_CONTEXT,
    ring,
  );
  assertEquals(
    await decryptIntegrationCredential(envelope, BASE_CONTEXT, ring),
    atLimit,
  );
});

Deno.test("never repeats the plaintext or the key in a failure message", async () => {
  const material = randomMasterKeyMaterial();
  const key = await importIntegrationMasterKey(material);
  const ring = keyring(1, key);
  const marker = "private-value-marker";

  const error = await expectCredentialError(
    "invalid_plaintext",
    () =>
      encryptIntegrationCredential(marker.repeat(20000), BASE_CONTEXT, ring),
  );
  assertEquals(error.message.includes("private-value-marker"), false);
  assertEquals(error.message.includes(material), false);
  assertEquals("cause" in error, false);
});

Deno.test("refuses to decode a payload that is not valid UTF-8 text", async () => {
  const key = await randomMasterKey();
  const ring = keyring(1, key);
  const nonce = crypto.getRandomValues(
    new Uint8Array(INTEGRATION_CREDENTIAL_NONCE_BYTES),
  );
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: buildIntegrationCredentialAad(BASE_CONTEXT),
      tagLength: 128,
    },
    key,
    new Uint8Array([0xff, 0xfe, 0xfd]),
  );
  const forged: IntegrationEncryptedCredential = {
    integration_id: BASE_CONTEXT.integrationId,
    provider: "shipa",
    environment: "sandbox",
    key_version: 1,
    nonce: encodeCanonicalBase64(nonce),
    ciphertext: encodeCanonicalBase64(new Uint8Array(encrypted)),
  };

  const error = await expectCredentialError(
    "invalid_plaintext_encoding",
    () => decryptIntegrationCredential(forged, BASE_CONTEXT, ring),
  );
  // A replacement character is never returned in place of the corrupt data.
  assertEquals(error.message.includes("\ufffd"), false);
});

Deno.test("keeps a sandbox credential away from the live context", async () => {
  const key = await randomMasterKey();
  const ring = keyring(1, key);
  const sandboxEnvelope = await encryptIntegrationCredential(
    PLAINTEXT,
    BASE_CONTEXT,
    ring,
  );
  const liveEnvelope = await encryptIntegrationCredential(
    PLAINTEXT,
    { ...BASE_CONTEXT, environment: "live" },
    ring,
  );

  assertNotEquals(sandboxEnvelope.ciphertext, liveEnvelope.ciphertext);
  assertNotEquals(sandboxEnvelope.nonce, liveEnvelope.nonce);

  await expectCredentialError(
    "context_mismatch",
    () =>
      decryptIntegrationCredential(
        sandboxEnvelope,
        { ...BASE_CONTEXT, environment: "live" },
        ring,
      ),
  );
  await expectCredentialError(
    "context_mismatch",
    () =>
      decryptIntegrationCredential(
        liveEnvelope,
        BASE_CONTEXT,
        ring,
      ),
  );
});

Deno.test("invalid injected key values cannot escape as raw runtime errors", async () => {
  await expectCredentialError(
    "invalid_key_algorithm",
    () =>
      encryptIntegrationCredential(
        "test-key",
        BASE_CONTEXT,
        new Map([[1, null]]) as unknown as IntegrationCredentialKeyring,
      ),
  );
});
