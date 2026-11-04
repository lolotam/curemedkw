// Shipa manual service — the authenticated manual booking composition.
//
// What this module is
// -------------------
// The server-side composition of one manual booking. It owns exactly one
// review request, exactly one canonical binding lookup, one lazy keyring load
// and exactly one dispatch, in that order, under one shared admission budget.
// The dispatcher's bounded provider/settlement phase preserves observed results
// independently of browser abort after invocation; it never repeats a booking.
//
// What this module deliberately does not do
// -----------------------------------------
// * It never trusts a browser binding. The integration and the environment of
//   the dispatch come from the canonical SQL binding of the shipment the
//   review produced, and that binding has to agree with the reviewed order
//   and the requested environment before any key is loaded.
// * It never retries, never looks a shipment up at the provider and never
//   falls back to a second identity, a second intent or a second review.
// * It grants no authority of its own. The canonical binding is a lookup, and
//   the durable begin inside the shared dispatcher stays the only operation
//   that can authorise a single provider creation.
// * It never invents a shipment. A manual request whose answer was lost is
//   reported as an uncertain operation, and the staff member has to reload
//   the canonical state.
//
// Trust boundary
// --------------
// The actor is an INTERNAL, already-verified descriptor. The database client,
// the keyring loader, the provider fetch and the execution budget are all
// injected by the server. Nothing here reads the environment, logs, or keeps
// a secret beyond the injected keyring.
//
// Source of truth:
//   docs/integrations/shipa-dispatch-selection-rpc-contract.md
//   docs/integrations/shipa-review-store-contract.md
//   docs/integrations/shipa-dispatch-runtime-contract.md

import {
  isIntegrationUuid,
  isPlainRecord,
} from "./integration-credential-contract.ts";
import type { IntegrationCredentialKeyring } from "./integration-credentials.ts";
import { isShipaEnvironment, type ShipaEnvironment } from "./shipa-contract.ts";
import type { ShipaServiceActor } from "./shipa-configuration-service-contract.ts";
import { hasExactRecordKeys } from "./shipa-configuration-service-contract.ts";
import {
  createShipaExecutionBudget,
  isShipaExecutionBudgetError,
  type ShipaExecutionBudget,
  type ShipaExecutionBudgetOptions,
} from "./shipa-execution-budget.ts";
import type { ShipaFetch } from "./shipa-client.ts";
import {
  createShipaDispatcher,
  type ShipaDispatchResult,
} from "./shipa-dispatch.ts";
import {
  ShipaReviewError,
  type ShipaReviewIntegrityResult,
  type ShipaReviewManualRequest,
  type ShipaReviewPreviewRequest,
  type ShipaReviewShipmentRead,
} from "./shipa-review-contract.ts";
import { mapShipaReviewSqlError } from "./shipa-review-responses.ts";
import { createShipaReviewStore } from "./shipa-review-store.ts";
import {
  mapShipaShipmentFailure,
  type ShipaIntentReceipt,
  type ShipaManualShipmentSummary,
  ShipaShipmentError,
} from "./shipa-shipment-actions.ts";
import type { ShipaSubmissionSafeSummary } from "./shipa-submission-contract.ts";
import { readUuid } from "./shipa-submission-validation.ts";

// ---------------------------------------------------------------------------
// The service contract
// ---------------------------------------------------------------------------

/** The structural slice of a database client this service needs. */
export interface ShipaManualRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<unknown>;
}

/** The injected dependencies of the manual service. */
export interface ShipaManualServiceOptions {
  /** The database client. It is the SDK RPC boundary, never a table. */
  readonly client: ShipaManualRpcClient;
  /**
   * Loads the master keyring.
   *
   * It is consulted only after a usable manual summary and a matching
   * canonical binding. A preview and a read never ask for it.
   */
  readonly loadKeyring: () => Promise<IntegrationCredentialKeyring>;
  /** The provider fetch boundary. Defaults to the platform fetch. */
  readonly fetchImpl?: ShipaFetch;
  /** The server wall clock used for the received-lease check. */
  readonly now?: () => number;
  /** The server-owned execution budget options. */
  readonly budgetOptions?: ShipaExecutionBudgetOptions;
}

/** The input of one diagnostic preview. */
export interface ShipaManualPreviewInput {
  /** The internal verified actor descriptor. */
  readonly actor: ShipaServiceActor;
  /** The order the preview belongs to. */
  readonly orderId: string;
  /** The validated preview request. */
  readonly request: ShipaReviewPreviewRequest;
}

/** The input of one targeted read. */
export interface ShipaManualReadInput {
  /** The internal verified actor descriptor. */
  readonly actor: ShipaServiceActor;
  /** The shipment the read targets. */
  readonly shipmentId: string;
}

/** The input of one explicit manual booking. */
export interface ShipaManualCreateInput {
  /** The internal verified actor descriptor. */
  readonly actor: ShipaServiceActor;
  /** The order the review belongs to. */
  readonly orderId: string;
  /** The validated manual review request. */
  readonly request: ShipaReviewManualRequest;
}

/** The answer of one manual booking. */
export interface ShipaManualCreateResult {
  /** The safe summary of the shipment the review produced. */
  readonly shipment: ShipaManualShipmentSummary;
  /** The closed result of the one dispatch. */
  readonly dispatch: ShipaDispatchResult;
}

/** The manual booking composition. */
export interface ShipaManualService {
  /** Previews the integrity of one order. */
  preview(input: ShipaManualPreviewInput): Promise<ShipaReviewIntegrityResult>;
  /** Reads one targeted shipment. */
  read(input: ShipaManualReadInput): Promise<ShipaReviewShipmentRead | null>;
  /** Creates one manual booking and dispatches it at most once. */
  create(input: ShipaManualCreateInput): Promise<ShipaManualCreateResult>;
}

/** The canonical server-owned binding of one shipment. */
export interface ShipaCanonicalBinding {
  readonly shipmentId: string;
  readonly orderId: string;
  readonly integrationId: string;
  readonly environment: ShipaEnvironment;
}

/** The exact members of the canonical binding document. */
const CANONICAL_BINDING_KEYS = [
  "shipment_id",
  "order_id",
  "integration_id",
  "environment",
] as const;

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

/**
 * Creates the manual booking composition.
 *
 * The review store is built over the injected client and performs no I/O at
 * construction time. The dispatcher is built only after the keyring was
 * loaded, and it is handed the very same budget the manual phases used.
 */
export function createShipaManualService(
  options: ShipaManualServiceOptions,
): ShipaManualService {
  const client = options.client;
  const loadKeyring = options.loadKeyring;
  const fetchImpl = options.fetchImpl;
  const now = options.now;
  const budgetOptions = options.budgetOptions;

  const reviewStore = createShipaReviewStore({ client });

  /** Builds one budget for one operation. */
  function newBudget(): ShipaExecutionBudget {
    return createShipaExecutionBudget(
      budgetOptions === undefined ? {} : budgetOptions,
    );
  }

  async function preview(
    input: ShipaManualPreviewInput,
  ): Promise<ShipaReviewIntegrityResult> {
    const budget = newBudget();
    try {
      return await budget.run(() =>
        reviewStore.preview({
          actor: input.actor,
          orderId: input.orderId,
          request: input.request,
        })
      );
    } catch (error) {
      throw mapReviewFailure(error);
    } finally {
      budget.dispose();
    }
  }

  async function read(
    input: ShipaManualReadInput,
  ): Promise<ShipaReviewShipmentRead | null> {
    const budget = newBudget();
    try {
      return await budget.run(() =>
        reviewStore.readShipment({
          actor: input.actor,
          shipmentId: input.shipmentId,
        })
      );
    } catch (error) {
      throw mapReviewFailure(error);
    } finally {
      budget.dispose();
    }
  }

  async function create(
    input: ShipaManualCreateInput,
  ): Promise<ShipaManualCreateResult> {
    // ONE admission budget covers review, canonical lookup, key load and the
    // dispatch admission. No pre-dispatch phase resets the fifteen seconds.
    const budget = newBudget();
    let intent: ShipaIntentReceipt | undefined;
    try {
      const summary = await requestManual(budget, input);
      intent = { id: summary.shipmentId, state: summary.state };
      // The intent is confirmed, but neither read-only lookup nor key loading
      // can create a submission marker. Report their budget expiry truthfully.
      const shipment = {
        shipmentId: summary.shipmentId,
        orderId: input.orderId,
        environment: input.request.environment,
        state: summary.state,
        attemptCount: summary.attemptCount,
        retryCount: summary.retryCount,
        updatedAt: summary.updatedAt,
      };
      let binding: ShipaCanonicalBinding;
      let keyring: IntegrationCredentialKeyring;
      try {
        binding = await resolveCanonicalBinding(
          budget,
          summary,
          input.orderId,
          input.request.environment,
        );
        keyring = await loadKeyringUnderBudget(budget);
      } catch (error) {
        if (isShipaExecutionBudgetError(error)) {
          return {
            shipment,
            dispatch: { status: "not_started", code: "budget_exhausted" },
          };
        }
        throw error;
      }
      const dispatcher = createShipaDispatcher({
        client,
        keyring,
        budget,
        ...(fetchImpl !== undefined ? { fetchImpl } : {}),
        ...(now !== undefined ? { now } : {}),
      });
      const dispatch = await dispatcher.processShipment({
        shipmentId: binding.shipmentId,
        integrationId: binding.integrationId,
        environment: binding.environment,
      });
      return {
        shipment,
        dispatch,
      };
    } catch (error) {
      // Only the strictly parsed SQL acknowledgement establishes this receipt.
      // Preserve existing HTTP error semantics; never invent a receipt for an
      // unacknowledged intent or trust a browser/upstream error's metadata.
      if (intent !== undefined) {
        throw new ShipaShipmentError(
          mapShipaShipmentFailure(error).code,
          intent,
        );
      }
      throw error;
    } finally {
      budget.dispose();
    }
  }

  /**
   * Runs the one manual review request.
   *
   * A lost answer may already have committed the intent, so an unusable
   * answer is an uncertain operation and never a plain failure: the staff
   * member has to reload the canonical state, and nothing is dispatched later
   * when the abandoned promise resolves.
   */
  async function requestManual(
    budget: ShipaExecutionBudget,
    input: ShipaManualCreateInput,
  ): Promise<ShipaSubmissionSafeSummary> {
    let reviewInvoked = false;
    try {
      return await budget.run(() => {
        reviewInvoked = true;
        return reviewStore.requestManual({
          actor: input.actor,
          orderId: input.orderId,
          request: input.request,
        });
      });
    } catch (error) {
      if (isShipaExecutionBudgetError(error)) {
        throw new ShipaShipmentError(
          reviewInvoked ? "operation_uncertain" : "unavailable",
        );
      }
      if (error instanceof ShipaReviewError) {
        if (error.code === "unavailable" || error.code === "invalid_response") {
          throw new ShipaShipmentError("operation_uncertain");
        }
        throw new ShipaShipmentError(error.code);
      }
      throw error;
    }
  }

  /**
   * Resolves the canonical binding of the shipment the review produced.
   *
   * The lookup is read-only and it never expires a lease. A missing, a
   * malformed and a mismatched binding are all refused before the keyring is
   * loaded and before any provider request becomes possible.
   */
  async function resolveCanonicalBinding(
    budget: ShipaExecutionBudget,
    summary: ShipaSubmissionSafeSummary,
    orderId: string,
    environment: ShipaEnvironment,
  ): Promise<ShipaCanonicalBinding> {
    let data: unknown;
    try {
      data = await budget.run(() =>
        callCanonicalBinding(client, summary.shipmentId)
      );
    } catch (error) {
      if (error instanceof ShipaShipmentError) throw error;
      if (error instanceof ShipaReviewError) {
        throw new ShipaShipmentError(error.code);
      }
      throw error;
    }
    return requireCanonicalBinding(data, {
      shipmentId: summary.shipmentId,
      orderId,
      environment,
    });
  }

  /**
   * Loads the keyring under the shared budget.
   *
   * A key failure is a safe failure: it is never a retry and never a booking.
   */
  async function loadKeyringUnderBudget(
    budget: ShipaExecutionBudget,
  ): Promise<IntegrationCredentialKeyring> {
    try {
      return await budget.run(() => loadKeyring());
    } catch (error) {
      if (error instanceof ShipaShipmentError) throw error;
      if (error instanceof ShipaReviewError) {
        throw new ShipaShipmentError(error.code);
      }
      throw error;
    }
  }

  return { preview, read, create };
}

// ---------------------------------------------------------------------------
// The canonical binding
// ---------------------------------------------------------------------------

/**
 * Performs the one canonical binding lookup.
 *
 * A rejected transport is an unavailable service: the lookup is read-only, so
 * nothing was committed. The SQL error and the answer itself are never
 * returned.
 */
async function callCanonicalBinding(
  client: ShipaManualRpcClient,
  shipmentId: string,
): Promise<unknown> {
  let response: unknown;
  try {
    response = await client.rpc("shipa_resolve_dispatch_binding", {
      _shipment_id: shipmentId,
    });
  } catch {
    throw new ShipaShipmentError("unavailable");
  }
  if (
    !isPlainRecord(response) ||
    !Object.prototype.hasOwnProperty.call(response, "data") ||
    !Object.prototype.hasOwnProperty.call(response, "error")
  ) {
    throw new ShipaShipmentError("invalid_response");
  }
  if (response["error"] !== null) {
    throw mapShipaReviewSqlError(response["error"]);
  }
  return response["data"];
}

/**
 * Validates the canonical binding against the reviewed order.
 *
 * The document has exactly four members. The shipment, the order and the
 * environment have to agree with the review that produced it, and the
 * integration has to be a real UUID. The integration and the environment
 * come from here and never from the request.
 */
function requireCanonicalBinding(
  raw: unknown,
  expected: {
    readonly shipmentId: string;
    readonly orderId: string;
    readonly environment: ShipaEnvironment;
  },
): ShipaCanonicalBinding {
  if (raw === null) {
    throw new ShipaShipmentError("not_found");
  }
  if (!isPlainRecord(raw)) {
    throw new ShipaShipmentError("invalid_response");
  }
  if (!hasExactRecordKeys(raw, [...CANONICAL_BINDING_KEYS])) {
    throw new ShipaShipmentError("invalid_response");
  }

  const shipmentId = readUuid(raw["shipment_id"]);
  const orderId = readUuid(raw["order_id"]);
  const integrationId = readUuid(raw["integration_id"]);
  const environment = raw["environment"];
  if (
    shipmentId === null ||
    orderId === null ||
    integrationId === null ||
    !isIntegrationUuid(integrationId) ||
    !isShipaEnvironment(environment)
  ) {
    throw new ShipaShipmentError("invalid_response");
  }
  if (
    shipmentId !== expected.shipmentId ||
    orderId !== expected.orderId ||
    environment !== expected.environment
  ) {
    throw new ShipaShipmentError("conflict");
  }
  return { shipmentId, orderId, integrationId, environment };
}

// ---------------------------------------------------------------------------
// The failure mapping
// ---------------------------------------------------------------------------

/** Maps a failure of a read-only review operation. */
function mapReviewFailure(error: unknown): ShipaShipmentError {
  if (error instanceof ShipaShipmentError) return error;
  if (error instanceof ShipaReviewError) {
    return new ShipaShipmentError(error.code);
  }
  return new ShipaShipmentError("unavailable");
}
