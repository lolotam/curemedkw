// Behavioural tests for the Shipa execution budget.
//
// The real budget helper does the work here. Only the clock and the timer
// are faked, so the tests are deterministic and never sleep for fifteen or
// fifty seconds. The production limits are never weakened for a test: the
// real default is asserted next to the injected ones.
//
// The budget is a bounded helper, not a facade: the tests assert what it
// refuses, what it cleans up and what it lets through.

import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";

import {
  createShipaExecutionBudget,
  isShipaExecutionBudgetError,
  SHIPA_EXECUTION_ITEM_BUDGET_MS,
  SHIPA_EXECUTION_PARENT_CAP_MS,
  ShipaExecutionBudgetError,
} from "../../_shared/shipa-execution-budget.ts";
import { createFakeExecutionScheduler } from "./shipa-manual-fixtures.ts";

// ---------------------------------------------------------------------------
// The fake clock and timer
// ---------------------------------------------------------------------------

/** The deterministic clock and timer, shared with the manual fixtures. */
const createFakeScheduler = createFakeExecutionScheduler;

// ---------------------------------------------------------------------------
// The limits
// ---------------------------------------------------------------------------

Deno.test("keeps the item budget at fifteen seconds", () => {
  const scheduler = createFakeScheduler();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 60_000,
    parentCapMs: 120_000,
    clock: scheduler.clock,
    timer: scheduler.timer,
  });
  assertEquals(budget.remainingMs(), SHIPA_EXECUTION_ITEM_BUDGET_MS);
  assertEquals(SHIPA_EXECUTION_ITEM_BUDGET_MS, 15_000);
  assertEquals(SHIPA_EXECUTION_PARENT_CAP_MS, 50_000);
});

Deno.test("lets a smaller parent cap shorten the item", () => {
  const scheduler = createFakeScheduler();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 10_000,
    parentCapMs: 4_000,
    clock: scheduler.clock,
    timer: scheduler.timer,
  });
  assertEquals(budget.remainingMs(), 4_000);
});

// ---------------------------------------------------------------------------
// The refusal
// ---------------------------------------------------------------------------

Deno.test("refuses a lazy operation after the deadline", async () => {
  const scheduler = createFakeScheduler();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 100,
    clock: scheduler.clock,
    timer: scheduler.timer,
  });
  scheduler.advance(200);

  let invoked = false;
  await assertRejects(
    () =>
      budget.run(() => {
        invoked = true;
        return Promise.resolve("never");
      }),
    Error,
    "budget was exhausted",
  );
  assertEquals(invoked, false, "a spent budget must not start a lazy call");
});

Deno.test("refuses a lazy operation after an abort", async () => {
  const scheduler = createFakeScheduler();
  const controller = new AbortController();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 1_000,
    clock: scheduler.clock,
    timer: scheduler.timer,
    signal: controller.signal,
  });
  controller.abort();

  let invoked = false;
  await assertRejects(
    () =>
      budget.run(() => {
        invoked = true;
        return Promise.resolve("never");
      }),
    Error,
    "budget was exhausted",
  );
  assertEquals(invoked, false, "an aborted budget must not start a lazy call");
  assertEquals(budget.abandoned, true);
  assertEquals(budget.reason, "aborted");
});

Deno.test("marks the abandonment irreversibly", async () => {
  const scheduler = createFakeScheduler();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 100,
    clock: scheduler.clock,
    timer: scheduler.timer,
  });
  scheduler.advance(200);

  await assertRejects(() => budget.run(() => Promise.resolve(1)), Error);
  assertEquals(budget.abandoned, true);
  assertEquals(budget.reason, "timeout");
  assertEquals(budget.remainingMs(), 0);

  // A second abandonment never changes the first reason.
  budget.abandon("aborted");
  assertEquals(budget.reason, "timeout");
});

// ---------------------------------------------------------------------------
// The cleanup
// ---------------------------------------------------------------------------

Deno.test("cancels its timer when the operation settles", async () => {
  const scheduler = createFakeScheduler();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 1_000,
    clock: scheduler.clock,
    timer: scheduler.timer,
  });

  const value = await budget.run(() => Promise.resolve("done"));

  assertEquals(value, "done");
  assertEquals(scheduler.pending(), 0, "the timer must not stay armed");
  assertEquals(scheduler.cancelled(), 1);
  assertEquals(budget.abandoned, false);
});

Deno.test("releases the abort listener on disposal", () => {
  const scheduler = createFakeScheduler();
  const controller = new AbortController();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 1_000,
    clock: scheduler.clock,
    timer: scheduler.timer,
    signal: controller.signal,
  });

  budget.dispose();
  controller.abort();

  assertEquals(budget.abandoned, false);
  assertEquals(budget.remainingMs(), 1_000);
});

// ---------------------------------------------------------------------------
// The bounded await
// ---------------------------------------------------------------------------

Deno.test("bounds one await by the remaining time", async () => {
  const scheduler = createFakeScheduler();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 100,
    clock: scheduler.clock,
    timer: scheduler.timer,
  });

  const guarded = budget.guard(
    new Promise<string>(() => {}),
  );
  const settled = guarded.then(
    () => "resolved",
    () => "rejected",
  );

  scheduler.advance(100);
  assertEquals(await settled, "rejected");
  assertEquals(budget.abandoned, true);
  assertEquals(budget.reason, "timeout");
});

Deno.test("never hands a late answer to the caller", async () => {
  const scheduler = createFakeScheduler();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 100,
    clock: scheduler.clock,
    timer: scheduler.timer,
  });

  const deferred = Promise.withResolvers<string>();
  const guarded = budget.guard(deferred.promise);
  const settled = guarded.then(
    () => "resolved",
    (
      error: unknown,
    ) => (isShipaExecutionBudgetError(error) ? "rejected" : "other"),
  );

  scheduler.advance(100);
  assertEquals(await settled, "rejected");

  // The abandoned call answers afterwards. The caller has already been told
  // that the budget is spent, and the late answer changes nothing.
  deferred.resolve("too late");
  await Promise.resolve();
  assertEquals(budget.abandoned, true);
  assertEquals(budget.remainingMs(), 0);
});

// ---------------------------------------------------------------------------
// The broken clock
// ---------------------------------------------------------------------------

Deno.test("a backward clock cannot restore previously consumed time", async () => {
  let now = 0;
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 100,
    clock: { now: () => now },
  });
  now = 60;
  assertEquals(budget.remainingMs(), 40);
  now = 20;
  assertEquals(budget.remainingMs(), 0);
  let calls = 0;
  await assertRejects(() =>
    budget.run(() => {
      calls += 1;
      return Promise.resolve();
    }), ShipaExecutionBudgetError);
  assertEquals(calls, 0);
  budget.dispose();
});

Deno.test("a late answer is refused even before its timer callback runs", async () => {
  let now = 0;
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 100,
    clock: { now: () => now },
  });
  const deferred = Promise.withResolvers<string>();
  const outcome = budget.run(() => deferred.promise).then(
    () => "resolved",
    (error: unknown) =>
      isShipaExecutionBudgetError(error) ? "rejected" : "other",
  );
  now = 101;
  deferred.resolve("late");
  assertEquals(await outcome, "rejected");
  budget.dispose();
});

Deno.test("a throwing clock creates no authority", async () => {
  const scheduler = createFakeScheduler();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 1_000,
    clock: {
      now: () => {
        throw new Error("synthetic clock failure");
      },
    },
    timer: scheduler.timer,
  });

  assertEquals(budget.remainingMs(), 0);
  let invoked = false;
  await assertRejects(
    () =>
      budget.run(() => {
        invoked = true;
        return Promise.resolve(1);
      }),
    Error,
  );
  assertEquals(invoked, false);
});

Deno.test("a non-finite clock creates no authority", () => {
  const scheduler = createFakeScheduler();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 1_000,
    clock: { now: () => Number.NaN },
    timer: scheduler.timer,
  });
  assertEquals(budget.remainingMs(), 0);
});

Deno.test("a backward clock creates no new authority", () => {
  let now = 10_000;
  const scheduler = createFakeScheduler();
  const budget = createShipaExecutionBudget({
    itemBudgetMs: 1_000,
    clock: { now: () => now },
    timer: scheduler.timer,
  });

  now = 0;
  assertEquals(budget.remainingMs(), 0);
  assertEquals(budget.abandoned, true);
});
