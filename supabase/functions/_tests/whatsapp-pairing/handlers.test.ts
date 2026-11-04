// Curemed — the tests of the pairing endpoint and of the connection only
// webhook.
//
// The real handlers run here. Only the SDK and the fetch boundaries are
// replaced, so the real isAdminCaller helper, the real provider client,
// the real body parser and the real safe projections are all exercised.
//
// No test reaches a network, no test touches a database and no real
// credential appears.

import { assert, assertEquals } from "jsr:@std/assert@1.0.19";

import { EVOLUTION_ALLOWED_ORIGIN } from "../../_shared/evolution-pairing.ts";
import { createEvolutionPairingHandler } from "../../whatsapp-pairing/handler.ts";
import { createEvolutionPairingWebhookHandler } from "../../whatsapp-pairing-webhook/handler.ts";
import {
  createFakeAdmin,
  createFakeProvider,
  type FakeAdmin,
  type FakeProvider,
  type FakeProviderAnswer,
  HOOK_MARKER,
  jsonBody,
  KEY_MARKER,
} from "./fixtures.ts";

const PAIRING_ENDPOINT = "https://curemedkw.com/functions/v1/whatsapp-pairing";
const WEBHOOK_ENDPOINT =
  "https://curemedkw.com/functions/v1/whatsapp-pairing-webhook";

const PNG_QR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

Deno.test("a stalled admin body expires before configuration or provider access", async () => {
  const harness = createHarness();
  const started = Promise.withResolvers<void>();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull() {
      started.resolve();
    },
    cancel() {
      cancelled = true;
    },
  }, { highWaterMark: 0 });
  const schedule = globalThis.setTimeout;
  const clock: { expire?: () => void; milliseconds?: number } = {};
  // Drive the configured timer after reader acquisition. A 5ms startup race
  // previously let authorization expire before this body test had started.
  globalThis.setTimeout = (callback, milliseconds, ...args) => {
    if (milliseconds === 15_000 && typeof callback === "function") {
      clock.milliseconds = milliseconds;
      clock.expire = () => callback(...args);
      return 0;
    }
    return schedule(callback, milliseconds, ...args);
  };
  const guard = Promise.withResolvers<never>();
  const guardTimer = schedule(() => {
    guard.reject(new Error("The body reader did not start."));
  }, 1_000);
  let pending: Promise<Response> | undefined;
  try {
    pending = harness.handler(
      new Request(PAIRING_ENDPOINT, {
        method: "POST",
        headers: { authorization: "Bearer admin-session-token" },
        body,
      }),
    );
    await Promise.race([started.promise, guard.promise]);
    assertEquals(clock.milliseconds, 15_000);
    assert(clock.expire);
    clock.expire();
    const response = await pending;
    assertEquals(response.status, 504);
    assertEquals(cancelled, true);
    assertEquals(harness.configReads(), 0);
    assertEquals(harness.provider.calls.length, 0);
  } finally {
    globalThis.setTimeout = schedule;
    clearTimeout(guardTimer);
    clock.expire?.();
    await pending?.catch(() => {});
  }
});

Deno.test("an authorization timeout never starts reading the request body", async () => {
  const admin = createFakeAdmin({
    userId: "user-1",
    role: "admin",
    delayMs: 25,
  });
  const harness = createHarness({ admin, fenceMs: 1 });
  let readStarted = false;
  const body = new ReadableStream<Uint8Array>({
    pull() {
      readStarted = true;
    },
  }, { highWaterMark: 0 });
  const response = await harness.handler(
    new Request(PAIRING_ENDPOINT, {
      method: "POST",
      headers: { authorization: "Bearer admin-session-token" },
      body,
    }),
  );
  await admin.settleAuthDelay();
  assertEquals(response.status, 504);
  assertEquals(readStarted, false);
  assertEquals(harness.configReads(), 0);
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test("webhook body cancellation cannot leave an unbounded reader", async () => {
  const handler = createEvolutionPairingWebhookHandler({
    readSecret: () => HOOK_MARKER,
  });
  const controller = new AbortController();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const pending = handler(
    new Request(WEBHOOK_ENDPOINT, {
      method: "POST",
      headers: { "x-curemed-webhook-key": HOOK_MARKER },
      body,
      signal: controller.signal,
    }),
  );
  controller.abort();
  const response = await pending;
  assertEquals(response.status, 400);
  assertEquals(cancelled, true);
});

Deno.test("prototype-shaped envelope cannot supply webhook instance authority", async () => {
  const handler = createEvolutionPairingWebhookHandler({
    readSecret: () => HOOK_MARKER,
  });
  const response = await handler(
    request(
      WEBHOOK_ENDPOINT,
      '{"__proto__":{"instance":"curemed","event":"connection.update","data":{"state":"open"}}}',
      { headers: { "x-curemed-webhook-key": HOOK_MARKER } },
    ),
  );
  assertEquals(response.status, 400);
});

function request(
  url: string,
  body?: string,
  options: { headers?: Record<string, string>; method?: string } = {},
): Request {
  const headers = new Headers(options.headers ?? {});
  if (body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Request(url, {
    method: options.method ?? "POST",
    headers,
    body,
  });
}

interface Harness {
  readonly handler: (req: Request) => Promise<Response>;
  readonly provider: FakeProvider;
  readonly admin: FakeAdmin;
  readonly configReads: () => number;
}

function createHarness(
  options: {
    admin?: FakeAdmin;
    answer?: FakeProviderAnswer;
    fenceMs?: number;
    origin?: string;
    apiKey?: string;
  } = {},
): Harness {
  const provider = createFakeProvider(
    options.answer ??
      (() =>
        jsonBody({ instance: { instanceName: "curemed", state: "close" } })),
  );
  const admin = options.admin ??
    createFakeAdmin({ userId: "user-1", role: "admin" });
  let configReads = 0;
  const handler = createEvolutionPairingHandler({
    admin: admin.client,
    readConfig: () => {
      configReads += 1;
      const key = options.apiKey ?? KEY_MARKER;
      return {
        origin: options.origin ?? EVOLUTION_ALLOWED_ORIGIN,
        apiKey: key,
      };
    },
    fetchImpl: provider.fetch,
    requestFenceMs: options.fenceMs,
  });
  return { handler, provider, admin, configReads: () => configReads };
}

function adminHeaders(): Record<string, string> {
  return { authorization: "Bearer admin-session-token" };
}

Deno.test("an already aborted request cannot start a provider connect", async () => {
  const harness = createHarness();
  const controller = new AbortController();
  controller.abort();
  const response = await harness.handler(
    new Request(
      request(
        PAIRING_ENDPOINT,
        JSON.stringify({ action: "connect" }),
        { headers: adminHeaders() },
      ),
      { signal: controller.signal },
    ),
  );
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.configReads(), 0);
  assertEquals(response.status, 504);
});

Deno.test("the authorization deadline bounds waiting rather than only later provider work", async () => {
  const harness = createHarness({
    admin: createFakeAdmin({ userId: "user-1", role: "admin", delayMs: 70 }),
    fenceMs: 5,
  });
  const pending = harness.handler(
    request(PAIRING_ENDPOINT, JSON.stringify({ action: "connect" }), {
      headers: adminHeaders(),
    }),
  );
  const observed = await Promise.race([
    pending.then((response) => response.status),
    new Promise<string>((resolve) =>
      setTimeout(() => resolve("still_waiting"), 30)
    ),
  ]);
  await pending;
  await harness.admin.settleAuthDelay();
  assertEquals(observed, 504);
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.configReads(), 0);
});

Deno.test("an anonymous caller is refused before any read", async () => {
  const harness = createHarness();

  const response = await harness.handler(
    request(PAIRING_ENDPOINT, JSON.stringify({ action: "status" })),
  );

  assertEquals(response.status, 401);
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.configReads(), 0);
});

Deno.test("a malformed bearer is refused before any read", async () => {
  const harness = createHarness();
  const refused = [
    "",
    "Bearer",
    "Bearer ",
    "Basic abc",
    "Bearer  double",
    "token",
  ];

  for (const authorization of refused) {
    const response = await harness.handler(
      request(
        PAIRING_ENDPOINT,
        JSON.stringify({ action: "status" }),
        { headers: { authorization } },
      ),
    );
    assertEquals(response.status, 401);
  }
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.configReads(), 0);
});

Deno.test("a service role or anon key is not an administrator", async () => {
  const harness = createHarness({
    admin: createFakeAdmin({
      userId: "user-1",
      role: "admin",
      validTokens: ["admin-session-token"],
    }),
  });
  const refused = [
    "Bearer service-role-token",
    "Bearer anon-publishable-key",
  ];

  for (const authorization of refused) {
    const response = await harness.handler(
      request(
        PAIRING_ENDPOINT,
        JSON.stringify({ action: "status" }),
        { headers: { authorization } },
      ),
    );
    assertEquals(response.status, 403);
  }
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.configReads(), 0);
});

Deno.test("a caller without the admin role is refused", async () => {
  const harness = createHarness({
    admin: createFakeAdmin({ userId: "user-2", role: "customer" }),
  });

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "status" }),
      { headers: adminHeaders() },
    ),
  );

  assertEquals(response.status, 403);
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.configReads(), 0);
});

Deno.test("a rejected auth promise is a service failure", async () => {
  const harness = createHarness({
    admin: createFakeAdmin({ reject: true }),
  });

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "status" }),
      { headers: adminHeaders() },
    ),
  );

  assertEquals(response.status, 503);
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test("a genuine administrator reads the fixed status", async () => {
  const harness = createHarness({
    answer: () =>
      jsonBody({ instance: { instanceName: "curemed", state: "close" } }),
  });

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "status" }),
      { headers: adminHeaders() },
    ),
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assertEquals(body, {
    success: true,
    connection: { state: "disconnected", qrDataUrl: null },
  });
  assertEquals(harness.provider.calls.length, 1);
  assert(
    harness.provider.calls[0].url.endsWith(
      "/instance/connectionState/curemed",
    ),
  );
  const headers = harness.provider.calls[0].init?.headers as Record<
    string,
    string
  >;
  assertEquals(headers["apikey"], KEY_MARKER);
});

Deno.test("a genuine administrator receives the pairing QR", async () => {
  const harness = createHarness({
    answer: () =>
      jsonBody({ base64: PNG_QR.replace("data:image/png;base64,", "") }),
  });

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "connect" }),
      { headers: adminHeaders() },
    ),
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body, {
    success: true,
    connection: { state: "connecting", qrDataUrl: PNG_QR },
  });
  assertEquals(harness.provider.calls.length, 1);
});

Deno.test("a forged body actor is refused", async () => {
  const harness = createHarness();
  const forged = [
    { action: "status", actor: "someone-else" },
    { action: "status", userId: "user-1" },
    { action: "status", role: "admin" },
  ];

  for (const body of forged) {
    const response = await harness.handler(
      request(
        PAIRING_ENDPOINT,
        JSON.stringify(body),
        { headers: adminHeaders() },
      ),
    );
    assertEquals(response.status, 400);
  }
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.configReads(), 0);
});

Deno.test("a foreign instance, endpoint or origin in the body is refused", async () => {
  const harness = createHarness();
  const refused = [
    { action: "status", instance: "romani" },
    { action: "connect", instance: "curemed" },
    { action: "status", url: "http://curemed-evolution:8080" },
    { action: "status", origin: "http://curemed-evolution:8080" },
    { action: "status", apiKey: "some-token" },
  ];

  for (const body of refused) {
    const response = await harness.handler(
      request(
        PAIRING_ENDPOINT,
        JSON.stringify(body),
        { headers: adminHeaders() },
      ),
    );
    assertEquals(response.status, 400);
  }
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test("an unknown action is refused", async () => {
  const harness = createHarness();

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "logout" }),
      { headers: adminHeaders() },
    ),
  );

  assertEquals(response.status, 400);
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test("a query key is refused", async () => {
  const harness = createHarness();

  const response = await harness.handler(
    request(
      `${PAIRING_ENDPOINT}?instance=romani`,
      JSON.stringify({ action: "status" }),
      { headers: adminHeaders() },
    ),
  );

  assertEquals(response.status, 400);
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test("a malformed body is refused", async () => {
  const harness = createHarness();

  const response = await harness.handler(
    request(PAIRING_ENDPOINT, "{not json", { headers: adminHeaders() }),
  );

  assertEquals(response.status, 400);
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test("an oversized body is refused", async () => {
  const harness = createHarness();

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "status", pad: "x".repeat(5000) }),
      { headers: adminHeaders() },
    ),
  );

  assertEquals(response.status, 413);
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test("a foreign origin is refused", async () => {
  const harness = createHarness();

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "status" }),
      {
        headers: {
          ...adminHeaders(),
          origin: "https://romani.curemedkw.com",
        },
      },
    ),
  );

  assertEquals(response.status, 403);
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.configReads(), 0);
});

Deno.test("an origin of Curemed is accepted", async () => {
  const harness = createHarness();

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "status" }),
      {
        headers: { ...adminHeaders(), origin: "https://curemedkw.com" },
      },
    ),
  );

  assertEquals(response.status, 200);
});

Deno.test("a preflight is answered without any read", async () => {
  const harness = createHarness();

  const response = await harness.handler(
    request(PAIRING_ENDPOINT, undefined, { method: "OPTIONS" }),
  );

  assertEquals(response.status, 204);
  assertEquals(harness.admin.authCalls(), 0);
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.configReads(), 0);
});

Deno.test("another method is refused", async () => {
  const harness = createHarness();

  const response = await harness.handler(
    request(PAIRING_ENDPOINT, undefined, { method: "GET" }),
  );

  assertEquals(response.status, 405);
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test("a slow authorization never reaches the provider", async () => {
  const harness = createHarness({
    admin: createFakeAdmin({
      userId: "user-1",
      role: "admin",
      delayMs: 60,
    }),
    fenceMs: 10,
  });

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "connect" }),
      { headers: adminHeaders() },
    ),
  );

  assertEquals(response.status, 504);
  assertEquals(harness.provider.calls.length, 0);
  await harness.admin.settleAuthDelay();
});

Deno.test("a missing configuration is a service failure", async () => {
  const harness = createHarness({ apiKey: "" });

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "status" }),
      { headers: adminHeaders() },
    ),
  );

  assertEquals(response.status, 503);
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test("another configured origin is refused", async () => {
  const harness = createHarness({
    origin: "http://curemedkw-evultionapi-wrtdxe:8080",
  });

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "status" }),
      { headers: adminHeaders() },
    ),
  );

  assertEquals(response.status, 503);
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test("a provider failure is a fixed safe error", async () => {
  const harness = createHarness({
    answer: () =>
      jsonBody({ error: true, message: `the provider said ${KEY_MARKER}` }),
  });

  const response = await harness.handler(
    request(
      PAIRING_ENDPOINT,
      JSON.stringify({ action: "status" }),
      { headers: adminHeaders() },
    ),
  );

  assertEquals(response.status, 502);
  assertEquals(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assertEquals(body.success, false);
  assertEquals(Object.keys(body), ["success", "error"]);
  assertEquals(Object.keys(body.error), ["code", "message"]);
  assert(!JSON.stringify(body).includes(KEY_MARKER));
});

function createWebhook(
  secret: string | undefined = HOOK_MARKER,
): (req: Request) => Promise<Response> {
  return createEvolutionPairingWebhookHandler({
    readSecret: () => secret,
  });
}

Deno.test("a webhook without the header is refused", async () => {
  const handler = createWebhook();

  const response = await handler(
    request(
      WEBHOOK_ENDPOINT,
      JSON.stringify({ instance: "curemed", event: "connection.update" }),
    ),
  );

  assertEquals(response.status, 401);
});

Deno.test("a webhook with a wrong header is refused", async () => {
  const handler = createWebhook();

  const response = await handler(
    request(
      WEBHOOK_ENDPOINT,
      JSON.stringify({ instance: "curemed", event: "connection.update" }),
      { headers: { "x-curemed-webhook-key": "another-secret" } },
    ),
  );

  assertEquals(response.status, 401);
});

Deno.test("an empty configured webhook secret fails closed", async () => {
  const handler = createWebhook("   ");

  const response = await handler(
    request(
      WEBHOOK_ENDPOINT,
      JSON.stringify({ instance: "curemed", event: "connection.update" }),
      { headers: { "x-curemed-webhook-key": HOOK_MARKER } },
    ),
  );

  assertEquals(response.status, 503);
});

Deno.test("a native apikey never authorizes the webhook", async () => {
  const handler = createWebhook();

  const response = await handler(
    request(
      WEBHOOK_ENDPOINT,
      JSON.stringify({
        apikey: KEY_MARKER,
        instance: "curemed",
        event: "connection.update",
      }),
    ),
  );

  assertEquals(response.status, 401);
});

Deno.test("a foreign instance is refused by the webhook", async () => {
  const handler = createWebhook();

  const response = await handler(
    request(
      WEBHOOK_ENDPOINT,
      JSON.stringify({ instance: "romani", event: "connection.update" }),
      { headers: { "x-curemed-webhook-key": HOOK_MARKER } },
    ),
  );

  assertEquals(response.status, 400);
});

Deno.test("an unknown event is refused by the webhook", async () => {
  const handler = createWebhook();
  const refused = [
    "messages.upsert",
    "qrcode.update",
    "connection.update.extra",
    "CONNECTION_UPDATE",
  ];

  for (const event of refused) {
    const response = await handler(
      request(
        WEBHOOK_ENDPOINT,
        JSON.stringify({ instance: "curemed", event }),
        { headers: { "x-curemed-webhook-key": HOOK_MARKER } },
      ),
    );
    assertEquals(response.status, 400);
  }
});

Deno.test("a QR or a message payload is refused by the webhook", async () => {
  const handler = createWebhook();

  const response = await handler(
    request(
      WEBHOOK_ENDPOINT,
      JSON.stringify({
        instance: "curemed",
        event: "connection.update",
        base64: "iVBORw0KGgo=",
      }),
      { headers: { "x-curemed-webhook-key": HOOK_MARKER } },
    ),
  );

  assertEquals(response.status, 400);
});

Deno.test("nested QR and message payloads are refused by the webhook", async () => {
  const handler = createWebhook();
  for (const key of ["message", "messages", "base64", "qrcode", "qr"]) {
    const response = await handler(
      request(
        WEBHOOK_ENDPOINT,
        JSON.stringify({
          instance: "curemed",
          event: "connection.update",
          data: { state: "open", [key]: "synthetic payload" },
        }),
        { headers: { "x-curemed-webhook-key": HOOK_MARKER } },
      ),
    );
    assertEquals(response.status, 400, `nested ${key} must be refused`);
    assertEquals(response.headers.get("cache-control"), "no-store");
    assertEquals((await response.json()).error.code, "invalid_request");
  }
});

Deno.test("a valid connection update is acknowledged without a write", async () => {
  const handler = createWebhook();
  const body = JSON.stringify({
    instance: "curemed",
    event: "connection.update",
    data: { state: "open" },
    apikey: KEY_MARKER,
    sender: "curemed",
    destination: "curemed",
    server_url: "http://curemed-evolution:8080",
  });

  const response = await handler(
    request(
      WEBHOOK_ENDPOINT,
      body,
      { headers: { "x-curemed-webhook-key": HOOK_MARKER } },
    ),
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "no-store");
  const answer = await response.json();
  assertEquals(answer, {
    success: true,
    acknowledged: true,
    instance: "curemed",
    state: "connected",
  });
  assert(!JSON.stringify(answer).includes(KEY_MARKER));
  assert(!JSON.stringify(answer).includes("server_url"));
});

Deno.test("a replayed acknowledgement changes nothing", async () => {
  const handler = createWebhook();
  const body = JSON.stringify({
    instance: "curemed",
    event: "connection.update",
    data: { state: "open" },
  });
  const headers = { "x-curemed-webhook-key": HOOK_MARKER };

  const first = await handler(request(WEBHOOK_ENDPOINT, body, { headers }));
  const second = await handler(request(WEBHOOK_ENDPOINT, body, { headers }));

  assertEquals(first.status, 200);
  assertEquals(second.status, 200);
  assertEquals(await first.json(), await second.json());
});

Deno.test("an unknown webhook state is acknowledged as unknown", async () => {
  const handler = createWebhook();

  const response = await handler(
    request(
      WEBHOOK_ENDPOINT,
      JSON.stringify({
        instance: "curemed",
        event: "connection.update",
        data: { state: "something-new" },
      }),
      { headers: { "x-curemed-webhook-key": HOOK_MARKER } },
    ),
  );

  assertEquals(response.status, 200);
  const answer = await response.json();
  assertEquals(answer.state, "unknown");
});

Deno.test("the webhook refuses another method", async () => {
  const handler = createWebhook();

  const response = await handler(
    request(WEBHOOK_ENDPOINT, undefined, { method: "GET" }),
  );

  assertEquals(response.status, 405);
});

Deno.test("an oversized webhook body is refused", async () => {
  const handler = createWebhook();

  const response = await handler(
    request(
      WEBHOOK_ENDPOINT,
      JSON.stringify({
        instance: "curemed",
        event: "connection.update",
        pad: "x".repeat(40_000),
      }),
      { headers: { "x-curemed-webhook-key": HOOK_MARKER } },
    ),
  );

  assertEquals(response.status, 413);
});
