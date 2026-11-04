// Synthetic fixtures for the Shipa manual booking composition.
//
// Everything in this file is fabricated. The order, shipment, integration and
// actor ids are made-up UUIDs, the fingerprints are invented strings and the
// SQL errors carry invented text. No real id, key, credential, customer
// address, account value or personal data exists anywhere below.
//
// Only three boundaries are faked: the database client, the provider fetch
// and the clock/timer of the execution budget. The real review store, the
// real strict parsers, the real credential loader, the real Web Crypto
// operations, the real dispatcher, the real budget helper and the real
// adapter are the production modules.

import type { IntegrationCredentialKeyring } from "../../_shared/integration-credentials.ts";
import {
  createShipaManualService,
  type ShipaManualService,
} from "../../_shared/shipa-manual-service.ts";
import type {
  ShipaExecutionClock,
  ShipaExecutionTimer,
} from "../../_shared/shipa-execution-budget.ts";
import {
  createAcceptedProviderFetch,
  createBeginResponder,
  createSummaryResponder,
  type FakeFetch,
  queueCredentialDocument,
} from "./shipa-dispatch-fixtures.ts";
import {
  createFakeShipaSubmissionRpcClient,
  createSyntheticKeyring,
  createTestPreparationDocument,
  type FakeShipaSubmissionRpcClient,
  SHIPA_TEST_INTEGRATION_ID,
  type TestPreparationOptions,
  type TestSummaryOptions,
} from "./shipa-submission-fixtures.ts";
import {
  createTestSummaryDocument,
  SHIPA_TEST_REVIEW_ORDER_ID,
  SHIPA_TEST_REVIEW_SHIPMENT_ID,
  type TestSummaryOptions as TestManualSummaryOptions,
} from "./shipa-review-fixtures.ts";
import {
  createFakeShipaAuthClient,
  type FakeAuthUserOutcome,
  type FakeRoleOutcome,
  type RecordedAuthCall,
  type RecordedRoleQuery,
} from "./shipa-auth-fixtures.ts";
import type {
  FakeShipaRpcOutcome,
  RecordedShipaRpcCall,
} from "./shipa-configuration-service-fixtures.ts";
import type {
  ShipaAuthGetUser,
  ShipaAuthRoleTable,
} from "../../_shared/shipa-auth.ts";

// ---------------------------------------------------------------------------
// The deterministic clock and timer
// ---------------------------------------------------------------------------

/** A deterministic clock and timer for the execution budget. */
export interface FakeExecutionScheduler {
  readonly clock: ShipaExecutionClock;
  readonly timer: ShipaExecutionTimer;
  /** Moves the virtual clock forward and fires every due timer. */
  advance(ms: number): void;
  /** How many timers are still armed. */
  pending(): number;
  /** How many timers were cancelled. */
  cancelled(): number;
}

/**
 * Creates the deterministic clock and timer.
 *
 * The clock only moves when a test moves it, and a timer fires when the
 * clock reaches its deadline. Nothing here uses a real timer, so a test
 * never waits for fifteen or fifty seconds.
 */
export function createFakeExecutionScheduler(): FakeExecutionScheduler {
  let now = 0;
  let nextHandle = 1;
  const scheduled = new Map<number, { at: number; callback: () => void }>();
  let cancelledCount = 0;

  const clock: ShipaExecutionClock = {
    now: () => now,
  };
  const timer: ShipaExecutionTimer = {
    schedule(callback: () => void, delayMs: number): number {
      const handle = nextHandle;
      nextHandle += 1;
      scheduled.set(handle, { at: now + delayMs, callback });
      return handle;
    },
    cancel(handle: number): void {
      scheduled.delete(handle);
      cancelledCount += 1;
    },
  };

  return {
    clock,
    timer,
    advance(ms: number): void {
      now += ms;
      for (;;) {
        let dueHandle: number | null = null;
        let dueAt = Number.POSITIVE_INFINITY;
        for (const [handle, entry] of scheduled) {
          if (entry.at <= now && entry.at < dueAt) {
            dueAt = entry.at;
            dueHandle = handle;
          }
        }
        if (dueHandle === null) break;
        const entry = scheduled.get(dueHandle);
        if (entry === undefined) break;
        scheduled.delete(dueHandle);
        entry.callback();
      }
    },
    pending(): number {
      return scheduled.size;
    },
    cancelled(): number {
      return cancelledCount;
    },
  };
}

// ---------------------------------------------------------------------------
// The canonical binding
// ---------------------------------------------------------------------------

/** The options of a synthetic canonical binding document. */
export interface TestCanonicalBindingOptions {
  readonly shipmentId?: string;
  readonly orderId?: string;
  readonly integrationId?: string;
  readonly environment?: string;
  readonly extra?: Record<string, unknown>;
}

/**
 * The exact four-member canonical binding document.
 *
 * The extra members let a test build a document that carries a fifth key,
 * which the canonical contract refuses.
 */
export function createTestCanonicalBinding(
  options: TestCanonicalBindingOptions = {},
): Record<string, unknown> {
  return {
    shipment_id: options.shipmentId ?? SHIPA_TEST_REVIEW_SHIPMENT_ID,
    order_id: options.orderId ?? SHIPA_TEST_REVIEW_ORDER_ID,
    integration_id: options.integrationId ?? SHIPA_TEST_INTEGRATION_ID,
    environment: options.environment ?? "sandbox",
    ...(options.extra ?? {}),
  };
}

// ---------------------------------------------------------------------------
// The fake shipment client
// ---------------------------------------------------------------------------

/**
 * A responder that sees the arguments of the call before it answers.
 *
 * It is how a test answers a begin with the attempt token the execution core
 * generated for that attempt, without the test knowing the token in advance.
 */
export type FakeShipaRpcResponder = (
  args: Record<string, unknown>,
) => FakeShipaRpcOutcome;

/** The fake SDK boundary of the shipment endpoint. */
export interface FakeShipaShipmentClient {
  readonly auth: ShipaAuthGetUser;
  from(table: string): ShipaAuthRoleTable;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<unknown>;
  /** Every session lookup the handler made, in order. */
  readonly authCalls: readonly RecordedAuthCall[];
  /** Every role query the handler made, in order. */
  readonly roleQueries: readonly RecordedRoleQuery[];
  /** Every database call the handler made, in order. */
  readonly calls: readonly RecordedShipaRpcCall[];
  /** Queues the outcome of the next session lookup. */
  queueUser(outcome: FakeAuthUserOutcome): void;
  /** Queues the outcome of the next role query. */
  queueRole(outcome: FakeRoleOutcome): void;
  /** Queues the outcome of the next call of one RPC function. */
  respond(fn: string, outcome: FakeShipaRpcOutcome): void;
  /** Queues a responder for the next call of one RPC function. */
  respondWith(fn: string, responder: FakeShipaRpcResponder): void;
  /** The names of the RPC functions the handler called, in order. */
  calledFunctions(): readonly string[];
}

/**
 * Creates the fake SDK boundary of the shipment endpoint.
 *
 * It combines the verified session lookup, the role query and the RPC calls
 * into one client and records every one of them. A call that was never
 * queued fails loudly instead of answering silently.
 */
export function createFakeShipaShipmentClient(): FakeShipaShipmentClient {
  const auth = createFakeShipaAuthClient();
  const calls: RecordedShipaRpcCall[] = [];
  const queues = new Map<
    string,
    Array<FakeShipaRpcOutcome | FakeShipaRpcResponder>
  >();

  return {
    auth: auth.auth,
    from: auth.from,
    calls,
    authCalls: auth.authCalls,
    roleQueries: auth.roleQueries,
    queueUser: auth.queueUser,
    queueRole: auth.queueRole,
    respond(fn: string, outcome: FakeShipaRpcOutcome): void {
      const queue = queues.get(fn) ?? [];
      queue.push(outcome);
      queues.set(fn, queue);
    },
    respondWith(fn: string, responder: FakeShipaRpcResponder): void {
      const queue = queues.get(fn) ?? [];
      queue.push(responder);
      queues.set(fn, queue);
    },
    calledFunctions(): readonly string[] {
      return calls.map((call) => call.fn);
    },
    rpc(fn: string, args?: Record<string, unknown>): PromiseLike<unknown> {
      calls.push({ fn, args: args ?? {} });
      const queue = queues.get(fn);
      const next = queue?.shift();
      if (next === undefined) {
        return Promise.reject(new Error(`unexpected rpc: ${fn}`));
      }
      const outcome = typeof next === "function" ? next(args ?? {}) : next;
      if (outcome.rejection !== undefined) {
        return Promise.reject(outcome.rejection);
      }
      if (outcome.raw !== undefined) {
        return Promise.resolve(outcome.raw);
      }
      return Promise.resolve({
        data: outcome.data ?? null,
        error: outcome.error ?? null,
        ...(outcome.extra ?? {}),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// The manual harness
// ---------------------------------------------------------------------------

/** The wall clock the dispatcher uses for the received-lease check. */
export const SHIPA_TEST_MANUAL_NOW = "2026-11-04T00:12:12.967Z";

/** The same clock in milliseconds. */
export const SHIPA_TEST_MANUAL_NOW_MS = Date.parse(SHIPA_TEST_MANUAL_NOW);

/** The options of one manual harness. */
export interface ManualHarnessOptions {
  /** The provider fetch boundary. Defaults to an accepting provider. */
  readonly provider?: FakeFetch;
  /** The item budget of the shared execution budget, in milliseconds. */
  readonly itemBudgetMs?: number;
  /** A failure the lazy keyring loader raises instead of a keyring. */
  readonly keyringFailure?: unknown;
}

/** The composed manual harness. */
export interface FakeShipaManualHarness {
  /** The fake SDK boundary. */
  readonly client: FakeShipaSubmissionRpcClient;
  /** The synthetic keyring. */
  readonly keyring: IntegrationCredentialKeyring;
  /** The fake provider fetch. */
  readonly provider: FakeFetch;
  /** The manual composition under test. */
  readonly service: ShipaManualService;
  /** The deterministic clock and timer of the shared budget. */
  readonly scheduler: FakeExecutionScheduler;
  /** How often the lazy keyring loader was consulted. */
  keyringCalls(): number;
}

/**
 * Builds one manual harness.
 *
 * The queue holds the manual answer, the canonical binding, the credential,
 * the preparation, the begin answer and the completion answer, in the order
 * the composition calls them.
 */
export async function createManualHarness(
  options: ManualHarnessOptions = {},
): Promise<FakeShipaManualHarness> {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = options.provider ?? createAcceptedProviderFetch();
  const scheduler = createFakeExecutionScheduler();
  let keyringCalls = 0;

  const service = createShipaManualService({
    client,
    loadKeyring: () => {
      keyringCalls += 1;
      if (options.keyringFailure !== undefined) {
        return Promise.reject(options.keyringFailure);
      }
      return Promise.resolve(keyring);
    },
    fetchImpl: provider.fetch,
    now: () => SHIPA_TEST_MANUAL_NOW_MS,
    budgetOptions: {
      clock: scheduler.clock,
      timer: scheduler.timer,
      itemBudgetMs: options.itemBudgetMs ?? 15_000,
    },
  });

  return {
    client,
    keyring,
    provider,
    service,
    scheduler,
    keyringCalls: () => keyringCalls,
  };
}

/** The options of one queued manual create path. */
export interface ManualSuccessOptions {
  readonly environment?: "sandbox" | "live";
  readonly shipmentId?: string;
  readonly orderId?: string;
  readonly integrationId?: string;
  /** Overrides of the queued manual summary. */
  readonly manualSummary?: TestManualSummaryOptions;
  /** Overrides of the completion summary. */
  readonly summary?: TestSummaryOptions;
  /** Overrides of the preparation and of the begin answer. */
  readonly preparation?: TestPreparationOptions;
  /** Overrides of the canonical binding document. */
  readonly binding?: TestCanonicalBindingOptions;
}

/**
 * Queues the whole successful manual create path.
 *
 * The order is the contract: the manual request, the canonical binding, the
 * credential, the preparation, the begin answer and the completion answer.
 */
export async function queueManualCreateSuccess(
  client: FakeShipaSubmissionRpcClient,
  keyring: IntegrationCredentialKeyring,
  options: ManualSuccessOptions = {},
): Promise<void> {
  const environment = options.environment ?? "sandbox";
  const shipmentId = options.shipmentId ?? SHIPA_TEST_REVIEW_SHIPMENT_ID;
  const integrationId = options.integrationId ?? SHIPA_TEST_INTEGRATION_ID;
  const orderId = options.orderId ?? SHIPA_TEST_REVIEW_ORDER_ID;

  client.queue({
    data: createTestSummaryDocument({
      shipmentId,
      state: "queued",
      attemptCount: 0,
      shipaRef: null,
      retryAt: null,
      ...(options.manualSummary ?? {}),
    }),
  });

  client.queue({
    data: createTestCanonicalBinding({
      shipmentId,
      orderId,
      integrationId,
      environment,
      ...(options.binding ?? {}),
    }),
  });

  await queueCredentialDocument(client, keyring, {
    environment,
    integrationId,
  });

  const preparation: TestPreparationOptions = {
    shipmentId,
    integrationId,
    environment,
    ...(options.preparation ?? {}),
  };
  client.queue({ data: createTestPreparationDocument(preparation) });
  client.queueResponder(createBeginResponder(preparation));
  client.queueResponder(createSummaryResponder({
    shipmentId,
    ...(options.summary ?? {}),
  }));
}
