// Shipa execution budget — the bounded whole-item execution fence.
//
// What this module is
// -------------------
// One small helper that bounds a whole manual item. The review request, the
// canonical binding lookup, the key load, the preparation and the begin share
// ONE admission budget, so no pre-dispatch phase can reset the fifteen seconds
// the item was given. The dispatcher reserves settlement time before the one
// provider invocation; the adapter then owns its bounded await and an observed
// result gets a separate bounded completion, independent of browser abort.
//
// What this module deliberately does not do
// -----------------------------------------
// * It is not a queue, a scheduler, a worker or a framework. It owns no work
//   and starts nothing.
// * It never cancels a database call. A fenced call may still finish and
//   commit on the server: the fence bounds what THIS process waits for and
//   refuses the later continuations. It does not prove that SQL rolled back.
// * It never logs, and it never returns a clock reading, a timer handle or an
//   operation name.
//
// Trust boundary
// --------------
// Every limit is server-owned. A browser, a body, a header and a query string
// never reach this module. The injected clock, timer and signal exist so a
// test can be deterministic; they are not a caller-supplied deadline.
//
// Source of truth:
//   docs/superpowers/plans/2026-11-02-shipa-delivery.md (task 6)

// ---------------------------------------------------------------------------
// The limits
// ---------------------------------------------------------------------------

/** The whole-item budget of one manual item, in milliseconds. */
export const SHIPA_EXECUTION_ITEM_BUDGET_MS = 15_000;

/** The largest server-owned parent cap, in milliseconds. */
export const SHIPA_EXECUTION_PARENT_CAP_MS = 50_000;

/** The largest provider request deadline, in milliseconds. */
export const SHIPA_EXECUTION_PROVIDER_DEADLINE_MS = 10_000;

// ---------------------------------------------------------------------------
// The abandonment
// ---------------------------------------------------------------------------

/** Why an execution budget stopped accepting work. */
export type ShipaExecutionAbandonReason = "timeout" | "aborted";

/**
 * The single failure type of the execution budget.
 *
 * The original cause is deliberately dropped. A budget error carries no
 * operation name, no clock reading and no upstream detail.
 */
export class ShipaExecutionBudgetError extends Error {
  readonly reason: ShipaExecutionAbandonReason;

  constructor(reason: ShipaExecutionAbandonReason) {
    super("The Shipa execution budget was exhausted.");
    this.name = "ShipaExecutionBudgetError";
    this.reason = reason;
  }
}

/** True for the execution budget failure. */
export function isShipaExecutionBudgetError(
  value: unknown,
): value is ShipaExecutionBudgetError {
  return value instanceof ShipaExecutionBudgetError;
}

// ---------------------------------------------------------------------------
// The injected boundaries
// ---------------------------------------------------------------------------

/** The monotonic clock of the budget. */
export interface ShipaExecutionClock {
  /** The monotonic milliseconds since an arbitrary origin. */
  now(): number;
}

/** The timer of the budget. */
export interface ShipaExecutionTimer {
  /** Schedules one callback and returns its handle. */
  schedule(callback: () => void, delayMs: number): number;
  /** Cancels one scheduled callback. */
  cancel(handle: number): void;
}

const defaultClock: ShipaExecutionClock = {
  now: () => performance.now(),
};

const defaultTimer: ShipaExecutionTimer = {
  schedule(callback: () => void, delayMs: number): number {
    return setTimeout(callback, delayMs);
  },
  cancel(handle: number): void {
    clearTimeout(handle);
  },
};

/** The injected options of one execution budget. */
export interface ShipaExecutionBudgetOptions {
  /** The item budget. It is clamped to fifteen seconds. */
  readonly itemBudgetMs?: number;
  /** The server-owned parent cap. It is clamped to fifty seconds. */
  readonly parentCapMs?: number;
  /** The monotonic clock. Defaults to the platform clock. */
  readonly clock?: ShipaExecutionClock;
  /** The timer. Defaults to the platform timer. */
  readonly timer?: ShipaExecutionTimer;
  /** An abort signal that stops the budget. */
  readonly signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// The budget
// ---------------------------------------------------------------------------

/**
 * One bounded execution budget.
 *
 * It never resets. The remaining time only ever decreases, an abandoned budget
 * stays abandoned, and every later operation is refused.
 */
export interface ShipaExecutionBudget {
  /** True once the budget timed out or was aborted. */
  readonly abandoned: boolean;
  /** Why the budget was abandoned, or null while it is alive. */
  readonly reason: ShipaExecutionAbandonReason | null;
  /** The milliseconds the budget still has. */
  remainingMs(): number;
  /**
   * Checks the budget and then runs one lazy operation under it.
   *
   * The operation is not invoked at all when the budget is already spent, and
   * the await is bounded by the remaining time.
   */
  run<T>(operation: () => PromiseLike<T>): Promise<T>;
  /** Bounds one await by the remaining time. */
  guard<T>(promise: PromiseLike<T>): Promise<T>;
  /** Stops the budget irreversibly. */
  abandon(reason: ShipaExecutionAbandonReason): void;
  /** Releases the listeners this budget owns. */
  dispose(): void;
}

/**
 * Creates one execution budget.
 *
 * The clock is read once, here. A clock that throws or that reports a
 * non-finite reading produces a budget with no remaining time at all: a
 * broken clock can never create authority.
 */
export function createShipaExecutionBudget(
  options: ShipaExecutionBudgetOptions = {},
): ShipaExecutionBudget {
  const clock = options.clock ?? defaultClock;
  const timer = options.timer ?? defaultTimer;
  const signal = options.signal;

  const itemBudgetMs = clampLimit(
    options.itemBudgetMs,
    SHIPA_EXECUTION_ITEM_BUDGET_MS,
  );
  const parentCapMs = clampLimit(
    options.parentCapMs,
    SHIPA_EXECUTION_PARENT_CAP_MS,
  );
  const totalMs = Math.min(itemBudgetMs, parentCapMs);

  const startedAt = readClock(clock);
  let lastObservedAt = startedAt;
  let abandoned = false;
  let reason: ShipaExecutionAbandonReason | null = null;
  const pending = new Set<(error: ShipaExecutionBudgetError) => void>();

  /** Reads the clock, treating a broken clock as no time at all. */
  function readCurrent(): number | null {
    try {
      const value = clock.now();
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  /** The milliseconds this budget still has. */
  function remainingMs(): number {
    if (abandoned) return 0;
    if (startedAt === null) return 0;
    const current = readCurrent();
    if (
      current === null || (lastObservedAt !== null && current < lastObservedAt)
    ) {
      abandon("timeout");
      return 0;
    }
    lastObservedAt = current;
    // A backward clock must never hand out more time than the budget holds.
    const elapsed = current - startedAt;
    const used = elapsed > 0 ? elapsed : 0;
    const remaining = totalMs - used;
    return remaining > 0 ? remaining : 0;
  }

  /** Stops the budget and refuses everything that is still pending. */
  function abandon(next: ShipaExecutionAbandonReason): void {
    if (abandoned) return;
    abandoned = true;
    reason = next;
    const error = new ShipaExecutionBudgetError(next);
    const rejectors = [...pending];
    pending.clear();
    for (const rejector of rejectors) rejector(error);
  }

  /** Refuses a call when the budget has no time left. */
  function requireLive(): void {
    if (abandoned) {
      throw new ShipaExecutionBudgetError(reason ?? "timeout");
    }
    if (remainingMs() <= 0) {
      abandon("timeout");
      throw new ShipaExecutionBudgetError("timeout");
    }
  }

  function guard<T>(promise: PromiseLike<T>): Promise<T> {
    try {
      requireLive();
    } catch (error) {
      return Promise.reject(error);
    }
    const remaining = remainingMs();
    if (remaining <= 0) {
      abandon("timeout");
      return Promise.reject(new ShipaExecutionBudgetError("timeout"));
    }
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let handle: number | null = null;
      const rejector = (error: ShipaExecutionBudgetError): void => {
        if (settled) return;
        settled = true;
        if (handle !== null) {
          timer.cancel(handle);
          handle = null;
        }
        pending.delete(rejector);
        reject(error);
      };
      pending.add(rejector);
      const scheduled = timer.schedule(() => {
        if (settled) return;
        settled = true;
        pending.delete(rejector);
        abandon("timeout");
        reject(new ShipaExecutionBudgetError("timeout"));
      }, remaining);
      handle = scheduled;
      if (settled && handle !== null) {
        timer.cancel(handle);
        handle = null;
      }
      Promise.resolve(promise).then(
        (value) => {
          if (settled) return;
          // A blocked event loop may settle the promise before its overdue
          // timer callback runs. The clock remains the deadline authority.
          try {
            requireLive();
          } catch {
            rejector(new ShipaExecutionBudgetError(reason ?? "timeout"));
            return;
          }
          settled = true;
          if (handle !== null) {
            timer.cancel(handle);
            handle = null;
          }
          pending.delete(rejector);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          if (handle !== null) {
            timer.cancel(handle);
            handle = null;
          }
          pending.delete(rejector);
          reject(error);
        },
      );
    });
  }

  function run<T>(operation: () => PromiseLike<T>): Promise<T> {
    // The remaining time and the abort state are checked BEFORE the operation
    // is invoked, so a spent budget never starts a lazy call at all.
    try {
      requireLive();
    } catch (error) {
      return Promise.reject(error);
    }
    let started: PromiseLike<T>;
    try {
      started = operation();
    } catch (error) {
      return Promise.reject(error);
    }
    return guard(started);
  }

  const onAbort = (): void => {
    abandon("aborted");
  };
  if (signal !== undefined) {
    if (signal.aborted) {
      abandon("aborted");
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  return {
    get abandoned(): boolean {
      return abandoned;
    },
    get reason(): ShipaExecutionAbandonReason | null {
      return reason;
    },
    remainingMs,
    run,
    guard,
    abandon,
    dispose(): void {
      if (signal !== undefined) {
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}

/**
 * Clamps one limit into its permitted range.
 *
 * A value that is not a finite number falls back to the maximum, so a broken
 * option never produces a longer budget. A value of zero is honoured as
 * zero: an item with no time at all spends nothing.
 */
function clampLimit(value: number | undefined, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return maximum;
  if (value <= 0) return 0;
  return Math.min(Math.floor(value), maximum);
}

/** Reads the clock once, at construction. */
function readClock(clock: ShipaExecutionClock): number | null {
  try {
    const value = clock.now();
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
