// Shipa one-shipment execution core.
//
// What this module is
// -------------------
// The internal core that takes one shipment to at most one provider creation.
//
// It is NOT an endpoint, not a scheduler, not a route, not a queue consumer and
// not a status poller. It exposes exactly one operation, `processShipment`,
// that a future authenticated route or scheduler calls once per shipment.
//
// The trust boundary
// ------------------
// The input binding `{shipmentId, integrationId, environment}` is INTERNAL and
// SERVER-OWNED. It is the data the server already owns — the shipment it
// selected, the integration it belongs to and the environment it is for. This
// module never accepts a browser actor, a credential, an endpoint, a paid
// flag, a draft or any other caller-supplied authority, and it never reads
// `Deno.env`. The caller owns authentication, authorisation and the request
// budget of the surrounding endpoint.
//
// What this module guarantees
// ---------------------------
// * At most one provider POST per invocation, and only after a successfully
//   received, strictly matching, durable `ready=true` begin.
// * A lost, refused, malformed, mismatched or wrong-token begin never
//   authorises a provider request, even when SQL committed the marker.
// * The loaded credential tuple is immutable for the run. A stale loaded
//   credential stays stale: it is never replaced with the metadata of a
//   fresher preparation.
// * Nothing is retried. A completion that fails is reported as uncertain and
//   is left to the durable marker, the lease and the later reconciliation that
//   this slice does not implement.
// * No authority to repeat creation is produced anywhere, including for `needs_review`,
//   a local rejection, a negative lookup or a service credential.
// * Pre-dispatch phases run under one bounded execution budget. The budget is checked
//   BEFORE a lazy operation is invoked and every await is bounded by the
//   remaining time, so a call that resolves after the deadline never reaches
//   the provider. The budget bounds this process only: it cannot prove that
//   the database cancelled or rolled back an abandoned call.
// * Once the provider is invoked, its bounded adapter owns the await, independent
//   of browser disconnect. Its outcome gets one separate bounded completion
//   attempt, even if the item deadline elapsed. Neither boundary retries.
//
// Source of truth:
//   docs/integrations/shipa-submission-rpc-contract.md
//   docs/integrations/shipa-dispatch-state-rpc-contract.md
//   supabase/migrations/20261103001600_shipa_submission.sql

import {
  isIntegrationUuid,
  isPlainRecord,
} from "./integration-credential-contract.ts";
import type { IntegrationCredentialKeyring } from "./integration-credentials.ts";
import {
  ShipaCredentialLoaderError,
  type ShipaCredentialSecret,
} from "./shipa-credential-loader-contract.ts";
import { createShipaCredentialLoader } from "./shipa-credential-loader.ts";
import {
  buildShipaOrderPayload,
  isShipaEnvironment,
  type ShipaEnvironment,
} from "./shipa-contract.ts";
import {
  ShipaClient,
  type ShipaCreateResult,
  type ShipaFetch,
} from "./shipa-client.ts";
import {
  type ShipaSubmissionBegin,
  type ShipaSubmissionBinding,
  ShipaSubmissionError,
  type ShipaSubmissionPreparation,
  type ShipaSubmissionRefusal,
  type ShipaSubmissionRpcClient,
  type ShipaSubmissionSafeSummary,
} from "./shipa-submission-contract.ts";
import { shipaJsonEqual } from "./shipa-submission-responses.ts";
import { createShipaSubmissionStore } from "./shipa-submission-store.ts";
import {
  createShipaExecutionBudget,
  isShipaExecutionBudgetError,
  SHIPA_EXECUTION_PROVIDER_DEADLINE_MS,
  type ShipaExecutionBudget,
} from "./shipa-execution-budget.ts";

/** Reserve for persisting one observed outcome; never a resend allowance. */
export const SHIPA_COMPLETION_BUDGET_MS = 3_000;

// ---------------------------------------------------------------------------
// The input and the result
// ---------------------------------------------------------------------------

/**
 * The server-owned binding of one shipment.
 *
 * It never carries an actor, a role, a credential, an endpoint, a paid flag
 * or a draft.
 */
export interface ShipaDispatchInput {
  readonly shipmentId: string;
  readonly integrationId: string;
  readonly environment: ShipaEnvironment;
}

/**
 * The reasons nothing was started.
 *
 * Every code means the same thing: no provider request was made and no
 * durable submission marker was created by this invocation.
 */
export type ShipaDispatchNotStartedCode =
  | ShipaSubmissionError["code"]
  | ShipaSubmissionRefusal["code"]
  | "draft_invalid"
  | "payload_mismatch"
  | "context_mismatch"
  | "budget_exhausted";

/**
 * The reasons the outcome is uncertain.
 *
 * An uncertain outcome is never a safe retry: a durable marker may exist and
 * the provider may have booked the order.
 */
export type ShipaDispatchUncertainCode =
  | "begin_uncertain"
  | "begin_lease_unusable"
  | "provider_uncertain"
  | "provider_rejected_local"
  | "provider_invalid_response"
  | "budget_exhausted";

/**
 * The safe execution status of one shipment.
 *
 * It carries a closed code and, when the database answered, the SQL-owned
 * safe summary. It never carries a draft, a payload, a key, a fingerprint, a
 * hash or a raw provider answer.
 */
export type ShipaDispatchResult =
  | {
    readonly status: "not_started";
    readonly code: ShipaDispatchNotStartedCode;
  }
  | {
    readonly status: "created";
    readonly code: "created";
    readonly summary: ShipaSubmissionSafeSummary;
  }
  | {
    readonly status: "uncertain";
    readonly code: ShipaDispatchUncertainCode;
    readonly summary?: ShipaSubmissionSafeSummary;
  }
  | {
    readonly status: "persistence_uncertain";
    readonly code: "persistence_uncertain";
  };

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------

/** The injected dependencies of the dispatcher. */
export interface ShipaDispatcherOptions {
  /**
   * The database client. It is the SDK RPC boundary, never a table.
   *
   * The same client serves the credential loader and the submission store.
   */
  readonly client: ShipaSubmissionRpcClient;
  /**
   * The master keyring.
   *
   * The keyring is injected: this module never reads the environment, never
   * imports a key and never falls back to another key version.
   */
  readonly keyring: IntegrationCredentialKeyring;
  /** The provider fetch boundary. Defaults to the platform fetch. */
  readonly fetchImpl?: ShipaFetch;
  /** Server wall clock for checking the received SQL lease; never browser input. */
  readonly now?: () => number;
  /**
   * The shared execution budget of the surrounding item.
   *
   * It is injected when the caller owns a wider item, for example a manual
   * review whose canonical lookup and key load already consumed part of the
   * fifteen seconds. Without it this core creates a FRESH budget for every
   * `processShipment` invocation: the budget belongs to the invocation, not
   * to the constructor and not to a single await.
   */
  readonly budget?: ShipaExecutionBudget;
}

/** The one-shipment execution core. */
export interface ShipaDispatcher {
  /**
   * Takes one shipment to at most one provider creation.
   *
   * It never throws for a business outcome: every refusal, failure and
   * uncertainty is reported as a closed status.
   */
  processShipment(input: ShipaDispatchInput): Promise<ShipaDispatchResult>;
}

/**
 * Creates the one-shipment execution core.
 *
 * The real credential loader and the real submission store are built over the
 * injected client. Nothing is read, resolved or imported at construction time.
 */
export function createShipaDispatcher(
  options: ShipaDispatcherOptions,
): ShipaDispatcher {
  const client = options.client;
  const keyring = options.keyring;
  const fetchImpl = options.fetchImpl;
  const now = options.now ?? Date.now;

  const loader = createShipaCredentialLoader({ client, keyring });
  const store = createShipaSubmissionStore({ client });
  const sharedBudget = options.budget;

  async function processShipment(
    input: ShipaDispatchInput,
  ): Promise<ShipaDispatchResult> {
    const binding = requireDispatchInput(input);
    if (binding === null) {
      return { status: "not_started", code: "invalid_request" };
    }

    // The budget of THIS invocation. An injected budget is shared with the
    // manual phases around the call, so the fifteen seconds of the whole item
    // are not reset here. Without one, every invocation gets a fresh budget.
    const budget = sharedBudget ?? createShipaExecutionBudget();

    // 1. Load the credential for this integration and environment. The loaded
    //    tuple is immutable for this execution.
    let loaded: ShipaCredentialSecret;
    try {
      loaded = await budget.run(() =>
        loader.readSecret({
          integrationId: binding.integrationId,
          environment: binding.environment,
        })
      );
    } catch (error) {
      if (isShipaExecutionBudgetError(error)) {
        return { status: "not_started", code: "budget_exhausted" };
      }
      return { status: "not_started", code: mapLoaderFailure(error) };
    }

    // 2. Prepare. Preparation is mutating but never grants send authority.
    let preparation: ShipaSubmissionPreparation | ShipaSubmissionRefusal;
    try {
      preparation = await budget.run(() => store.prepare(binding));
    } catch (error) {
      if (isShipaExecutionBudgetError(error)) {
        return { status: "not_started", code: "budget_exhausted" };
      }
      return { status: "not_started", code: mapStoreFailure(error) };
    }
    if (preparation.ready === false) {
      return { status: "not_started", code: preparation.code };
    }

    // 3. Validate the returned draft with the real adapter builder and
    //    compare its payload with the SQL payload. A mismatch or an invalid
    //    draft stops here: no begin, no provider request, no persisted state.
    const built = buildShipaOrderPayload(preparation.draft);
    if (!built.ok) {
      return { status: "not_started", code: "draft_invalid" };
    }
    if (!shipaJsonEqual(built.payload, preparation.payload)) {
      return { status: "not_started", code: "payload_mismatch" };
    }

    // 4. One fresh attempt token for this attempt. It is generated once and
    //    used for the begin and for the completion.
    const attemptId = crypto.randomUUID();

    // 5. Begin. Only a received, matching, durable `ready=true` answer
    //    authorises a provider request.
    let begun: ShipaSubmissionBegin | ShipaSubmissionRefusal;
    let beginInvoked = false;
    try {
      begun = await budget.run(() => {
        beginInvoked = true;
        return store.begin({
          binding,
          preparation,
          credential: {
            credentialRevision: loaded.credentialRevision,
            credentialFingerprint: loaded.credentialFingerprint,
          },
          attemptToken: attemptId,
        });
      });
    } catch (error) {
      if (!beginInvoked && isShipaExecutionBudgetError(error)) {
        return { status: "not_started", code: "budget_exhausted" };
      }
      // A transport failure, an unusable answer and an exhausted budget are
      // all uncertain: the marker may exist, so this is never a not-started
      // refusal and never a proof that no marker was committed.
      return { status: "uncertain", code: "begin_uncertain" };
    }
    if (begun.ready === false) {
      return { status: "not_started", code: begun.code };
    }

    // A valid begin can arrive after its durable lease has aged out. Keep a
    // full 15-second item window before starting the 10-second HTTP operation.
    // The marker may already exist: do not report local non-dispatch, complete
    // as a rejection, renew the lease or authorize another attempt.
    if (!hasSubmissionWindow(begun, now)) {
      return { status: "uncertain", code: "begin_lease_unusable" };
    }

    // 6. One create request, with the same loaded key and the returned
    //    draft. There is no lookup, no retry and no second attempt.
    //
    //    The remaining time is checked immediately before the provider is
    //    invoked, and the client deadline reserves completion time. An exhausted
    //    budget after the begin is uncertain: no new HTTP request happens and
    //    no completion is written.
    const remaining = budget.remainingMs();
    if (budget.abandoned || remaining <= SHIPA_COMPLETION_BUDGET_MS) {
      return { status: "uncertain", code: "budget_exhausted" };
    }
    const deadlineMs = Math.max(
      1,
      Math.min(
        SHIPA_EXECUTION_PROVIDER_DEADLINE_MS,
        Math.floor(remaining - SHIPA_COMPLETION_BUDGET_MS),
      ),
    );

    let result: ShipaCreateResult;
    try {
      const { apiKey } = loaded;
      const shipa = new ShipaClient({
        environment: binding.environment,
        apiKey,
        deadlineMs,
        ...(fetchImpl !== undefined ? { fetchImpl } : {}),
      });
      // After invocation, a browser disconnect is not cancellation of a booking.
      // The adapter bounds fetch AND body read by deadlineMs. Do not race this
      // observed outcome against the request's abort/item fence and discard it.
      result = await shipa.createOrder(begun.draft);
    } catch {
      // An unexpected failure after the begin is uncertain, never a proven
      // non-dispatch.
      result = { outcome: "uncertain", code: "invalid_response" };
    }

    // 7. Complete exactly once, with the same token and the real outcome.
    // A separate 3-second settlement fence cannot authorize any provider call.
    // It preserves a known acceptance even across a delayed event-loop turn
    // or browser abort. A failed/lost completion still requires reconciliation.
    const settlement = createShipaExecutionBudget({
      itemBudgetMs: SHIPA_COMPLETION_BUDGET_MS,
    });
    let summary: ShipaSubmissionSafeSummary;
    try {
      summary = await settlement.run(() =>
        store.complete(binding, attemptId, result)
      );
    } catch {
      // The completion is not retried and the outcome is not inferred. The
      // durable marker and the lease carry the recovery.
      return { status: "persistence_uncertain", code: "persistence_uncertain" };
    } finally {
      settlement.dispose();
    }

    return describeOutcome(result, summary);
  }

  return { processShipment };
}

// ---------------------------------------------------------------------------
// The outcome
// ---------------------------------------------------------------------------

/**
 * Describes the persisted outcome.
 *
 * The safe summary is authoritative: a shipment the database already knows as
 * created stays created, and no state is inferred from the provider answer.
 */
function describeOutcome(
  result: ShipaCreateResult,
  summary: ShipaSubmissionSafeSummary,
): ShipaDispatchResult {
  if (summary.state === "created") {
    return { status: "created", code: "created", summary };
  }
  if (result.outcome === "accepted") {
    return { status: "uncertain", code: "provider_invalid_response", summary };
  }
  if (result.outcome === "uncertain") {
    return { status: "uncertain", code: "provider_uncertain", summary };
  }
  return { status: "uncertain", code: "provider_rejected_local", summary };
}

/** A failed/invalid server clock cannot authorize a provider request. */
function hasSubmissionWindow(
  begun: ShipaSubmissionBegin,
  now: () => number,
): boolean {
  try {
    const currentTime = now();
    return Number.isFinite(currentTime) &&
      Date.parse(begun.leaseExpiresAt) - currentTime >= 15_000;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The failure mapping
// ---------------------------------------------------------------------------

/**
 * Validates the server-owned input.
 *
 * A browser actor, a credential, an endpoint, a paid flag or a draft is not
 * part of the binding, so there is nothing here that could carry one.
 */
function requireDispatchInput(
  input: ShipaDispatchInput,
): ShipaSubmissionBinding | null {
  if (!isPlainRecord(input)) return null;
  if (
    Object.keys(input).length !== 3 ||
    !["shipmentId", "integrationId", "environment"].every((key) =>
      Object.hasOwn(input, key)
    )
  ) return null;
  if (!isIntegrationUuid(input.shipmentId)) return null;
  if (!isIntegrationUuid(input.integrationId)) return null;
  if (!isShipaEnvironment(input.environment)) return null;
  return {
    shipmentId: input.shipmentId.toLowerCase(),
    integrationId: input.integrationId.toLowerCase(),
    environment: input.environment,
  };
}

/** Maps a credential loading failure to a closed code. */
function mapLoaderFailure(error: unknown): ShipaDispatchNotStartedCode {
  if (!(error instanceof ShipaCredentialLoaderError)) return "unavailable";
  switch (error.code) {
    case "invalid_binding":
      return "invalid_request";
    case "context_mismatch":
      return "context_mismatch";
    case "credential_missing":
      return "credential_missing";
    case "decryption_failed":
      return "decryption_failed";
    case "invalid_response":
      return "invalid_response";
    case "unknown_key_version":
      return "unknown_key_version";
    case "upgrade_required":
      return "upgrade_required";
    case "unavailable":
      return "unavailable";
  }
}

/** Maps a store failure to a closed code. */
function mapStoreFailure(error: unknown): ShipaDispatchNotStartedCode {
  if (error instanceof ShipaSubmissionError) {
    return error.code;
  }
  return "unavailable";
}
