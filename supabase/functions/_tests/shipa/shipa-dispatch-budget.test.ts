// Behavioural tests for the bounded execution of the Shipa dispatcher.
//
// The real dispatcher, the real credential loader, the real submission store,
// the real strict parsers, the real adapter builder, the real HTTP client,
// the real budget helper and the native crypto do the work here. Only three
// boundaries are faked: the database client, the provider fetch and the
// clock/timer of the execution budget.
//
// No test in this file reaches the real network, reads an environment
// variable or uses a real credential. The clock is virtual, so a test never
// waits for fifteen or fifty seconds.

import { assertEquals } from "jsr:@std/assert@1.0.19";

import { createShipaDispatcher } from "../../_shared/shipa-dispatch.ts";
import {
  createShipaExecutionBudget,
} from "../../_shared/shipa-execution-budget.ts";
import type { IntegrationCredentialKeyring } from "../../_shared/integration-credentials.ts";
import {
  createFakeShipaSubmissionRpcClient,
  createSyntheticKeyring,
  createTestBeginDocument,
  createTestPreparationDocument,
  type FakeShipaSubmissionRpcClient,
} from "./shipa-submission-fixtures.ts";
import {
  parseShipaReviewManualRequest,
} from "../../_shared/shipa-review-validation.ts";
import type { ShipaReviewManualRequest } from "../../_shared/shipa-review-contract.ts";
import {
  createAcceptedProviderFetch,
  createBeginResponder,
  createFailingProviderFetch,
  createSummaryResponder,
  type FakeFetch,
  queueCredentialDocument,
  SHIPA_TEST_DISPATCH_INPUT,
} from "./shipa-dispatch-fixtures.ts";
import {
  createFakeExecutionScheduler,
  createManualHarness,
  createTestCanonicalBinding,
  SHIPA_TEST_MANUAL_NOW_MS,
} from "./shipa-manual-fixtures.ts";
import { ShipaShipmentError } from "../../_shared/shipa-shipment-actions.ts";
import { createStoredCredentialDocument } from "./shipa-credential-loader-fixtures.ts";
import {
  createTestManualRequest,
  createTestSummaryDocument,
  SHIPA_TEST_REVIEW_ACTOR,
  SHIPA_TEST_REVIEW_ORDER_ID,
} from "./shipa-review-fixtures.ts";

/** The item budget of the injected budgets, in milliseconds. */
const ITEM_BUDGET_MS = 15_000;

/** The harness of one dispatcher run. */
interface BudgetHarness {
  readonly client: FakeShipaSubmissionRpcClient;
  readonly keyring: IntegrationCredentialKeyring;
  readonly provider: FakeFetch;
  readonly dispatcher: ReturnType<typeof createShipaDispatcher>;
  readonly scheduler: ReturnType<typeof createFakeExecutionScheduler>;
}

/**
 * Builds one dispatcher harness.
 *
 * The budget is injected, so the test can spend it at a chosen moment.
 */
async function createHarness(
  options: {
    readonly provider?: FakeFetch;
    readonly itemBudgetMs?: number;
    readonly now?: () => number;
  } = {},
): Promise<BudgetHarness> {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = options.provider ?? createAcceptedProviderFetch();
  const scheduler = createFakeExecutionScheduler();
  const budget = createShipaExecutionBudget({
    clock: scheduler.clock,
    timer: scheduler.timer,
    itemBudgetMs: options.itemBudgetMs ?? ITEM_BUDGET_MS,
  });
  const dispatcher = createShipaDispatcher({
    client,
    keyring,
    fetchImpl: provider.fetch,
    now: options.now ?? (() => SHIPA_TEST_MANUAL_NOW_MS),
    budget,
  });
  return { client, keyring, provider, dispatcher, scheduler };
}

/** The names of the calls the code under test made. */
function calledNames(client: FakeShipaSubmissionRpcClient): readonly string[] {
  return client.calls.map((call) => call.fn);
}

// ---------------------------------------------------------------------------
// The delayed calls
// ---------------------------------------------------------------------------

Deno.test("a delayed begin never reaches the provider", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  const scheduler = createFakeExecutionScheduler();
  const budget = createShipaExecutionBudget({
    clock: scheduler.clock,
    timer: scheduler.timer,
    itemBudgetMs: ITEM_BUDGET_MS,
  });

  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  const deferred = client.queueDeferred();

  const dispatcher = createShipaDispatcher({
    client,
    keyring,
    fetchImpl: provider.fetch,
    now: () => SHIPA_TEST_MANUAL_NOW_MS,
    budget,
  });

  const pending = dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);
  await deferred.called;
  scheduler.advance(ITEM_BUDGET_MS);
  const result = await pending;

  assertEquals(result.status, "uncertain");
  assertEquals(
    calledNames(client).filter((name) => name === "shipa_begin_submission")
      .length,
    1,
    "the begin is called exactly once",
  );
  assertEquals(provider.requests.length, 0, "no provider request may happen");
  assertEquals(
    calledNames(client).filter((name) => name === "shipa_complete").length,
    0,
    "no completion may be written",
  );

  // The abandoned begin answers afterwards. It must not acquire provider
  // authority and it must not start a second attempt.
  deferred.resolve({ data: createTestBeginDocument() });
  await Promise.resolve();
  await Promise.resolve();
  assertEquals(provider.requests.length, 0, "no late provider request");
  assertEquals(
    calledNames(client).filter((name) => name === "shipa_begin_submission")
      .length,
    1,
    "no second begin",
  );
});

Deno.test("a delayed credential never reaches the begin", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  const scheduler = createFakeExecutionScheduler();
  const budget = createShipaExecutionBudget({
    clock: scheduler.clock,
    timer: scheduler.timer,
    itemBudgetMs: ITEM_BUDGET_MS,
  });

  const deferred = client.queueDeferred();
  const dispatcher = createShipaDispatcher({
    client,
    keyring,
    fetchImpl: provider.fetch,
    now: () => SHIPA_TEST_MANUAL_NOW_MS,
    budget,
  });

  const pending = dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);
  await deferred.called;
  scheduler.advance(ITEM_BUDGET_MS);
  const result = await pending;

  assertEquals(result.status, "not_started");
  assertEquals(result.code, "budget_exhausted");
  assertEquals(
    calledNames(client).filter((name) => name === "shipa_begin_submission")
      .length,
    0,
    "the begin must not be called",
  );
  assertEquals(provider.requests.length, 0, "no provider request may happen");
});

Deno.test("a delayed preparation never reaches the begin", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  const scheduler = createFakeExecutionScheduler();
  const budget = createShipaExecutionBudget({
    clock: scheduler.clock,
    timer: scheduler.timer,
    itemBudgetMs: ITEM_BUDGET_MS,
  });

  await queueCredentialDocument(client, keyring);
  const deferred = client.queueDeferred();
  const dispatcher = createShipaDispatcher({
    client,
    keyring,
    fetchImpl: provider.fetch,
    now: () => SHIPA_TEST_MANUAL_NOW_MS,
    budget,
  });

  const pending = dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);
  await deferred.called;
  scheduler.advance(ITEM_BUDGET_MS);
  const result = await pending;

  assertEquals(result.status, "not_started");
  assertEquals(result.code, "budget_exhausted");
  assertEquals(
    calledNames(client).filter((name) => name === "shipa_begin_submission")
      .length,
    0,
    "the begin must not be called",
  );
  assertEquals(provider.requests.length, 0, "no provider request may happen");
});

// ---------------------------------------------------------------------------
// The provider
// ---------------------------------------------------------------------------

Deno.test("never invokes the provider when the item budget is spent", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  const scheduler = createFakeExecutionScheduler();
  const budget = createShipaExecutionBudget({
    clock: scheduler.clock,
    timer: scheduler.timer,
    itemBudgetMs: ITEM_BUDGET_MS,
  });

  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queueResponder(createBeginResponder());

  const dispatcher = createShipaDispatcher({
    client,
    keyring,
    fetchImpl: provider.fetch,
    // The wall-clock lease check is the last thing that runs before the
    // provider request, so the item budget is spent right here. The lease
    // itself stays valid: it is the budget clock that moves.
    now: () => {
      scheduler.advance(ITEM_BUDGET_MS + 1);
      return SHIPA_TEST_MANUAL_NOW_MS;
    },
    budget,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "uncertain");
  assertEquals(result.code, "budget_exhausted");
  assertEquals(provider.requests.length, 0, "no provider request may happen");
  assertEquals(
    calledNames(client).filter((name) => name === "shipa_complete").length,
    0,
    "no completion may be written",
  );
});

Deno.test("a provider failure is uncertain and is never retried", async () => {
  const harness = await createHarness({
    provider: createFailingProviderFetch(500),
  });
  const { client, provider } = harness;

  await queueCredentialDocument(client, harness.keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queueResponder(createBeginResponder());
  client.queueResponder(createSummaryResponder({
    state: "unknown",
    shipaRef: null,
    providerStatus: null,
  }));

  const result = await harness.dispatcher.processShipment(
    SHIPA_TEST_DISPATCH_INPUT,
  );

  assertEquals(result.status, "uncertain");
  assertEquals(provider.requests.length, 1, "exactly one provider request");
  assertEquals(
    calledNames(client).filter((name) => name === "shipa_complete").length,
    1,
    "exactly one completion",
  );
});

Deno.test("a completion that loses its answer is never resent", async () => {
  const harness = await createHarness();
  const { client, provider } = harness;

  await queueCredentialDocument(client, harness.keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queueResponder(createBeginResponder());
  const deferred = client.queueDeferred();

  const pending = harness.dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);
  await deferred.called;
  harness.scheduler.advance(ITEM_BUDGET_MS);
  const result = await pending;

  assertEquals(result.status, "persistence_uncertain");
  assertEquals(provider.requests.length, 1, "exactly one provider request");
  assertEquals(
    calledNames(client).filter((name) => name === "shipa_complete").length,
    1,
    "the completion is written exactly once",
  );

  deferred.resolve({ data: createTestSummaryDocument({ state: "created" }) });
  await Promise.resolve();
  await Promise.resolve();
  assertEquals(provider.requests.length, 1, "no resend of the booking");
  assertEquals(
    calledNames(client).filter((name) => name === "shipa_complete").length,
    1,
    "no resend of the completion",
  );
});

// ---------------------------------------------------------------------------
// The fresh invocation
// ---------------------------------------------------------------------------

Deno.test("a fresh invocation performs one create and one completion", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();

  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queueResponder(createBeginResponder());
  client.queueResponder(createSummaryResponder());

  // No budget is injected: the core creates its own, and every invocation
  // gets a fresh one.
  const dispatcher = createShipaDispatcher({
    client,
    keyring,
    fetchImpl: provider.fetch,
    now: () => SHIPA_TEST_MANUAL_NOW_MS,
  });

  const result = await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);

  assertEquals(result.status, "created");
  assertEquals(provider.requests.length, 1, "exactly one provider request");
  assertEquals(
    calledNames(client).filter((name) => name === "shipa_complete").length,
    1,
    "exactly one completion",
  );
});

Deno.test("an exhausted shared budget stops the core before any call", async () => {
  const harness = await createHarness({ itemBudgetMs: 0 });

  const result = await harness.dispatcher.processShipment(
    SHIPA_TEST_DISPATCH_INPUT,
  );

  assertEquals(result.status, "not_started");
  assertEquals(result.code, "budget_exhausted");
  assertEquals(harness.client.calls.length, 0, "no database call may happen");
  assertEquals(harness.provider.requests.length, 0);
});

// ---------------------------------------------------------------------------
// The shared item
// ---------------------------------------------------------------------------

Deno.test("partial review time is still charged when the core loads its credential", async () => {
  const harness = await createManualHarness();
  const reviewing = harness.client.queueDeferred();
  harness.client.queue({ data: createTestCanonicalBinding() });
  const loading = harness.client.queueDeferred();
  harness.client.queue({ data: createTestPreparationDocument() });
  harness.client.queueResponder(createBeginResponder());
  harness.client.queueResponder(createSummaryResponder());
  const document = await createStoredCredentialDocument({
    keyring: harness.keyring,
    keyVersion: 1,
  });
  const pending = harness.service.create({
    actor: SHIPA_TEST_REVIEW_ACTOR,
    orderId: SHIPA_TEST_REVIEW_ORDER_ID,
    request: parseManualRequest(),
  });
  await reviewing.called;
  harness.scheduler.advance(8_000);
  reviewing.resolve({
    data: createTestSummaryDocument({
      state: "queued",
      attemptCount: 0,
      shipaRef: null,
    }),
  });
  await loading.called;
  harness.scheduler.advance(8_000);
  loading.resolve({ data: document });
  const result = await pending;
  assertEquals(result.dispatch, {
    status: "not_started",
    code: "budget_exhausted",
  });
  assertEquals(harness.client.calls.map((call) => call.fn), [
    "shipa_request_manual",
    "shipa_resolve_dispatch_binding",
    "shipa_read_credential",
  ]);
  assertEquals(harness.provider.requests.length, 0);
});

Deno.test("the review, the key and the core share one budget", async () => {
  const harness = await createManualHarness();
  // Only the manual request is queued. The item budget is spent during it,
  // so the canonical lookup, the key load and the core never start.
  const deferred = harness.client.queueDeferred();

  const pending = harness.service.create({
    actor: SHIPA_TEST_REVIEW_ACTOR,
    orderId: SHIPA_TEST_REVIEW_ORDER_ID,
    request: parseManualRequest(),
  }).then(
    () => "resolved",
    (error: unknown) =>
      error instanceof ShipaShipmentError ? error.code : "other",
  );

  await deferred.called;
  harness.scheduler.advance(ITEM_BUDGET_MS);
  const outcome = await pending;

  assertEquals(outcome, "operation_uncertain");
  assertEquals(
    harness.keyringCalls(),
    0,
    "the keyring must not be loaded after the budget is spent",
  );
  assertEquals(harness.provider.requests.length, 0, "no provider request");
  assertEquals(
    harness.client.calls.map((call) => call.fn).includes(
      "shipa_resolve_dispatch_binding",
    ),
    false,
    "the canonical lookup must not run",
  );
});

Deno.test("a lost manual answer never triggers a late dispatch", async () => {
  const harness = await createManualHarness();
  const deferred = harness.client.queueDeferred();

  const pending = harness.service.create({
    actor: SHIPA_TEST_REVIEW_ACTOR,
    orderId: SHIPA_TEST_REVIEW_ORDER_ID,
    request: parseManualRequest(),
  }).then(
    () => "resolved",
    (error: unknown) =>
      error instanceof ShipaShipmentError ? error.code : "other",
  );

  await deferred.called;
  harness.scheduler.advance(ITEM_BUDGET_MS);
  assertEquals(await pending, "operation_uncertain");

  // The abandoned manual call answers afterwards. The intent may have
  // committed, so the answer is uncertain, and nothing is dispatched when
  // the promise resolves.
  deferred.resolve({ data: createTestSummaryDocument() });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assertEquals(harness.keyringCalls(), 0, "no keyring load");
  assertEquals(harness.provider.requests.length, 0, "no late provider request");
  assertEquals(
    harness.client.calls.map((call) => call.fn).includes(
      "shipa_resolve_dispatch_binding",
    ),
    false,
    "no late canonical lookup",
  );
});

// ---------------------------------------------------------------------------
// The small helpers
// ---------------------------------------------------------------------------

/** The parsed manual request of the manual composition. */
function parseManualRequest(): ShipaReviewManualRequest {
  const parsed = parseShipaReviewManualRequest(createTestManualRequest());
  if (!parsed.ok) {
    throw new Error("The synthetic manual request must be valid.");
  }
  return parsed.value;
}
