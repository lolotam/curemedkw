// Shipa readiness service — the read-only projection and the bounded
// diagnostic probe.
//
// This service owns exactly two operations:
//
//   read({actor})                     -> the safe readiness projection
//   diagnose({actor, request})        -> the same projection after one probe
//
// What it deliberately does not do
// --------------------------------
// * No scheduler receipt. This service never calls
//   `shipa_record_scheduler_ok`, and a service nudge is not a heartbeat.
// * No activation and no settings write. A diagnosis never enables the
//   integration and never changes a stored setting.
// * No order, no payment, no booking and no provider write. The provider is
//   only read from, and only through the fixed-origin adapter.
// * No retry. A refused read, probe or record is refused.
// * No environment fallback. The requested environment is the only one that
//   is loaded and the only one that is called.
//
// Trust boundary
// --------------
// The observation is built on the server from facts the server owns: the
// SQL-owned fingerprint of the credential that was actually loaded and the
// normalised country directory the provider returned. A caller observation, a
// caller proof, a caller `verified` flag and a caller fingerprint are all
// refused before any I/O.
//
// Source of truth:
//   docs/integrations/shipa-readiness-rpc-contract.md
//   docs/superpowers/plans/2026-11-02-shipa-delivery.md (tasks 5, 6)

import { isPlainRecord } from "./integration-credential-contract.ts";
import type { IntegrationCredentialKeyring } from "./integration-credentials.ts";
import { ShipaClient, type ShipaFetch } from "./shipa-client.ts";
import type { ShipaEnvironment, ShipaFailureCode } from "./shipa-contract.ts";
import {
  mapShipaConfigurationSqlError,
  parseShipaReadinessDiagnosisRequest,
  requireShipaServiceActor,
  ShipaConfigurationError,
  type ShipaServiceActor,
} from "./shipa-configuration-service-contract.ts";
import {
  ShipaCredentialLoaderError,
  type ShipaCredentialSecret,
} from "./shipa-credential-loader-contract.ts";
import { createShipaCredentialLoader } from "./shipa-credential-loader.ts";
import {
  isShipaObservationFailureCode,
  parseShipaObservationAcknowledgement,
  parseShipaReadinessDocument,
  type ShipaObservationFailureCode,
  type ShipaProviderObservation,
  type ShipaReadinessDto,
  toShipaReadinessDto,
} from "./shipa-readiness-responses.ts";
import {
  type ShipaSettingsEnvelope,
  ShipaSettingsError,
} from "./shipa-settings-responses.ts";
import {
  createShipaSettingsStore,
  type ShipaSettingsRpcClient,
} from "./shipa-settings-store.ts";

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

/** The injected dependencies of the readiness service. */
export interface ShipaReadinessServiceOptions {
  /** The database client. It is the SDK boundary, never a table. */
  readonly client: ShipaSettingsRpcClient;
  /** The injected master keys, indexed by key version. */
  readonly keyring: IntegrationCredentialKeyring;
  /** The fetch boundary of the provider adapter. */
  readonly fetchImpl?: ShipaFetch;
}

/** A readiness read. */
export interface ShipaReadinessReadInput {
  readonly actor: ShipaServiceActor;
}

/** A readiness diagnosis. The request is untrusted until it is parsed. */
export interface ShipaReadinessDiagnoseInput {
  readonly actor: ShipaServiceActor;
  /** The raw request; it is validated here, never trusted. */
  readonly request: unknown;
}

/** The read-only readiness service. */
export interface ShipaReadinessService {
  /**
   * Reads the readiness projection.
   *
   * It calls the readiness RPC and nothing else: no settings read, no
   * credential read, no provider call and no write.
   */
  read(input: ShipaReadinessReadInput): Promise<ShipaReadinessDto>;
  /**
   * Runs one read-only provider probe, records the observation it produced
   * and returns the readiness projection that follows it.
   */
  diagnose(input: ShipaReadinessDiagnoseInput): Promise<ShipaReadinessDto>;
}

/** The country the delivery directory is verified against. */
const VERIFIED_COUNTRY_CODE = "KWT";

/**
 * Creates the readiness service over an injected client, an injected keyring
 * and an optional injected fetch boundary.
 */
export function createShipaReadinessService(
  options: ShipaReadinessServiceOptions,
): ShipaReadinessService {
  const client = options.client;
  const keyring = options.keyring;
  const fetchImpl = options.fetchImpl;

  return {
    async read(
      input: ShipaReadinessReadInput,
    ): Promise<ShipaReadinessDto> {
      const actor = requireShipaServiceActor(input.actor);
      return await readReadinessProjection(client, actor);
    },

    async diagnose(
      input: ShipaReadinessDiagnoseInput,
    ): Promise<ShipaReadinessDto> {
      const actor = requireShipaServiceActor(input.actor);
      const parsed = parseShipaReadinessDiagnosisRequest(input.request);
      if (!parsed.ok) {
        // A caller observation, a caller proof, a key, an actor field and
        // every other unknown field are refused before any I/O.
        throw new ShipaConfigurationError("invalid_request");
      }
      const { expectedRevision, environment } = parsed.request;

      // The integration id and the current revision are server facts.
      const store = createShipaSettingsStore({ client });
      let current: ShipaSettingsEnvelope;
      try {
        current = await store.read({ actor });
      } catch (error) {
        if (error instanceof ShipaSettingsError) throw mapSettingsError(error);
        throw error;
      }
      if (current.settings.revision !== expectedRevision) {
        throw new ShipaConfigurationError("conflict");
      }

      // The credential is loaded for the requested environment only.
      const loader = createShipaCredentialLoader({ client, keyring });
      let loaded: ShipaCredentialSecret;
      try {
        loaded = await loader.readSecret({
          integrationId: current.integrationId,
          environment,
        });
      } catch (error) {
        if (error instanceof ShipaCredentialLoaderError) {
          throw mapLoaderError(error);
        }
        throw error;
      }
      if (
        typeof loaded.apiKey !== "string" ||
        loaded.apiKey.trim().length === 0
      ) {
        // A stored credential that decrypts to nothing cannot be probed, and
        // no remote observation is invented for it.
        throw new ShipaConfigurationError("credential_missing");
      }

      const { apiKey } = loaded;
      const probe = new ShipaClient({
        environment,
        apiKey,
        fetchImpl,
      });
      const observation = await runProviderProbe(
        probe,
        loaded.credentialFingerprint,
      );

      await recordProviderObservation(
        client,
        { expectedRevision, environment, observation, actorId: actor.userId },
      );

      // A newer concurrent revision may already have made this projection
      // stale. The honest result is returned as it is; it is never forced to
      // be true.
      return await readReadinessProjection(client, actor);
    },
  };
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

/**
 * Reads and maps the readiness projection.
 *
 * The projection is the only thing this service returns, and it carries no
 * key, no nonce, no ciphertext, no fingerprint, no city directory and no raw
 * upstream body.
 */
async function readReadinessProjection(
  client: ShipaSettingsRpcClient,
  actor: ShipaServiceActor,
): Promise<ShipaReadinessDto> {
  const raw = await callReadinessRpc(client, "shipa_read_readiness", {
    _actor_id: actor.userId,
  });
  return toShipaReadinessDto(parseShipaReadinessDocument(raw));
}

// ---------------------------------------------------------------------------
// The provider probe
// ---------------------------------------------------------------------------

/**
 * Runs the read-only probe and builds the observation.
 *
 * The health call runs first. The country directory is requested only when
 * the health answer was a usable `OK`, and a successful observation needs
 * the exact KWT identity and a nonempty city list.
 */
async function runProviderProbe(
  probe: ShipaClient,
  credentialFingerprint: string,
): Promise<ShipaProviderObservation> {
  const health = await probe.health();
  if (!health.ok) {
    return failedObservation(
      credentialFingerprint,
      observationCodeFor(health.code),
    );
  }
  if (health.data.status !== "OK") {
    // The provider answered, but the answer is not a healthy service. That is
    // an unusable remote answer, never a verification.
    return failedObservation(credentialFingerprint, "invalid_response");
  }

  const country = await probe.getCountry(VERIFIED_COUNTRY_CODE);
  if (!country.ok) {
    return failedObservation(
      credentialFingerprint,
      observationCodeFor(country.code),
    );
  }
  if (country.data.isoAlpha3 !== VERIFIED_COUNTRY_CODE) {
    return failedObservation(credentialFingerprint, "invalid_response");
  }

  const cities = country.data.cities
    .map((city) => city.name.trim())
    .filter((name) => name.length > 0);
  if (cities.length === 0) {
    return failedObservation(credentialFingerprint, "invalid_response");
  }

  return {
    credentialFingerprint,
    countryCode: VERIFIED_COUNTRY_CODE,
    cities,
    code: null,
    verified: true,
  };
}

/**
 * Keeps only a permitted fixed adapter code.
 *
 * A code outside the permitted set is reported as an unusable remote answer,
 * so an unknown failure never becomes a new vocabulary.
 */
function observationCodeFor(
  code: ShipaFailureCode,
): ShipaObservationFailureCode {
  return isShipaObservationFailureCode(code) ? code : "invalid_response";
}

function failedObservation(
  credentialFingerprint: string,
  code: ShipaObservationFailureCode,
): ShipaProviderObservation {
  return {
    credentialFingerprint,
    countryCode: null,
    cities: [],
    code,
    verified: false,
  };
}

// ---------------------------------------------------------------------------
// The observation write
// ---------------------------------------------------------------------------

/**
 * Records the observation once.
 *
 * A refused write is not a successful diagnosis and is never retried: the
 * caller decides explicitly whether to run the diagnostic again.
 */
async function recordProviderObservation(
  client: ShipaSettingsRpcClient,
  input: {
    expectedRevision: number;
    environment: ShipaEnvironment;
    observation: ShipaProviderObservation;
    actorId: string;
  },
): Promise<void> {
  const { expectedRevision, environment, observation, actorId } = input;
  const raw = await callReadinessRpc(
    client,
    "shipa_record_provider_observation",
    {
      _expected_revision: expectedRevision,
      _environment: environment,
      _observation: observation,
      _actor_id: actorId,
    },
  );

  const acknowledgement = parseShipaObservationAcknowledgement(raw);
  if (acknowledgement.remote_probe_ok !== observation.verified) {
    // The recorded row does not describe the probe that was run, so the
    // diagnosis is not a successful one.
    throw new ShipaConfigurationError("invalid_response");
  }
}

// ---------------------------------------------------------------------------
// The boundaries
// ---------------------------------------------------------------------------

/**
 * Performs one database call and turns a rejected promise into a closed
 * failure. The original error is never returned or attached.
 */
async function callReadinessRpc(
  client: ShipaSettingsRpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let response: unknown;
  try {
    response = await client.rpc(fn, args);
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
  if (response["error"] !== null && response["error"] !== undefined) {
    throw mapShipaConfigurationSqlError(response["error"]);
  }
  return response["data"];
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

/** Maps a closed loader failure onto the configuration failure surface. */
function mapLoaderError(
  error: ShipaCredentialLoaderError,
): ShipaConfigurationError {
  switch (error.code) {
    case "credential_missing":
      return new ShipaConfigurationError("credential_missing");
    case "unknown_key_version":
      return new ShipaConfigurationError("unknown_key_version");
    case "decryption_failed":
      return new ShipaConfigurationError("decryption_failed");
    case "upgrade_required":
      return new ShipaConfigurationError("upgrade_required");
    case "invalid_response":
      return new ShipaConfigurationError("invalid_response");
    case "context_mismatch":
      return new ShipaConfigurationError("invalid_response");
    case "invalid_binding":
      return new ShipaConfigurationError("invalid_request");
    default:
      return new ShipaConfigurationError("unavailable");
  }
}
