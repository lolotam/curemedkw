import type { IntegrationCredentialEnvironment } from "./integration-credential-contract.ts";

// ---------------------------------------------------------------------------
// Closed failures
// ---------------------------------------------------------------------------

/**
 * The closed set of failures the loader can report.
 *
 * Nothing outside this list is ever produced, and a code never carries a
 * value: the message is fixed text and never contains a rejected value, a
 * secret, a ciphertext, a nonce, a SQL message, a SQL detail, a hint or a
 * cause.
 */
export type ShipaCredentialLoaderErrorCode =
  | "invalid_binding"
  | "credential_missing"
  | "invalid_response"
  | "context_mismatch"
  | "unknown_key_version"
  | "decryption_failed"
  | "upgrade_required"
  | "unavailable";

/**
 * The fixed message for every code. The mapping is exported so a caller can
 * map a code to a transport status without re-deriving the text, and so a
 * test can prove that a message never interpolates an input.
 */
export const SHIPA_CREDENTIAL_LOADER_ERROR_MESSAGES: Readonly<
  Record<ShipaCredentialLoaderErrorCode, string>
> = {
  invalid_binding: "The Shipa credential request is not valid.",
  credential_missing: "The Shipa credential is not configured.",
  invalid_response:
    "The Shipa credential service returned an unusable response.",
  context_mismatch:
    "The Shipa credential does not match the requested integration binding.",
  unknown_key_version:
    "No Shipa credential key is available for the stored key version.",
  decryption_failed: "The Shipa credential could not be decrypted.",
  upgrade_required:
    "The Shipa credential storage is not available in this deployment yet.",
  unavailable: "The Shipa credential service is not available right now.",
};

/**
 * The single failure type of the loader.
 *
 * The original cause is deliberately dropped: a SQL error can quote the
 * statement and the row, and a crypto exception can quote the material it
 * was given. The code carries the meaning and the message stays fixed.
 */
export class ShipaCredentialLoaderError extends Error {
  readonly code: ShipaCredentialLoaderErrorCode;

  constructor(code: ShipaCredentialLoaderErrorCode) {
    super(SHIPA_CREDENTIAL_LOADER_ERROR_MESSAGES[code]);
    this.name = "ShipaCredentialLoaderError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/**
 * The structural slice of a database client this loader needs.
 *
 * A real Supabase client satisfies it: its `rpc` returns a promise-like
 * builder. Keeping the dependency structural avoids pulling an SDK runtime
 * into this module and keeps the fake boundary in the tests honest.
 */
export interface ShipaCredentialRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<unknown>;
}

/**
 * The server-owned binding of one stored credential.
 *
 * The integration id and the environment are the values the server owns.
 * They are validated here and never taken from a browser authority.
 */
export interface ShipaCredentialBinding {
  /** The integration row id, a real UUID. */
  readonly integrationId: string;
  /** The environment the credential belongs to. */
  readonly environment: IntegrationCredentialEnvironment;
}

/**
 * The safe metadata of a stored credential.
 *
 * It carries no key, no envelope, no ciphertext and no nonce. An absent
 * credential reports `present:false` with null revision and null fingerprint.
 */
export interface ShipaCredentialMetadata {
  readonly present: boolean;
  readonly credentialRevision: number | null;
  readonly credentialFingerprint: string | null;
}

/**
 * A decrypted credential.
 *
 * INTERNAL AND SECRET-BEARING. The API key must never be logged, cached,
 * persisted, returned to a browser or written into an audit record. It is
 * the caller's own responsibility to keep it in memory only.
 */
export interface ShipaCredentialSecret {
  /** The decrypted provider API key. */
  readonly apiKey: string;
  /** The SQL-owned credential revision of the stored row. */
  readonly credentialRevision: number;
  /** The SQL-owned fingerprint of the stored row. */
  readonly credentialFingerprint: string;
}

/** The read-only credential loader. */
export interface ShipaCredentialLoader {
  /**
   * Reads the safe metadata of a stored credential without decrypting it.
   *
   * An absent credential is reported honestly as absent. A stored credential
   * that cannot be decrypted is still reported as present: this method never
   * needs the plaintext.
   */
  readMetadata(
    binding: ShipaCredentialBinding,
  ): Promise<ShipaCredentialMetadata>;
  /**
   * Reads and decrypts a stored credential.
   *
   * INTERNAL AND SECRET-BEARING. The returned key exists in memory only.
   */
  readSecret(binding: ShipaCredentialBinding): Promise<ShipaCredentialSecret>;
}
