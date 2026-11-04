import { assertEquals } from "jsr:@std/assert@1.0.19";
import { createShipaDispatcher } from "../../_shared/shipa-dispatch.ts";
import { createShipaExecutionBudget } from "../../_shared/shipa-execution-budget.ts";
import { createShipaManualService } from "../../_shared/shipa-manual-service.ts";
import { parseShipaReviewManualRequest } from "../../_shared/shipa-review-validation.ts";
import {
  createAcceptedFixture,
  createAcceptedProviderFetch,
  createBeginResponder,
  createFakeFetch,
  createSummaryResponder,
  jsonResponse,
  queueCredentialDocument,
  SHIPA_TEST_DISPATCH_INPUT,
} from "./shipa-dispatch-fixtures.ts";
import {
  createFakeShipaSubmissionRpcClient,
  createSyntheticKeyring,
  createTestPreparationDocument,
} from "./shipa-submission-fixtures.ts";
import {
  createFakeExecutionScheduler,
  createTestCanonicalBinding,
  SHIPA_TEST_MANUAL_NOW_MS,
} from "./shipa-manual-fixtures.ts";
import {
  createTestManualRequest,
  createTestSummaryDocument,
  SHIPA_TEST_REVIEW_ACTOR,
  SHIPA_TEST_REVIEW_ORDER_ID,
} from "./shipa-review-fixtures.ts";

// Real crypto, parsers, stores, adapter and dispatcher; only SDK/fetch/clock
// boundaries are synthetic. No provider request or credential is real.
for (const interruption of ["browser_abort", "item_deadline"] as const) {
  Deno.test(`review: accepted booking survives ${interruption}`, async () => {
    const client = createFakeShipaSubmissionRpcClient();
    const { keyring } = await createSyntheticKeyring();
    const scheduler = createFakeExecutionScheduler();
    const controller = new AbortController();
    const budget = createShipaExecutionBudget({
      clock: scheduler.clock,
      timer: scheduler.timer,
      signal: controller.signal,
    });
    const provider = createFakeFetch(() => {
      if (interruption === "browser_abort") controller.abort();
      else scheduler.advance(15_000);
      return jsonResponse(createAcceptedFixture());
    });
    await queueCredentialDocument(client, keyring);
    client.queue({ data: createTestPreparationDocument() });
    client.queueResponder(createBeginResponder());
    client.queueResponder(createSummaryResponder());
    const dispatcher = createShipaDispatcher({
      client,
      keyring,
      fetchImpl: provider.fetch,
      now: () => SHIPA_TEST_MANUAL_NOW_MS,
      budget,
    });
    try {
      const result = await dispatcher.processShipment(
        SHIPA_TEST_DISPATCH_INPUT,
      );
      assertEquals(result.status, "created");
      assertEquals(provider.requests.length, 1);
      const begin = client.calls.filter((c) =>
        c.fn === "shipa_begin_submission"
      );
      const complete = client.calls.filter((c) => c.fn === "shipa_complete");
      assertEquals(begin.length, 1);
      assertEquals(complete.length, 1);
      assertEquals(
        complete[0].args._attempt_token,
        begin[0].args._attempt_token,
      );
      assertEquals(complete[0].args._result, {
        outcome: "accepted",
        shipaRef: "SR-2026-0001",
        orderStatus: "Created",
      });
    } finally {
      budget.dispose();
    }
  });
}

Deno.test("review: browser abort during completion preserves acceptance once", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const controller = new AbortController();
  const budget = createShipaExecutionBudget({ signal: controller.signal });
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queueResponder(createBeginResponder());
  const completion = client.queueDeferred();
  const dispatcher = createShipaDispatcher({
    client,
    keyring,
    budget,
    fetchImpl: provider.fetch,
    now: () => SHIPA_TEST_MANUAL_NOW_MS,
  });
  try {
    const pending = dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);
    await completion.called;
    controller.abort();
    completion.resolve(createSummaryResponder()("shipa_complete", {}));
    assertEquals((await pending).status, "created");
    assertEquals(provider.requests.length, 1);
    assertEquals(
      client.calls.filter((c) => c.fn === "shipa_complete").length,
      1,
    );
  } finally {
    budget.dispose();
  }
});

Deno.test("review: begin cannot consume the provider settlement reserve", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const scheduler = createFakeExecutionScheduler();
  const budget = createShipaExecutionBudget({
    clock: scheduler.clock,
    timer: scheduler.timer,
  });
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queueResponder(createBeginResponder());
  const dispatcher = createShipaDispatcher({
    client,
    keyring,
    budget,
    fetchImpl: provider.fetch,
    now: () => {
      scheduler.advance(12_000);
      return SHIPA_TEST_MANUAL_NOW_MS;
    },
  });
  try {
    assertEquals(await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT), {
      status: "uncertain",
      code: "budget_exhausted",
    });
    assertEquals(
      client.calls.filter((c) => c.fn === "shipa_begin_submission").length,
      1,
    );
    assertEquals(provider.requests.length, 0);
    assertEquals(
      client.calls.filter((c) => c.fn === "shipa_complete").length,
      0,
    );
  } finally {
    budget.dispose();
  }
});

Deno.test("review: begin refused before invocation is not_started", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  const budget = createShipaExecutionBudget();
  let calls = 0;
  const dispatcher = createShipaDispatcher({
    client,
    keyring,
    fetchImpl: provider.fetch,
    now: () => SHIPA_TEST_MANUAL_NOW_MS,
    budget: {
      ...budget,
      run<T>(operation: () => PromiseLike<T>): Promise<T> {
        calls += 1;
        // Credential and preparation completed; validation consumed the
        // remaining time before the lazy begin could be invoked.
        if (calls === 3) budget.abandon("timeout");
        return budget.run(operation);
      },
    },
  });
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  try {
    assertEquals(await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT), {
      status: "not_started",
      code: "budget_exhausted",
    });
    assertEquals(client.calls.map((c) => c.fn), [
      "shipa_read_credential",
      "shipa_prepare_submission",
    ]);
    assertEquals(provider.requests.length, 0);
  } finally {
    budget.dispose();
  }
});

for (const phase of ["canonical", "keyring"] as const) {
  Deno.test(`review: ${phase} timeout preserves intent without dispatch`, async () => {
    const client = createFakeShipaSubmissionRpcClient();
    const { keyring } = await createSyntheticKeyring();
    const provider = createAcceptedProviderFetch();
    const scheduler = createFakeExecutionScheduler();
    client.queue({
      data: createTestSummaryDocument({
        state: "queued",
        attemptCount: 0,
        shipaRef: null,
        retryAt: null,
      }),
    });
    const deferred = phase === "canonical" ? client.queueDeferred() : null;
    if (phase === "keyring") {
      client.queue({ data: createTestCanonicalBinding() });
    }
    let signalKeyStarted!: () => void;
    const keyStarted = new Promise<void>((resolve) =>
      signalKeyStarted = resolve
    );
    let finishKey!: (value: typeof keyring) => void;
    const lateKey = new Promise<typeof keyring>((resolve) =>
      finishKey = resolve
    );
    const service = createShipaManualService({
      client,
      loadKeyring: () => {
        signalKeyStarted();
        return lateKey;
      },
      fetchImpl: provider.fetch,
      budgetOptions: { clock: scheduler.clock, timer: scheduler.timer },
    });
    const parsed = parseShipaReviewManualRequest(createTestManualRequest());
    if (!parsed.ok) throw new Error("Invalid synthetic manual request");
    const pending = service.create({
      actor: SHIPA_TEST_REVIEW_ACTOR,
      orderId: SHIPA_TEST_REVIEW_ORDER_ID,
      request: parsed.value,
    });
    // Observe the rejection immediately too: no unhandled promise on red.
    const observed = pending.then((value) => value, (error: unknown) => error);
    await (deferred?.called ?? keyStarted);
    scheduler.advance(15_000);
    const result = await observed;
    if (deferred) deferred.resolve({ data: createTestCanonicalBinding() });
    finishKey(keyring);
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(result instanceof Error, false);
    assertEquals(
      (result as Awaited<ReturnType<typeof service.create>>).dispatch,
      {
        status: "not_started",
        code: "budget_exhausted",
      },
    );
    assertEquals(
      (result as Awaited<ReturnType<typeof service.create>>).shipment.state,
      "queued",
    );
    assertEquals(client.calls.map((c) => c.fn), [
      "shipa_request_manual",
      "shipa_resolve_dispatch_binding",
    ]);
    assertEquals(provider.requests.length, 0);
  });
}
