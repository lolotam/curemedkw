// Behavioural tests for the integration credential contract: canonical
// base64, the field guards, the fixed additional-data tuple and the strict
// envelope parser.
//
// No secret, no key and no environment is used here. The tests only prove
// the public rules of the contract module.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";

import {
  buildIntegrationCredentialAad,
  decodeCanonicalBase64,
  encodeCanonicalBase64,
  INTEGRATION_CREDENTIAL_ERROR_MESSAGES,
  INTEGRATION_CREDENTIAL_FORMAT_VERSION,
  INTEGRATION_CREDENTIAL_MAX_CIPHERTEXT_BYTES,
  INTEGRATION_CREDENTIAL_MIN_CIPHERTEXT_BYTES,
  INTEGRATION_CREDENTIAL_NONCE_BYTES,
  type IntegrationCredentialContext,
  IntegrationCredentialError,
  type IntegrationCredentialErrorCode,
  type IntegrationEncryptedCredential,
  isIntegrationKeyVersion,
  isIntegrationUuid,
  normalizeIntegrationCredentialContext,
  parseIntegrationEncryptedCredential,
} from "../../_shared/integration-credential-contract.ts";

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const INTEGRATION_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const OTHER_INTEGRATION_ID = "9c858901-8a57-4791-81fe-4c455b099bc9";

const BASE_CONTEXT: IntegrationCredentialContext = {
  integrationId: INTEGRATION_ID,
  provider: "shipa",
  environment: "sandbox",
  keyVersion: 1,
};

/**
 * Builds a canonical base64 string and then breaks its canonicality by
 * setting bits that no output byte uses. Only a padded value can carry such
 * bits, so the helper is used with a payload that ends in a partial group.
 */
function makeNonCanonicalBase64(bytes: Uint8Array): string {
  const canonical = encodeCanonicalBase64(bytes);
  const padIndex = canonical.indexOf("=");
  const lastDataIndex = padIndex === -1 ? canonical.length - 1 : padIndex - 1;
  const value = BASE64_ALPHABET.indexOf(canonical.charAt(lastDataIndex));
  const replacement = BASE64_ALPHABET.charAt(
    value + 1 <= BASE64_ALPHABET.length - 1 ? value + 1 : value - 1,
  );
  return canonical.slice(0, lastDataIndex) + replacement +
    canonical.slice(lastDataIndex + 1);
}

function validEnvelope(): IntegrationEncryptedCredential {
  return {
    integration_id: INTEGRATION_ID,
    provider: "shipa",
    environment: "sandbox",
    key_version: 1,
    nonce: encodeCanonicalBase64(
      new Uint8Array(INTEGRATION_CREDENTIAL_NONCE_BYTES),
    ),
    ciphertext: encodeCanonicalBase64(
      new Uint8Array(INTEGRATION_CREDENTIAL_MIN_CIPHERTEXT_BYTES),
    ),
  };
}

function expectError(
  code: IntegrationCredentialErrorCode,
  action: () => unknown,
): IntegrationCredentialError {
  const error = assertThrows(action, IntegrationCredentialError);
  assertEquals(error.code, code);
  assertEquals(error.message, INTEGRATION_CREDENTIAL_ERROR_MESSAGES[code]);
  return error;
}

Deno.test("decodes canonical standard base64", () => {
  const decoded = decodeCanonicalBase64("aGVsbG8=");
  assert(decoded !== null);
  assertEquals(Array.from(decoded), [104, 101, 108, 108, 111]);
  const empty = decodeCanonicalBase64("");
  assert(empty !== null);
  assertEquals(empty.length, 0);
});

Deno.test("refuses every non canonical base64 form", () => {
  // Missing padding.
  assertEquals(decodeCanonicalBase64("aGVsbG8"), null);
  // A length that is not a multiple of four.
  assertEquals(decodeCanonicalBase64("aGVsbG8=a"), null);
  // Whitespace.
  assertEquals(decodeCanonicalBase64("aGVsbG8= "), null);
  assertEquals(decodeCanonicalBase64(" aGVsbG8="), null);
  // A line break in the middle.
  assertEquals(decodeCanonicalBase64("aGVs\nbG8="), null);
  // Base64url characters.
  assertEquals(decodeCanonicalBase64("a-_sbG8="), null);
  // A pad in the wrong place.
  assertEquals(decodeCanonicalBase64("aG=sbG8="), null);
  assertEquals(decodeCanonicalBase64("===="), null);
  // More than two pads.
  assertEquals(decodeCanonicalBase64("aGVs===="), null);
  // Bits that no output byte uses.
  assertEquals(
    decodeCanonicalBase64(makeNonCanonicalBase64(new Uint8Array(17))),
    null,
  );
});

Deno.test("encodes canonical base64 that decodes back to the same bytes", () => {
  for (const length of [0, 1, 2, 3, 4, 11, 12, 13, 17, 32, 33, 64]) {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = (index * 37 + 11) % 256;
    }
    const encoded = encodeCanonicalBase64(bytes);
    assertEquals(encoded.length % 4, 0);
    const decoded = decodeCanonicalBase64(encoded);
    assert(decoded !== null);
    assertEquals(Array.from(decoded), Array.from(bytes));
  }
});

Deno.test("accepts only a real uuid syntax for an integration id", () => {
  assertEquals(isIntegrationUuid(INTEGRATION_ID), true);
  assertEquals(isIntegrationUuid(OTHER_INTEGRATION_ID), true);
  assertEquals(isIntegrationUuid("3f2504e04f8941d39a0c0305e82c3301"), false);
  assertEquals(isIntegrationUuid("3f2504e0-4f89-41d3-9a0c-0305e82c330"), false);
  assertEquals(
    isIntegrationUuid("3f2504e0-4f89-41d3-9a0c-0305e82c33011"),
    false,
  );
  assertEquals(
    isIntegrationUuid("3f2504e0-4f89-41d3-9a0c-0305e82c330z"),
    false,
  );
  assertEquals(
    isIntegrationUuid("{3f2504e0-4f89-41d3-9a0c-0305e82c3301}"),
    false,
  );
  assertEquals(isIntegrationUuid(""), false);
  assertEquals(isIntegrationUuid(42), false);
  assertEquals(isIntegrationUuid(null), false);
});

Deno.test("accepts only safe positive integer key versions", () => {
  assertEquals(isIntegrationKeyVersion(1), true);
  assertEquals(isIntegrationKeyVersion(2), true);
  assertEquals(isIntegrationKeyVersion(0), false);
  assertEquals(isIntegrationKeyVersion(-1), false);
  assertEquals(isIntegrationKeyVersion(1.5), false);
  assertEquals(isIntegrationKeyVersion(Number.NaN), false);
  assertEquals(isIntegrationKeyVersion(Number.POSITIVE_INFINITY), false);
  assertEquals(isIntegrationKeyVersion(Number.MAX_SAFE_INTEGER + 2), false);
  assertEquals(isIntegrationKeyVersion("1"), false);
});

Deno.test("normalises a context and lowercases the integration id", () => {
  const normalized = normalizeIntegrationCredentialContext({
    integrationId: INTEGRATION_ID.toUpperCase(),
    provider: "shipa",
    environment: "live",
    keyVersion: 3,
  });
  assertEquals(normalized.integrationId, INTEGRATION_ID);
  assertEquals(normalized.provider, "shipa");
  assertEquals(normalized.environment, "live");
  assertEquals(normalized.keyVersion, 3);
});

Deno.test("refuses a context that is not in the closed vocabulary", () => {
  expectError("invalid_context", () =>
    normalizeIntegrationCredentialContext({
      ...BASE_CONTEXT,
      integrationId: "not-a-uuid",
    }));
  expectError("invalid_context", () =>
    normalizeIntegrationCredentialContext({
      ...BASE_CONTEXT,
      provider: "other" as unknown as "shipa",
    }));
  expectError("invalid_context", () =>
    normalizeIntegrationCredentialContext({
      ...BASE_CONTEXT,
      environment: "staging" as unknown as "sandbox",
    }));
  expectError("invalid_context", () =>
    normalizeIntegrationCredentialContext({
      ...BASE_CONTEXT,
      keyVersion: 0,
    }));
  expectError("invalid_context", () =>
    normalizeIntegrationCredentialContext(
      null as unknown as IntegrationCredentialContext,
    ));
});

Deno.test("builds the fixed V1 additional data tuple", () => {
  const aad = buildIntegrationCredentialAad(BASE_CONTEXT);
  const expectedJson =
    `[${INTEGRATION_CREDENTIAL_FORMAT_VERSION},"${INTEGRATION_ID}","shipa","sandbox",1]`;
  assertEquals(new TextDecoder().decode(aad), expectedJson);
  assertEquals(
    Array.from(aad),
    Array.from(new TextEncoder().encode(expectedJson)),
  );
});

Deno.test("keeps the additional data tuple in a fixed order and lower case", () => {
  const upper = buildIntegrationCredentialAad({
    ...BASE_CONTEXT,
    integrationId: INTEGRATION_ID.toUpperCase(),
  });
  const lower = buildIntegrationCredentialAad(BASE_CONTEXT);
  assertEquals(Array.from(upper), Array.from(lower));

  const live = buildIntegrationCredentialAad({
    ...BASE_CONTEXT,
    environment: "live",
  });
  assertEquals(
    new TextDecoder().decode(live),
    `[${INTEGRATION_CREDENTIAL_FORMAT_VERSION},"${INTEGRATION_ID}","shipa","live",1]`,
  );
});

Deno.test("keeps the settings revision out of the additional data", () => {
  // A context carries no revision field, so no revision can reach the
  // additional data. The envelope is proven to have exactly six fields.
  const envelope = validEnvelope();
  assertEquals(Object.keys(envelope).sort(), [
    "ciphertext",
    "environment",
    "integration_id",
    "key_version",
    "nonce",
    "provider",
  ]);
  assertEquals(
    Object.keys(envelope).includes("credential_revision"),
    false,
  );
});

Deno.test("parses a valid envelope", () => {
  const envelope = validEnvelope();
  const parsed = parseIntegrationEncryptedCredential(envelope);
  assertEquals(parsed.integration_id, INTEGRATION_ID);
  assertEquals(parsed.provider, "shipa");
  assertEquals(parsed.environment, "sandbox");
  assertEquals(parsed.key_version, 1);
  assertEquals(parsed.nonce, envelope.nonce);
  assertEquals(parsed.ciphertext, envelope.ciphertext);
});

Deno.test("refuses an envelope with an unknown or missing field", () => {
  const envelope = validEnvelope();
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      credential_revision: 4,
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      integrationId: INTEGRATION_ID,
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      integration_id: envelope.integration_id,
      provider: envelope.provider,
      environment: envelope.environment,
      key_version: envelope.key_version,
      nonce: envelope.nonce,
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      nonce: undefined,
    }));
});

Deno.test("refuses an envelope that is not a plain object", () => {
  expectError(
    "invalid_envelope",
    () => parseIntegrationEncryptedCredential(null),
  );
  expectError(
    "invalid_envelope",
    () => parseIntegrationEncryptedCredential(undefined),
  );
  expectError(
    "invalid_envelope",
    () => parseIntegrationEncryptedCredential("not-an-envelope"),
  );
  expectError(
    "invalid_envelope",
    () => parseIntegrationEncryptedCredential([validEnvelope()]),
  );
});

Deno.test("refuses a malformed identity inside an envelope", () => {
  const envelope = validEnvelope();
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      integration_id: "3f2504e0-4f89-41d3-9a0c-0305e82c330z",
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      provider: "other",
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      environment: "staging",
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      key_version: 0,
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      key_version: 1.5,
    }));
});

Deno.test("refuses a nonce that is not canonical base64 of 96 bits", () => {
  const envelope = validEnvelope();
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      nonce: encodeCanonicalBase64(new Uint8Array(11)),
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      nonce: encodeCanonicalBase64(new Uint8Array(13)),
    }));
  // A length that is not a multiple of four.
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      nonce: encodeCanonicalBase64(
        new Uint8Array(INTEGRATION_CREDENTIAL_NONCE_BYTES),
      ).slice(0, 15),
    }));
  // A character outside the standard alphabet.
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      nonce: encodeCanonicalBase64(
        new Uint8Array(INTEGRATION_CREDENTIAL_NONCE_BYTES),
      ).slice(0, 15) + "-",
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      nonce: "not base64 at all",
    }));
});

Deno.test("refuses a ciphertext outside the accepted size window", () => {
  const envelope = validEnvelope();
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      ciphertext: encodeCanonicalBase64(new Uint8Array(0)),
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      ciphertext: encodeCanonicalBase64(new Uint8Array(16)),
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      ciphertext: encodeCanonicalBase64(
        new Uint8Array(INTEGRATION_CREDENTIAL_MAX_CIPHERTEXT_BYTES + 1),
      ),
    }));
  expectError("invalid_envelope", () =>
    parseIntegrationEncryptedCredential({
      ...envelope,
      ciphertext: makeNonCanonicalBase64(
        new Uint8Array(INTEGRATION_CREDENTIAL_MIN_CIPHERTEXT_BYTES),
      ),
    }));
});

Deno.test("accepts a ciphertext at both ends of the size window", () => {
  const envelope = validEnvelope();
  const smallest = parseIntegrationEncryptedCredential({
    ...envelope,
    ciphertext: encodeCanonicalBase64(
      new Uint8Array(INTEGRATION_CREDENTIAL_MIN_CIPHERTEXT_BYTES),
    ),
  });
  assertEquals(
    smallest.ciphertext,
    encodeCanonicalBase64(
      new Uint8Array(INTEGRATION_CREDENTIAL_MIN_CIPHERTEXT_BYTES),
    ),
  );
  const largest = parseIntegrationEncryptedCredential({
    ...envelope,
    ciphertext: encodeCanonicalBase64(
      new Uint8Array(INTEGRATION_CREDENTIAL_MAX_CIPHERTEXT_BYTES),
    ),
  });
  assertEquals(
    largest.ciphertext,
    encodeCanonicalBase64(
      new Uint8Array(INTEGRATION_CREDENTIAL_MAX_CIPHERTEXT_BYTES),
    ),
  );
});

Deno.test("never repeats the rejected value in a failure message", () => {
  const marker = "private-value-marker";
  const error = expectError(
    "invalid_envelope",
    () =>
      parseIntegrationEncryptedCredential({
        ...validEnvelope(),
        ciphertext: marker,
      }),
  );
  assertEquals(error.message.includes(marker), false);
  assertEquals(
    error.message,
    INTEGRATION_CREDENTIAL_ERROR_MESSAGES.invalid_envelope,
  );
  assertEquals("cause" in error, false);
});

Deno.test("exposes one fixed message per closed error code", () => {
  const codes = Object.keys(INTEGRATION_CREDENTIAL_ERROR_MESSAGES);
  assertEquals(codes.length > 0, true);
  for (const code of codes) {
    const message = INTEGRATION_CREDENTIAL_ERROR_MESSAGES[
      code as IntegrationCredentialErrorCode
    ];
    assertEquals(typeof message, "string");
    assertEquals(message.length > 0, true);
  }
  // The same code always produces the same message, whatever was rejected.
  const first = expectError(
    "invalid_envelope",
    () => parseIntegrationEncryptedCredential({ nonce: "first-marker" }),
  );
  const second = expectError(
    "invalid_envelope",
    () => parseIntegrationEncryptedCredential({ nonce: "second-marker" }),
  );
  assertEquals(first.message, second.message);
});

Deno.test("rejects a trailing newline in an integration identity", () => {
  assertEquals(isIntegrationUuid(`${INTEGRATION_ID}\n`), false);
  expectError(
    "invalid_context",
    () =>
      normalizeIntegrationCredentialContext({
        ...BASE_CONTEXT,
        integrationId: `${INTEGRATION_ID}\n`,
      }),
  );
});
