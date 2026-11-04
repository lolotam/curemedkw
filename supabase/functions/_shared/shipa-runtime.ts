// Shipa runtime services — the lazy composition of the real configuration
// services.
//
// What this module is
// -------------------
// One factory that owns the real settings store, the real credential service
// and the real readiness service, and that resolves the master key only when
// an action genuinely needs it.
//
// The master key
// --------------
// The key arrives through an injected `readEncryptionKey` callback. This
// module never reads `Deno.env` itself, never generates a key, and never
// falls back to another key version, a plaintext credential or a provider-side
// secret. The key version is server-owned: V1 is version 1, and a caller
// cannot select one.
//
// A safe read — settings read, settings save, readiness read — never needs key
// material, so those services are built without it and keep working in a
// deployment that has no master key at all. Only `credential.save` and
// `readiness.diagnose` ask for the keyring, and they ask for it after the
// caller has already validated the request and verified the administrator.
//
// Trust boundary
// --------------
// The imported key is a non-extractable `CryptoKey` that lives in the keyring
// for the lifetime of the runtime. The encoded key material is not retained,
// logged, persisted or returned, and the runtime never reports why a key was
// refused: the failure is a fixed `invalid_configuration`.
//
// Source of truth:
//   docs/superpowers/specs/2026-11-02-shipa-delivery-design.md (sections 5, 6)
//   docs/superpowers/plans/2026-11-02-shipa-delivery.md (tasks 5, 6)

import type { ShipaAuthClient } from "./shipa-auth.ts";
import type {
  ShipaAuthRoleFilter,
  ShipaAuthRoleResponse,
} from "./shipa-auth.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.105.1";
import type { ShipaFetch } from "./shipa-client.ts";
import { ShipaConfigurationError } from "./shipa-configuration-service-contract.ts";
import {
  createShipaCredentialService,
  type ShipaCredentialService,
} from "./shipa-credential-service.ts";
import {
  createShipaReadinessService,
  type ShipaReadinessService,
} from "./shipa-readiness-service.ts";
import {
  createShipaSettingsStore,
  type ShipaSettingsRpcClient,
  type ShipaSettingsStore,
} from "./shipa-settings-store.ts";
import {
  importIntegrationMasterKey,
  type IntegrationCredentialKeyring,
} from "./integration-credentials.ts";

// ---------------------------------------------------------------------------
// The server-owned key version
// ---------------------------------------------------------------------------

/**
 * The master-key version of V1.
 *
 * It is server-owned: the runtime always uses it and never accepts one from a
 * request, a body, a header or a caller.
 */
export const SHIPA_RUNTIME_KEY_VERSION = 1;

// ---------------------------------------------------------------------------
// The runtime
// ---------------------------------------------------------------------------

/**
 * The client the runtime needs.
 *
 * A real Supabase client satisfies it: the verified-auth boundary and the RPC
 * boundary are both structural, so no SDK internals are replaced by a mock.
 */
export type ShipaRuntimeClient = ShipaAuthClient & ShipaSettingsRpcClient;

// Flatten the SDK's recursive generic builders at the dependency boundary.
// Queries and auth still execute on the real client; no assertion hides a
// missing capability, and only data/error cross into the small service types.
export function createShipaRuntimeClient(
  sdk: SupabaseClient,
): ShipaRuntimeClient {
  return {
    auth: {
      async getUser(access: string) {
        const { data, error } = await sdk.auth.getUser(access);
        return {
          data: { user: data.user ? { id: data.user.id } : null },
          error,
        };
      },
    },
    from(table: string) {
      return {
        select(columns: string) {
          let query = sdk.from(table).select(columns);
          const filter: ShipaAuthRoleFilter = {
            eq(column: string, value: string): ShipaAuthRoleFilter {
              query = query.eq(column, value);
              return filter;
            },
            async maybeSingle(): Promise<ShipaAuthRoleResponse> {
              const { data, error } = await query.maybeSingle();
              return { data, error };
            },
          };
          return filter;
        },
      };
    },
    async rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
      const { data, error } = await sdk.rpc(fn, args);
      return { data, error };
    },
  };
}

/** The injected dependencies of the runtime. */
export interface ShipaRuntimeOptions {
  /** The database client. It is the SDK boundary, never a table. */
  readonly client: ShipaRuntimeClient;
  /**
   * Reads the encoded master key.
   *
   * It returns `undefined` when the deployment has no master key. The value
   * never comes from a browser.
   */
  readonly readEncryptionKey: () => string | undefined;
  /** The fetch boundary of the provider adapter. */
  readonly fetchImpl?: ShipaFetch;
}

/** The composed services of one runtime. */
export interface ShipaRuntimeServices {
  /** The safe settings store. It needs no key material. */
  readonly settingsStore: ShipaSettingsStore;
  /**
   * Builds the readiness service.
   *
   * The service is bound to the runtime keyring, so a read works before any
   * key was loaded and a diagnosis works once the keyring was loaded.
   */
  createReadinessService(): ShipaReadinessService;
  /** Loads the master key and returns the keyring. */
  requireKeyring(): Promise<IntegrationCredentialKeyring>;
  /** Loads the master key and builds the credential service. */
  requireCredentialService(): Promise<ShipaCredentialService>;
}

/**
 * Creates the runtime over an injected client and an injected key reader.
 *
 * Nothing is read, imported or resolved at construction time: the settings
 * store is the only service that is built eagerly, and it needs no key.
 */
export function createShipaRuntimeServices(
  options: ShipaRuntimeOptions,
): ShipaRuntimeServices {
  const client = options.client;
  const readEncryptionKey = options.readEncryptionKey;
  const fetchImpl = options.fetchImpl;

  // One keyring for the runtime. It stays empty until a crypto action asks
  // for the master key, and the readiness service observes this very map, so
  // a diagnosis finds the key that was loaded for it.
  const keyring: Map<number, CryptoKey> = new Map<number, CryptoKey>();

  const settingsStore = createShipaSettingsStore({ client });

  /**
   * Loads the master key into the runtime keyring.
   *
   * A missing key, a malformed key and a key of the wrong length are all the
   * same fixed failure: the deployment cannot encrypt, so the action cannot
   * proceed. The value and the original cause are both dropped.
   */
  async function requireKeyring(): Promise<IntegrationCredentialKeyring> {
    const encoded = readEncryptionKey();
    if (typeof encoded !== "string" || encoded.trim().length === 0) {
      throw new ShipaConfigurationError("invalid_configuration");
    }

    let key: CryptoKey;
    try {
      key = await importIntegrationMasterKey(encoded.trim());
    } catch {
      // The crypto failure is deliberately dropped: it can quote the material
      // it was given.
      throw new ShipaConfigurationError("invalid_configuration");
    }

    keyring.set(SHIPA_RUNTIME_KEY_VERSION, key);
    return keyring;
  }

  return {
    settingsStore,
    createReadinessService(): ShipaReadinessService {
      return createShipaReadinessService({ client, keyring, fetchImpl });
    },
    requireKeyring,
    async requireCredentialService(): Promise<ShipaCredentialService> {
      await requireKeyring();
      return createShipaCredentialService({
        client,
        keyring,
        currentKeyVersion: SHIPA_RUNTIME_KEY_VERSION,
      });
    },
  };
}
