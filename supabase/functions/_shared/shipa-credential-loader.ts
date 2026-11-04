// Shipa credential loading: the read-only server path from the stored
// ciphertext to a decrypted key.
//
// The loader owns exactly two operations:
//
//   readMetadata({integrationId, environment}) -> presence and revision only
//   readSecret({integrationId, environment})   -> the decrypted API key
//
// Both take a SERVER-OWNED binding. The integration id and the environment
// are the values the server already owns; they are never taken from a
// browser body, a query string or a caller-supplied provider name. The
// provider is always `shipa`, the only provider this contract covers.
//
// What the loader deliberately does not do
// ----------------------------------------
// * No retry. One read is one read; a refused read is refused.
// * No direct table access, no settings read or save, no credential write, no
//   credential removal and no environment fallback.
// * No provider call, no HTTP call and no network of any kind.
// * No key import and no key rotation. The keyring is injected by the
//   caller, and the key version always comes from the stored envelope.
//
// The SQL wrapper returns the stored row. Supabase resolves that call as
// `{data, error}` rather than as raw JSON, so the envelope of that answer
// may also carry `status`, `count` and `statusText`; those extra properties
// never invalidate it and are ignored.
//
// The stored document has exactly four root keys: the six-field encrypted
// envelope, the credential revision, the rotation timestamp and the SQL
// owned credential fingerprint. The fingerprint is passed through as SQL
// produced it: it is never recomputed here, because a differently
// serialised JavaScript object would produce a different hash.
//
// Source of truth:
//   docs/superpowers/specs/2026-11-02-shipa-delivery-design.md (section 5)
//   docs/superpowers/plans/2026-11-02-shipa-delivery.md (task 5)
//   docs/integrations/shipa-submission-rpc-contract.md
//   docs/integrations/shipa-settings-rpc-contract.md
//
// Trust boundary: the decrypted key exists only in Edge memory. It is never
// logged, cached, persisted or returned as a public response.

import {
  type IntegrationCredentialContext,
  type IntegrationCredentialEnvironment,
  IntegrationCredentialError,
  type IntegrationEncryptedCredential,
  isIntegrationCredentialEnvironment,
  isIntegrationUuid,
  isPlainRecord,
  parseIntegrationEncryptedCredential,
} from "./integration-credential-contract.ts";
import {
  decryptIntegrationCredential,
  type IntegrationCredentialKeyring,
} from "./integration-credentials.ts";

export * from "./shipa-credential-loader-contract.ts";
import {
  type ShipaCredentialBinding,
  type ShipaCredentialLoader,
  ShipaCredentialLoaderError,
  type ShipaCredentialMetadata,
  type ShipaCredentialRpcClient,
  type ShipaCredentialSecret,
} from "./shipa-credential-loader-contract.ts";

// ---------------------------------------------------------------------------
// The loader
// ---------------------------------------------------------------------------

/**
 * Creates the read-only credential loader over an injected client and an
 * injected keyring.
 *
 * The keyring is supplied by the caller. The loader never imports a key,
 * never reads the environment and never chooses a key version of its own:
 * the version always comes from the stored envelope.
 */
export function createShipaCredentialLoader(options: {
  readonly client: ShipaCredentialRpcClient;
  readonly keyring: IntegrationCredentialKeyring;
}): ShipaCredentialLoader {
  const client = options.client;
  const keyring = options.keyring;
  return {
    async readMetadata(
      binding: ShipaCredentialBinding,
    ): Promise<ShipaCredentialMetadata> {
      const stored = await loadStoredCredential(client, keyring, binding);
      if (stored === null) {
        return {
          present: false,
          credentialRevision: null,
          credentialFingerprint: null,
        };
      }
      return {
        present: true,
        credentialRevision: stored.credentialRevision,
        credentialFingerprint: stored.credentialFingerprint,
      };
    },

    async readSecret(
      binding: ShipaCredentialBinding,
    ): Promise<ShipaCredentialSecret> {
      const stored = await loadStoredCredential(client, keyring, binding);
      if (stored === null) {
        throw new ShipaCredentialLoaderError("credential_missing");
      }
      const apiKey = await decryptStoredCredential(
        stored.envelope,
        stored.context,
        keyring,
      );
      return {
        apiKey,
        credentialRevision: stored.credentialRevision,
        credentialFingerprint: stored.credentialFingerprint,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The stored credential
// ---------------------------------------------------------------------------

/** A validated stored credential. */
interface StoredCredential {
  /** The validated encrypted envelope. */
  readonly envelope: IntegrationEncryptedCredential;
  /** The context the envelope must be decrypted with. */
  readonly context: IntegrationCredentialContext;
  /** The SQL-owned credential revision. */
  readonly credentialRevision: number;
  /** The SQL-owned credential fingerprint, passed through unchanged. */
  readonly credentialFingerprint: string;
}

/**
 * Reads and validates the stored credential of one binding.
 *
 * A null document means the credential is absent; every other defect is a
 * closed failure. The envelope identity is checked against the requested
 * binding before anything is reported as present, and the key version of the
 * envelope must exist in the injected keyring before the credential counts
 * as readable.
 */
async function loadStoredCredential(
  client: ShipaCredentialRpcClient,
  keyring: IntegrationCredentialKeyring,
  binding: ShipaCredentialBinding,
): Promise<StoredCredential | null> {
  const integrationId = requireIntegrationId(binding?.integrationId);
  const environment = requireEnvironment(binding?.environment);

  const data = await callReadCredential(client, integrationId, environment);
  if (data === null) return null;

  const document = parseCredentialDocument(data);

  if (
    document.envelope.integration_id !== integrationId ||
    document.envelope.provider !== "shipa" ||
    document.envelope.environment !== environment
  ) {
    // The stored row belongs to another binding. It is never reported as
    // this binding's credential, present or otherwise.
    throw new ShipaCredentialLoaderError("context_mismatch");
  }

  if (!keyringHasVersion(keyring, document.envelope.key_version)) {
    // The envelope names a key version this deployment does not hold. No
    // other version is used as a fallback.
    throw new ShipaCredentialLoaderError("unknown_key_version");
  }

  return {
    envelope: document.envelope,
    context: {
      integrationId,
      provider: "shipa",
      environment,
      keyVersion: document.envelope.key_version,
    },
    credentialRevision: document.credentialRevision,
    credentialFingerprint: document.credentialFingerprint,
  };
}

/**
 * Performs the single credential read.
 *
 * The promise is awaited once. A rejected promise and a resolved SQL error
 * both become a fixed failure; the upstream error is classified by its code
 * only and is never returned, attached or logged.
 */
async function callReadCredential(
  client: ShipaCredentialRpcClient,
  integrationId: string,
  environment: IntegrationCredentialEnvironment,
): Promise<unknown> {
  const outcome = await settle(() =>
    client.rpc("shipa_read_credential", {
      _integration_id: integrationId,
      _environment: environment,
    })
  );
  if (!outcome.ok) {
    throw mapCredentialSqlError(outcome.error);
  }
  return unwrapCredentialResponse(outcome.value);
}

/**
 * Unwraps the resolved SDK answer.
 *
 * Supabase resolves `{data, error}` rather than raw JSON, so the envelope of
 * that answer may also carry `status`, `count` and `statusText`. Those extra
 * properties are ignored: they never invalidate the answer.
 */
function unwrapCredentialResponse(response: unknown): unknown {
  if (
    !isPlainRecord(response) ||
    !Object.hasOwn(response, "data") ||
    !Object.hasOwn(response, "error")
  ) {
    throw new ShipaCredentialLoaderError("invalid_response");
  }
  if (response["error"] !== null && response["error"] !== undefined) {
    throw mapCredentialSqlError(response["error"]);
  }
  return response["data"];
}

/**
 * The closed result of one awaited database call.
 */
type Settled<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

/**
 * Awaits one database call and turns a rejection into a value, so a
 * transport failure is classified instead of escaping as an unhandled
 * rejection. The rejected error is never returned to the caller.
 */
async function settle<T>(
  action: () => PromiseLike<T>,
): Promise<Settled<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Maps a database failure to a closed code.
 *
 * Only the SQLSTATE code is read. The message, the details, the hint and the
 * cause are never inspected, never returned and never attached.
 */
function mapCredentialSqlError(error: unknown): ShipaCredentialLoaderError {
  if (isPlainRecord(error)) {
    const code = error["code"];
    if (typeof code === "string" && code.trim() === "PGRST202") {
      return new ShipaCredentialLoaderError("upgrade_required");
    }
  }
  return new ShipaCredentialLoaderError("unavailable");
}

// ---------------------------------------------------------------------------
// The stored document
// ---------------------------------------------------------------------------

/** The exact field set of the stored document. */
const DOCUMENT_FIELDS: readonly string[] = [
  "envelope",
  "credential_revision",
  "rotated_at",
  "credential_fingerprint",
];

/** The largest credential revision SQL can hold. */
const MAX_CREDENTIAL_REVISION = 2147483647;

/** The fingerprint is exactly sixty-four lowercase hexadecimal characters. */
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

/** A rotation timestamp is short and bounded. */
const MAX_ROTATED_AT_LENGTH = 64;

/**
 * A SQL timestamp as JSON text.
 *
 * The value is validated but never used as authority and never exposed: it
 * says when the row was rotated, not what may be done with it.
 */
const SQL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

/** A validated stored document. */
interface CredentialDocument {
  readonly envelope: IntegrationEncryptedCredential;
  readonly credentialRevision: number;
  readonly credentialFingerprint: string;
}

/**
 * Parses the stored document strictly.
 *
 * The document must be a plain object with exactly the four known keys. An
 * unknown field, a missing field, a malformed envelope, an unusable
 * revision, an unusable rotation timestamp and an unusable fingerprint are
 * all refused before anything is mapped.
 */
function parseCredentialDocument(raw: unknown): CredentialDocument {
  if (!isPlainRecord(raw)) {
    throw new ShipaCredentialLoaderError("invalid_response");
  }
  if (!hasExactKeys(raw, DOCUMENT_FIELDS)) {
    throw new ShipaCredentialLoaderError("invalid_response");
  }

  const envelope = parseStoredEnvelope(raw["envelope"]);
  const credentialRevision = requireCredentialRevision(
    raw["credential_revision"],
  );
  requireRotatedAt(raw["rotated_at"]);
  const credentialFingerprint = requireCredentialFingerprint(
    raw["credential_fingerprint"],
  );

  return { envelope, credentialRevision, credentialFingerprint };
}

/**
 * Parses the encrypted envelope with the shared strict parser, so the
 * envelope schema stays in one place.
 */
function parseStoredEnvelope(raw: unknown): IntegrationEncryptedCredential {
  try {
    return parseIntegrationEncryptedCredential(raw);
  } catch {
    // The rejected value is never repeated.
    throw new ShipaCredentialLoaderError("invalid_response");
  }
}

/** Requires a positive safe SQL integer revision. */
function requireCredentialRevision(raw: unknown): number {
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < 1 ||
    raw > MAX_CREDENTIAL_REVISION
  ) {
    throw new ShipaCredentialLoaderError("invalid_response");
  }
  return raw;
}

/** Requires a bounded, nonempty SQL timestamp. */
function requireRotatedAt(raw: unknown): void {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > MAX_ROTATED_AT_LENGTH ||
    !SQL_TIMESTAMP_PATTERN.test(raw)
  ) {
    throw new ShipaCredentialLoaderError("invalid_response");
  }
}

/** Requires exactly sixty-four lowercase hexadecimal characters. */
function requireCredentialFingerprint(raw: unknown): string {
  if (typeof raw !== "string" || !FINGERPRINT_PATTERN.test(raw)) {
    throw new ShipaCredentialLoaderError("invalid_response");
  }
  return raw;
}

function hasExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const present = Object.keys(record);
  if (present.length !== keys.length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Binding and decryption
// ---------------------------------------------------------------------------

/** Requires a real integration UUID. */
function requireIntegrationId(raw: unknown): string {
  if (!isIntegrationUuid(raw)) {
    throw new ShipaCredentialLoaderError("invalid_binding");
  }
  return raw.toLowerCase();
}

/** Requires a known environment. */
function requireEnvironment(
  raw: unknown,
): IntegrationCredentialEnvironment {
  if (!isIntegrationCredentialEnvironment(raw)) {
    throw new ShipaCredentialLoaderError("invalid_binding");
  }
  return raw;
}

/**
 * Reports whether the injected keyring holds a key for exactly this version.
 *
 * The lookup mirrors the crypto module's own resolution, so the loader and
 * the decryptor never disagree about which versions exist. A missing version
 * is refused; no other version is ever used instead.
 */
function keyringHasVersion(
  keyring: IntegrationCredentialKeyring,
  keyVersion: number,
): boolean {
  return keyring.get(keyVersion) !== undefined;
}

/**
 * Decrypts the stored envelope with the real crypto primitives.
 *
 * The additional data is the shared V1 tuple, which binds the integration
 * id, the provider, the environment and the key version. The credential
 * revision and the settings revision are metadata and never enter it.
 */
async function decryptStoredCredential(
  envelope: IntegrationEncryptedCredential,
  context: IntegrationCredentialContext,
  keyring: IntegrationCredentialKeyring,
): Promise<string> {
  try {
    return await decryptIntegrationCredential(envelope, context, keyring);
  } catch (error) {
    throw mapCredentialCryptoError(error);
  }
}

/** Maps a crypto failure to a closed loader code. */
function mapCredentialCryptoError(
  error: unknown,
): ShipaCredentialLoaderError {
  if (error instanceof IntegrationCredentialError) {
    if (error.code === "unknown_key_version") {
      return new ShipaCredentialLoaderError("unknown_key_version");
    }
    if (error.code === "context_mismatch") {
      return new ShipaCredentialLoaderError("context_mismatch");
    }
    if (error.code === "invalid_context") {
      return new ShipaCredentialLoaderError("invalid_binding");
    }
    if (error.code === "invalid_envelope") {
      return new ShipaCredentialLoaderError("invalid_response");
    }
    if (
      error.code === "decryption_failed" ||
      error.code === "invalid_plaintext" ||
      error.code === "invalid_plaintext_encoding"
    ) {
      return new ShipaCredentialLoaderError("decryption_failed");
    }
  }
  // An unusable injected key is an operator problem, not a caller error.
  return new ShipaCredentialLoaderError("unavailable");
}
