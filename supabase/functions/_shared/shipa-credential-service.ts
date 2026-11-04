// Shipa credential service — the bounded credential mutation.
//
// This service owns exactly one operation:
//
//   save({actor, request}) -> the safe settings envelope the save produced
//
// What it deliberately does not do
// --------------------------------
// * No retry. A refused save is refused; nothing is re-sent and nothing is
//   re-encrypted behind the caller's back.
// * No heartbeat, no activation, no provider call, no order, no payment and no
//   scheduler. A credential change is a configuration change.
// * No direct table access. The SQL wrappers are the only writers.
// * No key import and no environment read. The keyring and the current key
//   version are injected by the caller.
// * No read of the stored secret. The service never decrypts what it stored
//   and never returns a key, a ciphertext or a nonce.
//
// Trust boundary
// --------------
// The actor is an internal, already-verified descriptor. The integration id is
// read from the server on the server: it is never taken from the request, so
// a browser can never bind a key to a row it did not mean. The keyring and
// the current master-key version are injected, so this module never reads
// `Deno.env` and never imports a key of its own.
//
// Source of truth:
//   docs/integrations/shipa-settings-rpc-contract.md
//   docs/integrations/shipa-readiness-rpc-contract.md
//   docs/superpowers/plans/2026-11-02-shipa-delivery.md (tasks 5, 6)

import {
  IntegrationCredentialError,
  type IntegrationEncryptedCredential,
  isPlainRecord,
} from "./integration-credential-contract.ts";
import {
  encryptIntegrationCredential,
  type IntegrationCredentialKeyring,
} from "./integration-credentials.ts";
import {
  mapShipaConfigurationSqlError,
  parseShipaCredentialSaveRequest,
  requireShipaServiceActor,
  ShipaConfigurationError,
  type ShipaCredentialAction,
  type ShipaServiceActor,
} from "./shipa-configuration-service-contract.ts";
import {
  parseShipaSettingsDocument,
  type ShipaSettingsDocument,
  type ShipaSettingsEnvelope,
  ShipaSettingsError,
  toShipaSettingsEnvelope,
} from "./shipa-settings-responses.ts";
import {
  createShipaSettingsStore,
  type ShipaSettingsRpcClient,
} from "./shipa-settings-store.ts";

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

/** The injected dependencies of the credential service. */
export interface ShipaCredentialServiceOptions {
  /** The database client. It is the SDK boundary, never a table. */
  readonly client: ShipaSettingsRpcClient;
  /** The injected master keys, indexed by key version. */
  readonly keyring: IntegrationCredentialKeyring;
  /** The master-key version new credentials are encrypted with. */
  readonly currentKeyVersion: number;
}

/** One credential save. The request is untrusted until it is parsed. */
export interface ShipaCredentialSaveInput {
  readonly actor: ShipaServiceActor;
  /** The raw request; it is validated here, never trusted. */
  readonly request: unknown;
}

/** The bounded credential mutation service. */
export interface ShipaCredentialService {
  /**
   * Saves the settings and, when the action asks for it, one environment's
   * credential in one atomic write.
   *
   * The returned envelope is the existing safe settings envelope. It carries
   * no key, no ciphertext and no nonce.
   */
  save(input: ShipaCredentialSaveInput): Promise<ShipaSettingsEnvelope>;
}

/** The largest master-key version SQL accepts. */
const MAX_KEY_VERSION = 999999999;

/**
 * Creates the credential service over an injected client and an injected
 * keyring.
 *
 * The current key version is validated here: it must be a positive integer
 * that exists in the keyring. A service that cannot encrypt is never built,
 * so a misconfigured deployment fails before a request reaches it.
 */
export function createShipaCredentialService(
  options: ShipaCredentialServiceOptions,
): ShipaCredentialService {
  const client = options.client;
  const keyring = options.keyring;
  const currentKeyVersion = requireCurrentKeyVersion(
    options.currentKeyVersion,
    keyring,
  );
  const store = createShipaSettingsStore({ client });

  return {
    async save(
      input: ShipaCredentialSaveInput,
    ): Promise<ShipaSettingsEnvelope> {
      const actor = requireShipaServiceActor(input.actor);
      const parsed = parseShipaCredentialSaveRequest(input.request);
      if (!parsed.ok) {
        // An unknown field, a credential-like field, a missing field and a
        // malformed key are all refused before any database call.
        throw new ShipaConfigurationError("invalid_request");
      }
      const { expectedRevision, settings, credential } = parsed.request;

      // The integration id and the current revision are server facts. They
      // are read before anything is encrypted, so a stale writer is refused
      // before a key is even produced.
      let current: ShipaSettingsEnvelope;
      try {
        current = await store.read({ actor });
      } catch (error) {
        if (error instanceof ShipaSettingsError) throw mapSettingsError(error);
        // A programming error is never dressed up as a closed failure.
        throw error;
      }
      if (current.settings.revision !== expectedRevision) {
        throw new ShipaConfigurationError("conflict");
      }

      const credentialChange = await buildCredentialChange(
        credential,
        current.integrationId,
        currentKeyVersion,
        keyring,
      );

      // Exactly one write. The credential change and the settings patch travel
      // in the same atomic save, so the revision advances exactly once.
      const raw = await callSaveSettings(client, {
        _expected_revision: expectedRevision,
        _settings: settings,
        _credential_change: credentialChange,
        _actor_id: actor.userId,
      });

      const document = parseSettingsDocument(raw);
      if (document.settings.revision !== expectedRevision + 1) {
        // The save advanced the revision by anything other than exactly one
        // step, so the answer does not describe the save that was asked for.
        // It is not reported as a success.
        throw new ShipaConfigurationError("invalid_response");
      }
      return toShipaSettingsEnvelope(document);
    },
  };
}

// ---------------------------------------------------------------------------
// The credential change
// ---------------------------------------------------------------------------

/**
 * Builds the credential change of the single save.
 *
 * `preserve` and a blank replacement key produce SQL null, which keeps the
 * stored key. `remove` is explicit and names one environment. `replace`
 * produces the encrypted envelope in the server-read binding.
 */
async function buildCredentialChange(
  action: ShipaCredentialAction,
  integrationId: string,
  currentKeyVersion: number,
  keyring: IntegrationCredentialKeyring,
): Promise<Record<string, unknown> | null> {
  if (action.mode === "remove") {
    return { mode: "remove", environment: action.environment };
  }
  if (action.mode === "preserve") {
    return null;
  }

  const plaintext = action.apiKey;
  if (plaintext.length === 0) {
    // A blank key means preserve. It never deletes a stored credential.
    return null;
  }

  let envelope: IntegrationEncryptedCredential;
  try {
    envelope = await encryptIntegrationCredential(
      plaintext,
      {
        integrationId,
        provider: "shipa",
        environment: action.environment,
        keyVersion: currentKeyVersion,
      },
      keyring,
    );
  } catch (error) {
    throw mapCryptoError(error);
  }
  return { mode: "replace", environment: action.environment, envelope };
}

// ---------------------------------------------------------------------------
// The boundaries
// ---------------------------------------------------------------------------

/**
 * Performs the single save and turns a rejected promise into a closed
 * failure. The original error is never returned or attached.
 */
async function callSaveSettings(
  client: ShipaSettingsRpcClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  let response: unknown;
  try {
    response = await client.rpc("shipa_save_settings", args);
  } catch (error) {
    throw mapShipaConfigurationSqlError(error);
  }
  // Supabase resolves `{data, error}`; the envelope of that answer may also
  // carry `status`, `count` and `statusText`. Those extra properties never
  // invalidate the answer.
  if (
    !isPlainRecord(response) ||
    !Object.hasOwn(response, "data") ||
    !Object.hasOwn(response, "error")
  ) {
    throw new ShipaConfigurationError("invalid_response");
  }
  if (response["error"] === undefined) {
    throw new ShipaConfigurationError("invalid_response");
  }
  if (response["error"] !== null) {
    throw mapShipaConfigurationSqlError(response["error"]);
  }
  return response["data"];
}

/** Parses the SQL document of the save with the existing strict parser. */
function parseSettingsDocument(raw: unknown): ShipaSettingsDocument {
  try {
    return parseShipaSettingsDocument(raw);
  } catch (error) {
    if (error instanceof ShipaSettingsError) throw mapSettingsError(error);
    throw error;
  }
}

/** Maps a closed settings failure onto the configuration failure surface. */
function mapSettingsError(error: ShipaSettingsError): ShipaConfigurationError {
  switch (error.code) {
    case "conflict":
      return new ShipaConfigurationError("conflict");
    case "forbidden":
      return new ShipaConfigurationError("forbidden");
    case "invalid_request":
      return new ShipaConfigurationError("invalid_request");
    case "runtime_not_ready":
      return new ShipaConfigurationError("runtime_not_ready");
    case "upgrade_required":
      return new ShipaConfigurationError("upgrade_required");
    case "invalid_response":
      return new ShipaConfigurationError("invalid_response");
    default:
      return new ShipaConfigurationError("unavailable");
  }
}

/** Maps a crypto boundary failure onto the configuration failure surface. */
function mapCryptoError(error: unknown): ShipaConfigurationError {
  if (error instanceof IntegrationCredentialError) {
    if (error.code === "invalid_plaintext") {
      return new ShipaConfigurationError("invalid_request");
    }
    if (error.code === "unknown_key_version") {
      return new ShipaConfigurationError("unknown_key_version");
    }
    if (error.code === "invalid_context") {
      return new ShipaConfigurationError("invalid_configuration");
    }
  }
  return new ShipaConfigurationError("unavailable");
}

// ---------------------------------------------------------------------------
// The key version
// ---------------------------------------------------------------------------

/**
 * Validates the injected current key version.
 *
 * It must be a positive integer within the range SQL accepts, and the
 * injected keyring must actually hold it. There is no fallback to another
 * version.
 */
function requireCurrentKeyVersion(
  value: unknown,
  keyring: IntegrationCredentialKeyring,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_KEY_VERSION
  ) {
    throw new ShipaConfigurationError("invalid_configuration");
  }
  if (!keyringHasVersion(keyring, value)) {
    throw new ShipaConfigurationError("invalid_configuration");
  }
  return value;
}

function keyringHasVersion(
  keyring: IntegrationCredentialKeyring,
  version: number,
): boolean {
  return keyring.has(version);
}
