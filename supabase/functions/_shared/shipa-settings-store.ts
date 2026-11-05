// Shipa settings — the injected RPC store.
//
// This module owns the two safe settings calls of the tested SQL subset:
//
//   shipa_read_settings(_actor_id uuid) -> safe document
//   shipa_save_settings(_expected_revision integer, _settings jsonb,
//     _credential_change jsonb | SQL null, _actor_id uuid) -> safe document
//
// What it deliberately does not do
// -------------------------------
// * No retry. A refused save is refused; nothing is re-sent and nothing is
//   re-encrypted behind the caller's back.
// * No direct table access, no HTTP call, no credential RPC, no encryption,
//   no provider activation, no scheduler and no heartbeat write. The SQL
//   wrappers are the only owners of the stored rows.
// * No settings read before a save. A save carries its own expected revision,
//   so a stale writer is refused by SQL instead of being resolved by reading
//   first and overwriting.
// * No credential operation. An ordinary save passes SQL null for
//   `_credential_change`, which preserves the stored keys.
//
// Trust boundary
// --------------
// The actor is an INTERNAL, already-verified caller descriptor. It is never
// browser request data: the endpoint that will own this store authenticates
// the request first and only then supplies the actor id. The store validates
// the id's syntax, and SQL re-checks the supplied id's real admin role. Neither
// check proves HTTP caller identity; verified auth.getUser is the endpoint's duty.
//
// The module has no globals, no environment access and no top-level I/O. The
// database client is injected, so the store can be exercised against a fake
// SDK boundary without a database.

import { isIntegrationUuid, isPlainRecord } from "./integration-credential-contract.ts";
import {
  ShipaSettingsError,
  mapShipaSqlError,
  parseShipaSettingsDocument,
  toShipaSettingsEnvelope,
  type ShipaSettingsEnvelope,
} from "./shipa-settings-responses.ts";
import { parseShipaSaveRequest } from "./shipa-settings-validation.ts";

/**
 * The structural slice of a database client this store needs.
 *
 * A real Supabase client satisfies it: its `rpc` returns a promise-like
 * builder. Keeping the dependency structural avoids pulling an SDK runtime
 * into this module and keeps the fake boundary in the tests honest.
 */
export interface ShipaSettingsRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<unknown>;
}

/**
 * The verified caller of a settings operation. The user id is the id of the
 * authenticated administrator; it is supplied by the server, never by a
 * browser payload.
 */
export interface ShipaSettingsActor {
  readonly userId: string;
}

export interface ShipaSettingsReadInput {
  readonly actor: ShipaSettingsActor;
}

export interface ShipaSettingsSaveInput {
  readonly actor: ShipaSettingsActor;
  /** The raw browser save request; it is validated here, never trusted. */
  readonly request: unknown;
}

export interface ShipaSettingsStore {
  /** Reads the safe settings document. */
  read(input: ShipaSettingsReadInput): Promise<ShipaSettingsEnvelope>;
  /** Saves the settings and returns the safe document the save produced. */
  save(input: ShipaSettingsSaveInput): Promise<ShipaSettingsEnvelope>;
}

/**
 * Creates the settings store over an injected database client.
 */
export function createShipaSettingsStore(
  options: { readonly client: ShipaSettingsRpcClient },
): ShipaSettingsStore {
  const client = options.client;
  return {
    async read(input: ShipaSettingsReadInput): Promise<ShipaSettingsEnvelope> {
      const actorId = requireActorId(input.actor);
      const raw = await callShipaRpc(client, "shipa_read_settings", {
        _actor_id: actorId,
      });
      return toShipaSettingsEnvelope(parseShipaSettingsDocument(raw));
    },

    async save(input: ShipaSettingsSaveInput): Promise<ShipaSettingsEnvelope> {
      const actorId = requireActorId(input.actor);
      const parsed = parseShipaSaveRequest(input.request);
      if (!parsed.ok || parsed.request === undefined) {
        // The request is refused before any database call: an unknown field,
        // a missing field or a credential-like field never reaches SQL.
        throw new ShipaSettingsError("invalid_request");
      }
      const { expectedRevision, settings } = parsed.request;
      const raw = await callShipaRpc(client, "shipa_save_settings", {
        _expected_revision: expectedRevision,
        _settings: { ...settings, ...(parsed.request.liveActivationConfirmed === undefined ? {} : { liveActivationConfirmed: parsed.request.liveActivationConfirmed }) },
        // An ordinary save preserves the stored credential. Replacing or
        // removing a credential is a separate, later operation.
        _credential_change: null,
        _actor_id: actorId,
      });
      const document = parseShipaSettingsDocument(raw);
      if (document.settings.revision !== expectedRevision + 1) {
        // The save advanced the revision by anything other than exactly one
        // step, so the answer does not describe the save that was asked for.
        // It is not reported as a success.
        throw new ShipaSettingsError("invalid_response");
      }
      return toShipaSettingsEnvelope(document);
    },
  };
}

/**
 * Validates the internal actor descriptor. Only the syntax is checked here:
 * the endpoint authenticates the caller and SQL re-checks the admin role.
 */
function requireActorId(actor: ShipaSettingsActor | undefined): string {
  const userId = actor?.userId;
  if (!isIntegrationUuid(userId)) {
    throw new ShipaSettingsError("invalid_request");
  }
  return userId.toLowerCase();
}

/**
 * Performs one database call and turns a rejected promise into a closed
 * failure. The original error is never returned or attached.
 */
async function callShipaRpc(
  client: ShipaSettingsRpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let response: unknown;
  try {
    response = await client.rpc(fn, args);
  } catch (error) {
    throw mapShipaSqlError(error);
  }
  if (!isPlainRecord(response) || !Object.hasOwn(response, "data") || !Object.hasOwn(response, "error")) {
    throw new ShipaSettingsError("invalid_response");
  }
  if (response.error !== null) throw mapShipaSqlError(response.error);
  return response.data;
}
