// Synthetic fixtures for the Shipa authorization tests.
//
// Everything in this file is fabricated. The user ids are made-up UUIDs, the
// service key and the scheduler token are invented strings, and no real
// credential, key, token, account value or personal data exists below.
//
// Only the SDK boundary is faked. The fake records every session lookup and
// every role query and replays a queued outcome; the authorization logic
// under test is the real production module.

import type {
  ShipaAuthClient,
  ShipaAuthGetUser,
  ShipaAuthRoleFilter,
  ShipaAuthRoleResponse,
  ShipaAuthRoleTable,
  ShipaAuthUserResponse,
} from "../../_shared/shipa-auth.ts";

/** A made-up signed-in user id. */
export const SHIPA_TEST_USER_ID = "9c858901-8a57-4791-81fe-4c455b099bc9";

/** A second made-up user id, used as a body claim that must be ignored. */
export const SHIPA_TEST_OTHER_USER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** A made-up service-role key. */
export const SHIPA_TEST_SERVICE_KEY = "synthetic-service-role-key-not-real";

/** A made-up scheduler dispatch token. */
export const SHIPA_TEST_DISPATCH_CREDENTIAL =
  "synthetic-scheduler-token-not-real";

/** A recorded session lookup. */
export interface RecordedAuthCall {
  readonly token: string;
}

/** A recorded filter of the role query. */
export interface RecordedRoleFilter {
  readonly column: string;
  readonly value: string;
}

/** A recorded role query. */
export interface RecordedRoleQuery {
  readonly table: string;
  readonly columns: string;
  readonly filters: readonly RecordedRoleFilter[];
}

/** The queued outcome of one session lookup. */
export interface FakeAuthUserOutcome {
  /** The user the session resolved with. */
  readonly user?: { readonly id: string } | null;
  /** A resolved session error. */
  readonly error?: unknown;
  /** A transport promise rejection, distinct from a resolved error. */
  readonly rejection?: unknown;
}

/** The queued outcome of one role lookup. */
export interface FakeRoleOutcome {
  /** The row the query resolved with, or null when there is none. */
  readonly data?: unknown;
  /** A resolved query error. */
  readonly error?: unknown;
  /** A transport promise rejection, distinct from a resolved error. */
  readonly rejection?: unknown;
}

/** The fake SDK boundary. */
export interface FakeShipaAuthClient extends ShipaAuthClient {
  /** Every session lookup the module made, in order. */
  readonly authCalls: RecordedAuthCall[];
  /** Every role query the module made, in order. */
  readonly roleQueries: RecordedRoleQuery[];
  /** Queues the outcome of the next session lookup. */
  queueUser(outcome: FakeAuthUserOutcome): void;
  /** Queues the outcome of the next role query. */
  queueRole(outcome: FakeRoleOutcome): void;
}

/**
 * Creates the fake SDK boundary. It has no database, no network and no
 * environment access: it only records calls and replays queued outcomes.
 */
export function createFakeShipaAuthClient(): FakeShipaAuthClient {
  const authCalls: RecordedAuthCall[] = [];
  const roleQueries: RecordedRoleQuery[] = [];
  const userOutcomes: FakeAuthUserOutcome[] = [];
  const roleOutcomes: FakeRoleOutcome[] = [];

  const auth: ShipaAuthGetUser = {
    getUser(token: string): PromiseLike<ShipaAuthUserResponse> {
      authCalls.push({ token });
      const outcome = userOutcomes.shift();
      if (!outcome) {
        return Promise.reject(new Error("no queued session outcome"));
      }
      if (outcome.rejection !== undefined) {
        return Promise.reject(outcome.rejection);
      }
      return Promise.resolve({
        data: outcome.user === undefined ? null : { user: outcome.user },
        error: outcome.error ?? null,
      });
    },
  };

  const from = (table: string): ShipaAuthRoleTable => {
    const filters: RecordedRoleFilter[] = [];
    let columns = "";

    const filter: ShipaAuthRoleFilter = {
      eq(column: string, value: string): ShipaAuthRoleFilter {
        filters.push({ column, value });
        return filter;
      },
      maybeSingle(): PromiseLike<ShipaAuthRoleResponse> {
        roleQueries.push({ table, columns, filters: filters.slice() });
        const outcome = roleOutcomes.shift();
        if (!outcome) {
          return Promise.reject(new Error("no queued role outcome"));
        }
        if (outcome.rejection !== undefined) {
          return Promise.reject(outcome.rejection);
        }
        return Promise.resolve({
          data: outcome.data ?? null,
          error: outcome.error ?? null,
        });
      },
    };

    return {
      select(nextColumns: string): ShipaAuthRoleFilter {
        columns = nextColumns;
        return filter;
      },
    };
  };

  return {
    authCalls,
    roleQueries,
    queueUser(outcome: FakeAuthUserOutcome): void {
      userOutcomes.push(outcome);
    },
    queueRole(outcome: FakeRoleOutcome): void {
      roleOutcomes.push(outcome);
    },
    auth,
    from,
  };
}
