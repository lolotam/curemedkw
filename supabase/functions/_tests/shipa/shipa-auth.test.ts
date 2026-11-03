// Behavioural tests for the Shipa authorization slice.
//
// The real authorization logic runs here. Only the SDK boundary is faked:
// the session lookup and the role lookup are replays, while the bearer
// parsing, the user-id validation, the role decision and the secret
// comparison are the production code.
//
// No real credential, key, account value or personal data is used.

import { assert, assertEquals } from "jsr:@std/assert@1.0.19";

import {
  authorizeShipaWorker,
  constantTimeSecretEquals,
  requireShipaAdmin,
  SHIPA_DISPATCH_KEY_HEADER,
} from "../../_shared/shipa-auth.ts";
import {
  createFakeShipaAuthClient,
  SHIPA_TEST_DISPATCH_CREDENTIAL as scheduler,
  SHIPA_TEST_OTHER_USER_ID,
  SHIPA_TEST_SERVICE_KEY,
  SHIPA_TEST_USER_ID,
} from "./shipa-auth-fixtures.ts";

const SESSION_CREDENTIAL = "synthetic-session-access-token";

function buildRequest(
  headers: Record<string, string>,
  body?: unknown,
): Request {
  const requestHeaders: Record<string, string> = { ...headers };
  const init: RequestInit = { method: "POST", headers: requestHeaders };
  if (body !== undefined) {
    requestHeaders["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return new Request("https://shipa.invalid/edge", init);
}

function credentials(): {
  serviceRoleKey: string;
  schedulerToken: string;
} {
  return {
    serviceRoleKey: SHIPA_TEST_SERVICE_KEY,
    schedulerToken: scheduler,
  };
}

Deno.test("authorizes an administrator from the verified session user", async () => {
  const client = createFakeShipaAuthClient();
  client.queueUser({ user: { id: SHIPA_TEST_USER_ID } });
  client.queueRole({ data: { role: "admin" } });

  // The body carries a different actor id. It must never be used.
  const request = buildRequest(
    { authorization: `Bearer ${SESSION_CREDENTIAL}` },
    { actorId: SHIPA_TEST_OTHER_USER_ID, user_id: SHIPA_TEST_OTHER_USER_ID },
  );

  const result = await requireShipaAdmin(request, client);
  assert(result.ok);
  assertEquals(result.actor.userId, SHIPA_TEST_USER_ID);
  // Only the user id crosses the boundary.
  assertEquals(Object.keys(result.actor), ["userId"]);

  assertEquals(client.authCalls.length, 1);
  assertEquals(client.authCalls[0].token, SESSION_CREDENTIAL);

  // The role lookup used the verified session user, not the body claim.
  assertEquals(client.roleQueries.length, 1);
  assertEquals(client.roleQueries[0].table, "user_roles");
  assertEquals(client.roleQueries[0].columns, "role");
  assertEquals(client.roleQueries[0].filters, [
    { column: "user_id", value: SHIPA_TEST_USER_ID },
    { column: "role", value: "admin" },
  ]);
});

Deno.test("refuses a request without a usable bearer header", async () => {
  const refusals: readonly Record<string, string>[] = [
    {},
    { authorization: "" },
    { authorization: "Basic dXNlcjpwYXNzd29yZA==" },
    { authorization: "Bearer" },
    { authorization: "Bearer " },
    { authorization: SESSION_CREDENTIAL },
    { authorization: "Bearer token with spaces" },
  ];

  const client = createFakeShipaAuthClient();
  const results = await Promise.all(
    refusals.map((header) => requireShipaAdmin(buildRequest(header), client)),
  );

  for (const result of results) {
    assert(!result.ok);
    assertEquals(result.status, 401);
    assertEquals(result.code, "unauthenticated");
  }

  // A malformed header never reaches the SDK.
  assertEquals(client.authCalls.length, 0);
  assertEquals(client.roleQueries.length, 0);
});

Deno.test("treats a resolved session error as unauthenticated", async () => {
  const client = createFakeShipaAuthClient();
  client.queueUser({ error: { message: "invalid session" } });

  const result = await requireShipaAdmin(
    buildRequest({ authorization: `Bearer ${SESSION_CREDENTIAL}` }),
    client,
  );
  assert(!result.ok);
  assertEquals(result.status, 401);
  assertEquals(result.code, "unauthenticated");
  // The role lookup never runs for an unauthenticated caller.
  assertEquals(client.roleQueries.length, 0);
});

Deno.test("treats a rejected session lookup as unavailable", async () => {
  const client = createFakeShipaAuthClient();
  client.queueUser({ rejection: new Error("transport failure") });

  const result = await requireShipaAdmin(
    buildRequest({ authorization: `Bearer ${SESSION_CREDENTIAL}` }),
    client,
  );
  assert(!result.ok);
  assertEquals(result.status, 503);
  assertEquals(result.code, "unavailable");
  assertEquals(client.roleQueries.length, 0);
});

Deno.test("refuses a session user whose id is not a uuid", async () => {
  const client = createFakeShipaAuthClient();
  client.queueUser({ user: { id: "not-a-uuid" } });

  const result = await requireShipaAdmin(
    buildRequest({ authorization: `Bearer ${SESSION_CREDENTIAL}` }),
    client,
  );
  assert(!result.ok);
  assertEquals(result.status, 401);
  assertEquals(result.code, "unauthenticated");
  assertEquals(client.roleQueries.length, 0);
});

Deno.test("refuses an authenticated caller without an admin row", async () => {
  const client = createFakeShipaAuthClient();
  client.queueUser({ user: { id: SHIPA_TEST_USER_ID } });
  client.queueRole({ data: null });

  const result = await requireShipaAdmin(
    buildRequest({ authorization: `Bearer ${SESSION_CREDENTIAL}` }),
    client,
  );
  assert(!result.ok);
  assertEquals(result.status, 403);
  assertEquals(result.code, "forbidden");
});

Deno.test("refuses a role row that does not carry the admin role", async () => {
  const client = createFakeShipaAuthClient();
  client.queueUser({ user: { id: SHIPA_TEST_USER_ID } });
  client.queueRole({ data: { role: "support" } });

  const result = await requireShipaAdmin(
    buildRequest({ authorization: `Bearer ${SESSION_CREDENTIAL}` }),
    client,
  );
  assert(!result.ok);
  assertEquals(result.status, 403);
  assertEquals(result.code, "forbidden");
});

Deno.test("treats a failed role lookup as unavailable", async () => {
  const resolved = createFakeShipaAuthClient();
  resolved.queueUser({ user: { id: SHIPA_TEST_USER_ID } });
  resolved.queueRole({
    error: {
      code: "42501",
      message: "permission denied for table user_roles",
      details: "upstream-detail-marker",
      hint: "upstream-hint-marker",
    },
  });

  const failed = await requireShipaAdmin(
    buildRequest({ authorization: `Bearer ${SESSION_CREDENTIAL}` }),
    resolved,
  );
  assert(!failed.ok);
  assertEquals(failed.status, 503);
  assertEquals(failed.code, "unavailable");
  // The failure carries a status and a code and nothing else.
  assertEquals(Object.keys(failed).sort(), ["code", "ok", "status"]);
  const serialized = JSON.stringify(failed);
  assertEquals(serialized.includes("upstream-detail-marker"), false);
  assertEquals(serialized.includes("upstream-hint-marker"), false);
  assertEquals(serialized.includes("permission denied"), false);

  const rejected = createFakeShipaAuthClient();
  rejected.queueUser({ user: { id: SHIPA_TEST_USER_ID } });
  rejected.queueRole({ rejection: new Error("transport failure") });

  const thrown = await requireShipaAdmin(
    buildRequest({ authorization: `Bearer ${SESSION_CREDENTIAL}` }),
    rejected,
  );
  assert(!thrown.ok);
  assertEquals(thrown.status, 503);
  assertEquals(thrown.code, "unavailable");
});

Deno.test("authorizes a worker request with the injected service role key", () => {
  const client = createFakeShipaAuthClient();

  const result = authorizeShipaWorker(
    buildRequest({ authorization: `Bearer ${SHIPA_TEST_SERVICE_KEY}` }),
    credentials(),
  );
  assert(result.ok);
  assertEquals(result.source, "service");

  // The worker check never touches the SDK or SQL.
  assertEquals(client.authCalls.length, 0);
  assertEquals(client.roleQueries.length, 0);
});

Deno.test("authorizes a worker request with the injected scheduler token", () => {
  const result = authorizeShipaWorker(
    buildRequest({ [SHIPA_DISPATCH_KEY_HEADER]: scheduler }),
    credentials(),
  );
  assert(result.ok);
  assertEquals(result.source, "scheduler");
});

Deno.test("uses the approved scheduler header alongside router admission", () => {
  const request = buildRequest({
    authorization: "Bearer synthetic-router-anon-jwt",
    "x-shipa-dispatch-token": scheduler,
  });
  assertEquals(authorizeShipaWorker(request, credentials()), {
    ok: true,
    source: "scheduler",
  });
  assertEquals(
    authorizeShipaWorker(
      buildRequest({
        authorization: "Bearer synthetic-router-anon-jwt",
        "x-curemed-shipa-dispatch-key": scheduler,
      }),
      credentials(),
    ),
    { ok: false, status: 401, code: "unauthenticated" },
  );
});

Deno.test("prefers the service source when both credentials are presented", () => {
  const result = authorizeShipaWorker(
    buildRequest({
      authorization: `Bearer ${SHIPA_TEST_SERVICE_KEY}`,
      [SHIPA_DISPATCH_KEY_HEADER]: scheduler,
    }),
    credentials(),
  );
  assert(result.ok);
  // A service nudge can never be recorded as a scheduler run.
  assertEquals(result.source, "service");
});

Deno.test("refuses an empty configured credential", () => {
  const emptyService = authorizeShipaWorker(
    buildRequest({ authorization: "Bearer " }),
    { serviceRoleKey: "", schedulerToken: scheduler },
  );
  assert(!emptyService.ok);
  assertEquals(emptyService.status, 401);
  assertEquals(emptyService.code, "unauthenticated");

  const emptyScheduler = authorizeShipaWorker(
    buildRequest({ [SHIPA_DISPATCH_KEY_HEADER]: "" }),
    { serviceRoleKey: SHIPA_TEST_SERVICE_KEY, schedulerToken: "" },
  );
  assert(!emptyScheduler.ok);
  assertEquals(emptyScheduler.status, 401);

  const emptyBoth = authorizeShipaWorker(
    buildRequest({}),
    { serviceRoleKey: "", schedulerToken: "" },
  );
  assert(!emptyBoth.ok);
  assertEquals(emptyBoth.status, 401);
});

Deno.test("refuses an anon key, an admin session and a malformed header", () => {
  const refusals: readonly Record<string, string>[] = [
    { authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon" },
    { authorization: `Bearer ${SESSION_CREDENTIAL}` },
    { authorization: `Bearer ${SHIPA_TEST_SERVICE_KEY}x` },
    { authorization: SHIPA_TEST_SERVICE_KEY },
    { authorization: `Basic ${SHIPA_TEST_SERVICE_KEY}` },
    { [SHIPA_DISPATCH_KEY_HEADER]: "wrong-scheduler-token" },
  ];

  for (const header of refusals) {
    const result = authorizeShipaWorker(buildRequest(header), credentials());
    assert(!result.ok);
    assertEquals(result.status, 401);
    assertEquals(result.code, "unauthenticated");
    assertEquals(Object.keys(result).sort(), ["code", "ok", "status"]);
  }
});

Deno.test("never leaks the configured secrets in a worker failure", () => {
  const result = authorizeShipaWorker(
    buildRequest({ authorization: "Bearer wrong-key" }),
    credentials(),
  );
  assert(!result.ok);
  const serialized = JSON.stringify(result);
  assertEquals(serialized.includes(SHIPA_TEST_SERVICE_KEY), false);
  assertEquals(serialized.includes(scheduler), false);
});

Deno.test("compares worker secrets by their UTF-8 bytes", () => {
  // The exact secret matches, including a multi-byte character.
  assertEquals(constantTimeSecretEquals("sécret-këy", "sécret-këy"), true);

  // Two different strings with the same number of UTF-8 bytes: "é" is two
  // bytes and "ab" is two bytes, while their character counts differ. The
  // byte comparison is what decides, not a character count.
  assertEquals(new TextEncoder().encode("é").length, 2);
  assertEquals(new TextEncoder().encode("ab").length, 2);
  assertEquals("é".length, 1);
  assertEquals("ab".length, 2);
  assertEquals(constantTimeSecretEquals("é", "ab"), false);

  // A different length never matches.
  assertEquals(constantTimeSecretEquals("abc", "abcd"), false);

  // An empty secret never matches, not even another empty secret.
  assertEquals(constantTimeSecretEquals("", ""), false);
  assertEquals(constantTimeSecretEquals("abc", ""), false);
  assertEquals(constantTimeSecretEquals("", "abc"), false);
});
