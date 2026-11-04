// Server-only integration credential contract: shapes, closed failures, the
// fixed V1 additional-data format, canonical base64 handling and the strict
// envelope parser.
//
// This module holds no cryptography, no I/O, no environment access and no
// logging. It owns the vocabulary that the crypto module and the future store
// layer share, so the stored envelope cannot drift between the writer and the
// reader.
//
// Source of truth:
//   docs/superpowers/specs/2026-11-02-shipa-delivery-design.md (section 5)
//   docs/superpowers/plans/2026-11-02-shipa-delivery.md (task 5)
//
// Trust boundary: no secret is handled here. The master key is imported by
// the crypto module and travels as a `CryptoKey`; only public metadata
// crosses this module.

/** The only provider this contract covers in V1. */
export const INTEGRATION_CREDENTIAL_PROVIDERS = ["shipa"] as const;
export type IntegrationCredentialProvider =
  (typeof INTEGRATION_CREDENTIAL_PROVIDERS)[number];

/** The environments Curemed keeps separate for one provider. */
export const INTEGRATION_CREDENTIAL_ENVIRONMENTS = ["sandbox", "live"] as const;
export type IntegrationCredentialEnvironment =
  (typeof INTEGRATION_CREDENTIAL_ENVIRONMENTS)[number];

/**
 * The fixed additional-data format version. It is part of the authenticated
 * tuple, so a future format must use a new number rather than a new shape.
 */
export const INTEGRATION_CREDENTIAL_FORMAT_VERSION = 1;

/** The AES-256 master key length in bytes. */
export const INTEGRATION_MASTER_KEY_BYTES = 32;

/** The AES-GCM nonce length in bytes (96 bits). */
export const INTEGRATION_CREDENTIAL_NONCE_BYTES = 12;

/** The AES-GCM authentication tag length in bytes (128 bits). */
export const INTEGRATION_CREDENTIAL_TAG_BYTES = 16;

/** The largest accepted plaintext, measured in UTF-8 bytes. */
export const INTEGRATION_CREDENTIAL_MAX_PLAINTEXT_BYTES = 16 * 1024;

/** The smallest accepted ciphertext: one plaintext byte plus the tag. */
export const INTEGRATION_CREDENTIAL_MIN_CIPHERTEXT_BYTES =
  INTEGRATION_CREDENTIAL_TAG_BYTES + 1;

/** The largest accepted ciphertext: the plaintext ceiling plus the tag. */
export const INTEGRATION_CREDENTIAL_MAX_CIPHERTEXT_BYTES =
  INTEGRATION_CREDENTIAL_MAX_PLAINTEXT_BYTES + INTEGRATION_CREDENTIAL_TAG_BYTES;

// --- Shapes -----------------------------------------------------------------

/**
 * The identity a credential is bound to. It is public metadata: it never
 * contains the credential itself and it is safe to store next to it.
 */
export interface IntegrationCredentialContext {
  /** The integration row id, a real UUID. */
  readonly integrationId: string;
  /** The provider the credential belongs to. */
  readonly provider: IntegrationCredentialProvider;
  /** The environment the credential belongs to. */
  readonly environment: IntegrationCredentialEnvironment;
  /** The master key version used to encrypt the credential. */
  readonly keyVersion: number;
}

/**
 * The stored envelope. The field names are the exact snake_case column names,
 * so the object can be handed to the storage layer unchanged.
 *
 * The envelope carries ciphertext only. There is no plaintext field, no
 * revision field and no settings field: editing a template or a settings
 * revision must never change what a stored credential decrypts to.
 */
export interface IntegrationEncryptedCredential {
  readonly integration_id: string;
  readonly provider: IntegrationCredentialProvider;
  readonly environment: IntegrationCredentialEnvironment;
  readonly key_version: number;
  /** Canonical standard base64 of the 96-bit nonce. */
  readonly nonce: string;
  /** Canonical standard base64 of the ciphertext with its 128-bit tag. */
  readonly ciphertext: string;
}

// --- Closed failures --------------------------------------------------------

/**
 * The closed set of failures this contract can report. Nothing outside this
 * list is ever produced, and a code never carries a value: the message is
 * fixed text and never contains an input, a secret, a key or a provider
 * response.
 */
export type IntegrationCredentialErrorCode =
  | "invalid_master_key_encoding"
  | "invalid_master_key_length"
  | "invalid_key_algorithm"
  | "invalid_key_usage"
  | "invalid_key_extractable"
  | "invalid_context"
  | "invalid_plaintext"
  | "unknown_key_version"
  | "invalid_envelope"
  | "context_mismatch"
  | "encryption_failed"
  | "decryption_failed"
  | "invalid_plaintext_encoding";

/**
 * The fixed message for every code. The mapping is exported so a caller can
 * map a code to a transport status without re-deriving the text, and so a
 * test can prove that a message never interpolates an input.
 */
export const INTEGRATION_CREDENTIAL_ERROR_MESSAGES: Readonly<
  Record<IntegrationCredentialErrorCode, string>
> = {
  invalid_master_key_encoding:
    "The integration master key is not canonical standard base64.",
  invalid_master_key_length:
    "The integration master key must decode to exactly 32 bytes.",
  invalid_key_algorithm: "The integration key must be a 256-bit AES-GCM key.",
  invalid_key_usage:
    "The integration key must allow both encryption and decryption.",
  invalid_key_extractable: "The integration key must not be extractable.",
  invalid_context: "The integration credential context is not valid.",
  invalid_plaintext:
    "The integration credential plaintext is empty or too large.",
  unknown_key_version:
    "No integration key is available for the requested key version.",
  invalid_envelope: "The integration credential envelope is not valid.",
  context_mismatch:
    "The integration credential envelope does not match the expected context.",
  encryption_failed: "The integration credential could not be encrypted.",
  decryption_failed: "The integration credential could not be decrypted.",
  invalid_plaintext_encoding:
    "The integration credential plaintext is not valid UTF-8 text.",
};

/**
 * The single failure type of this contract.
 *
 * The original cause is deliberately dropped: a crypto exception can quote
 * input material, and a rejected envelope can quote the rejected value. The
 * code carries the meaning and the message stays fixed.
 */
export class IntegrationCredentialError extends Error {
  readonly code: IntegrationCredentialErrorCode;

  constructor(code: IntegrationCredentialErrorCode) {
    super(INTEGRATION_CREDENTIAL_ERROR_MESSAGES[code]);
    this.name = "IntegrationCredentialError";
    this.code = code;
  }
}

// --- Canonical base64 -------------------------------------------------------

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const BASE64_VALUES: ReadonlyMap<string, number> = (() => {
  const values = new Map<string, number>();
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    values.set(BASE64_ALPHABET.charAt(index), index);
  }
  return values;
})();

/**
 * Decodes standard, padded, canonical base64.
 *
 * Every deviation is refused instead of repaired: a length that is not a
 * multiple of four, whitespace, an unknown character, a misplaced pad, more
 * than two pads and trailing bits that no output byte uses. A value that
 * decodes and re-encodes to a different string is not canonical either.
 */
export function decodeCanonicalBase64(
  value: string,
): Uint8Array<ArrayBuffer> | null {
  if (typeof value !== "string" || value.length % 4 !== 0) return null;
  const groups = value.length / 4;
  const bytes = new Uint8Array(groups * 3);
  let written = 0;
  for (let group = 0; group < groups; group += 1) {
    const isLastGroup = group === groups - 1;
    const symbols: number[] = [];
    let padding = 0;
    for (let position = 0; position < 4; position += 1) {
      const character = value.charAt(group * 4 + position);
      if (character === "=") {
        if (!isLastGroup || position < 2) return null;
        padding += 1;
        if (padding > 2) return null;
        symbols.push(-1);
        continue;
      }
      if (padding > 0) return null;
      const symbol = BASE64_VALUES.get(character);
      if (symbol === undefined) return null;
      symbols.push(symbol);
    }
    const [first, second, third, fourth] = symbols;
    bytes[written] = (first << 2) | (second >> 4);
    written += 1;
    if (fourth === -1) {
      if (third === -1) {
        // Two pads: one output byte, so the second symbol must not carry
        // bits that the byte does not use.
        if ((second & 0b1111) !== 0) return null;
        return bytes.subarray(0, written);
      }
      // One pad: two output bytes, so the third symbol must not carry bits
      // that the bytes do not use.
      if ((third & 0b11) !== 0) return null;
      bytes[written] = ((second & 0b1111) << 4) | (third >> 2);
      written += 1;
      return bytes.subarray(0, written);
    }
    bytes[written] = ((second & 0b1111) << 4) | (third >> 2);
    written += 1;
    bytes[written] = ((third & 0b11) << 6) | fourth;
    written += 1;
  }
  return bytes.subarray(0, written);
}

/** Encodes bytes as standard, padded, canonical base64. */
export function encodeCanonicalBase64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    output += BASE64_ALPHABET.charAt(first >> 2);
    output += BASE64_ALPHABET.charAt(((first & 0b11) << 4) | (second >> 4));
    if (index + 1 < bytes.length) {
      output += BASE64_ALPHABET.charAt(((second & 0b1111) << 2) | (third >> 6));
    } else {
      output += "=";
    }
    if (index + 2 < bytes.length) {
      output += BASE64_ALPHABET.charAt(third & 0b111111);
    } else {
      output += "=";
    }
  }
  return output;
}

// --- Field validation -------------------------------------------------------

const INTEGRATION_UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** True for a real UUID in the 8-4-4-4-12 hexadecimal syntax. */
export function isIntegrationUuid(value: unknown): value is string {
  return typeof value === "string" && INTEGRATION_UUID_PATTERN.test(value);
}

/** True for a provider this contract knows. */
export function isIntegrationCredentialProvider(
  value: unknown,
): value is IntegrationCredentialProvider {
  return typeof value === "string" &&
    (INTEGRATION_CREDENTIAL_PROVIDERS as readonly string[]).includes(value);
}

/** True for an environment this contract knows. */
export function isIntegrationCredentialEnvironment(
  value: unknown,
): value is IntegrationCredentialEnvironment {
  return typeof value === "string" &&
    (INTEGRATION_CREDENTIAL_ENVIRONMENTS as readonly string[]).includes(value);
}

/** True for a safe positive integer key version. */
export function isIntegrationKeyVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/** True for a plain object that can carry named fields. */
export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- Context ----------------------------------------------------------------

/**
 * Validates a context and returns its canonical form.
 *
 * The integration id is lowercased so the same integration always produces
 * the same additional data. Every other field is checked against the closed
 * vocabulary: an unknown provider, an unknown environment, a malformed UUID
 * or a key version that is not a safe positive integer is refused.
 */
export function normalizeIntegrationCredentialContext(
  context: IntegrationCredentialContext,
): IntegrationCredentialContext {
  return readContext(context as unknown);
}

function readContext(value: unknown): IntegrationCredentialContext {
  if (!isPlainRecord(value)) {
    throw new IntegrationCredentialError("invalid_context");
  }
  const integrationId = value["integrationId"];
  const provider = value["provider"];
  const environment = value["environment"];
  const keyVersion = value["keyVersion"];
  if (!isIntegrationUuid(integrationId)) {
    throw new IntegrationCredentialError("invalid_context");
  }
  if (!isIntegrationCredentialProvider(provider)) {
    throw new IntegrationCredentialError("invalid_context");
  }
  if (!isIntegrationCredentialEnvironment(environment)) {
    throw new IntegrationCredentialError("invalid_context");
  }
  if (!isIntegrationKeyVersion(keyVersion)) {
    throw new IntegrationCredentialError("invalid_context");
  }
  return {
    integrationId: integrationId.toLowerCase(),
    provider,
    environment,
    keyVersion,
  };
}

// --- Additional data --------------------------------------------------------

/**
 * Builds the additional authenticated data of the V1 format.
 *
 * The bytes are the UTF-8 encoding of
 * `JSON.stringify([1, integrationId, provider, environment, keyVersion])`.
 * The tuple order is fixed by the format and is not an object, so the
 * property order of a context can never change the result.
 *
 * The tuple deliberately contains no settings revision and no credential
 * revision: editing a template, a settings row or a revision counter must
 * never make a stored credential undecryptable.
 */
export function buildIntegrationCredentialAad(
  context: IntegrationCredentialContext,
): Uint8Array<ArrayBuffer> {
  const normalized = normalizeIntegrationCredentialContext(context);
  const tuple: readonly [
    number,
    string,
    IntegrationCredentialProvider,
    IntegrationCredentialEnvironment,
    number,
  ] = [
    INTEGRATION_CREDENTIAL_FORMAT_VERSION,
    normalized.integrationId,
    normalized.provider,
    normalized.environment,
    normalized.keyVersion,
  ];
  return new TextEncoder().encode(JSON.stringify(tuple));
}

// --- Envelope ---------------------------------------------------------------

/** The exact field set of a stored envelope. */
const ENVELOPE_FIELDS: readonly string[] = [
  "integration_id",
  "provider",
  "environment",
  "key_version",
  "nonce",
  "ciphertext",
];

/**
 * Parses a stored envelope strictly.
 *
 * The row must be a plain object with exactly the six known fields: an
 * unknown field, a missing field, a malformed UUID, an unknown provider, an
 * unknown environment, an unsafe key version, a nonce that is not canonical
 * base64 of 96 bits, a ciphertext that is not canonical base64 or a
 * ciphertext outside the accepted size window is refused.
 */
export function parseIntegrationEncryptedCredential(
  row: unknown,
): IntegrationEncryptedCredential {
  if (!isPlainRecord(row)) {
    throw new IntegrationCredentialError("invalid_envelope");
  }
  const present = Object.keys(row);
  if (present.length !== ENVELOPE_FIELDS.length) {
    throw new IntegrationCredentialError("invalid_envelope");
  }
  for (const field of ENVELOPE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(row, field)) {
      throw new IntegrationCredentialError("invalid_envelope");
    }
  }

  const integrationId = row["integration_id"];
  const provider = row["provider"];
  const environment = row["environment"];
  const keyVersion = row["key_version"];
  const nonce = row["nonce"];
  const ciphertext = row["ciphertext"];

  if (!isIntegrationUuid(integrationId)) {
    throw new IntegrationCredentialError("invalid_envelope");
  }
  if (!isIntegrationCredentialProvider(provider)) {
    throw new IntegrationCredentialError("invalid_envelope");
  }
  if (!isIntegrationCredentialEnvironment(environment)) {
    throw new IntegrationCredentialError("invalid_envelope");
  }
  if (!isIntegrationKeyVersion(keyVersion)) {
    throw new IntegrationCredentialError("invalid_envelope");
  }
  if (typeof nonce !== "string" || typeof ciphertext !== "string") {
    throw new IntegrationCredentialError("invalid_envelope");
  }
  if (
    nonce.length !== 16 ||
    ciphertext.length >
      4 * Math.ceil(INTEGRATION_CREDENTIAL_MAX_CIPHERTEXT_BYTES / 3)
  ) {
    throw new IntegrationCredentialError("invalid_envelope");
  }

  const nonceBytes = decodeCanonicalBase64(nonce);
  if (
    nonceBytes === null ||
    nonceBytes.length !== INTEGRATION_CREDENTIAL_NONCE_BYTES
  ) {
    throw new IntegrationCredentialError("invalid_envelope");
  }
  const ciphertextBytes = decodeCanonicalBase64(ciphertext);
  if (ciphertextBytes === null) {
    throw new IntegrationCredentialError("invalid_envelope");
  }
  if (
    ciphertextBytes.length < INTEGRATION_CREDENTIAL_MIN_CIPHERTEXT_BYTES ||
    ciphertextBytes.length > INTEGRATION_CREDENTIAL_MAX_CIPHERTEXT_BYTES
  ) {
    throw new IntegrationCredentialError("invalid_envelope");
  }

  return {
    integration_id: integrationId.toLowerCase(),
    provider,
    environment,
    key_version: keyVersion,
    nonce,
    ciphertext,
  };
}
