// Curemed — the fixtures of the WhatsApp pairing tests.
//
// Only the boundaries are replaced here: the provider fetch and the auth
// SDK. The real provider client, the real safe parser and the real
// isAdminCaller helper run against them.
//
// No test reaches a network, and no real credential appears. The token and
// the secret below are synthetic values of a test fixture.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import type { EvolutionFetch } from "../../_shared/evolution-pairing.ts";

/** A synthetic instance token. It belongs to nothing. */
export const KEY_MARKER = "test-instance-token";

/** A synthetic webhook secret. It belongs to nothing. */
export const HOOK_MARKER = "test-webhook-secret";

/** One recorded provider request. */
export interface RecordedRequest {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/** The fake provider boundary. */
export interface FakeProvider {
  readonly fetch: EvolutionFetch;
  readonly calls: RecordedRequest[];
}

/** The answer of the fake provider. */
export type FakeProviderAnswer = (
  url: string,
  init: RequestInit | undefined,
  index: number,
) => Response | Promise<Response>;

/** Builds a fake provider boundary. */
export function createFakeProvider(
  answer: FakeProviderAnswer,
): FakeProvider {
  const calls: RecordedRequest[] = [];
  const fetchImpl: EvolutionFetch = async (url, init) => {
    const index = calls.length;
    calls.push({ url, init });
    const signal = init?.signal;
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    return await answer(url, init, index);
  };
  return { fetch: fetchImpl, calls };
}

/**
 * Builds a provider that never answers and fails when the request is
 * aborted, the way a real fetch behaves.
 */
export function createHangingProvider(): FakeProvider {
  return createFakeProvider(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () =>
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            ),
          { once: true },
        );
      }),
  );
}

/** Builds a JSON answer. */
export function jsonBody(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Builds an answer with a raw body and optional headers. */
export function rawBody(
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

/** The options of the fake auth SDK. */
export interface FakeAdminOptions {
  /** The id of the resolved user. Without it the session is invalid. */
  readonly userId?: string | null;
  /** The role of the resolved user. Without it the caller is not an admin. */
  readonly role?: string | null;
  /** The tokens that resolve a session. Other tokens are invalid. */
  readonly validTokens?: string[];
  /** Makes the auth call reject instead of resolving. */
  readonly reject?: boolean;
  /** Delays the auth call, in milliseconds. */
  readonly delayMs?: number;
}

/** The fake auth SDK and its call counters. */
export interface FakeAdmin {
  readonly client: SupabaseClient;
  readonly authCalls: () => number;
  readonly roleCalls: () => number;
  readonly settleAuthDelay: () => Promise<unknown>;
}

/**
 * Builds a fake auth SDK. It answers exactly the calls the real
 * isAdminCaller helper makes: auth.getUser and the user_roles query.
 */
export function createFakeAdmin(options: FakeAdminOptions = {}): FakeAdmin {
  let authCalls = 0;
  let roleCalls = 0;
  let authDelay: Promise<unknown> = Promise.resolve();

  const client = {
    auth: {
      getUser: async (token: string) => {
        authCalls += 1;
        if (options.delayMs !== undefined) {
          authDelay = new Promise((resolve) =>
            setTimeout(resolve, options.delayMs)
          );
          await authDelay;
        }
        if (options.reject) {
          throw new Error("the auth server is unavailable");
        }
        if (typeof token !== "string" || token === "") {
          return { data: { user: null }, error: { message: "no session" } };
        }
        if (options.validTokens && !options.validTokens.includes(token)) {
          return {
            data: { user: null },
            error: { message: "invalid session" },
          };
        }
        if (!options.userId) {
          return {
            data: { user: null },
            error: { message: "invalid session" },
          };
        }
        return { data: { user: { id: options.userId } }, error: null };
      },
    },
    from: (table: string) => {
      if (table !== "user_roles") throw new Error("unexpected role table");
      roleCalls += 1;
      const filters: Record<string, unknown> = {};
      const query = {
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: () =>
          Promise.resolve({
            data: filters.user_id === options.userId &&
                filters.role === options.role && options.role
              ? { role: options.role }
              : null,
            error: null,
          }),
      };
      return {
        select: () => query,
      };
    },
  } as unknown as SupabaseClient;

  return {
    client,
    settleAuthDelay: () => authDelay,
    authCalls: () => authCalls,
    roleCalls: () => roleCalls,
  };
}
