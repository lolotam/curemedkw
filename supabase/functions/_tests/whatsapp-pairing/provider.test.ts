// Curemed — the tests of the fixed provider client.
//
// The real client and the real safe parser run here. Only the fetch
// boundary is replaced, so the fixed path, the instance token header, the
// deadline, the body cap, the redirect refusal and the projection of the
// provider answer are all exercised for real.
//
// No test reaches a network and no real credential appears.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";

import {
  EVOLUTION_ALLOWED_ORIGIN,
  EVOLUTION_API_KEY_HEADER,
  EVOLUTION_INSTANCE,
  EvolutionPairingClient,
  EvolutionPairingError,
} from "../../_shared/evolution-pairing.ts";
import {
  createFakeProvider,
  createHangingProvider,
  jsonBody,
  KEY_MARKER,
  rawBody,
} from "./fixtures.ts";

const PNG_QR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==";

Deno.test("canonical base64 without a complete PNG remains a safe no-QR result", async () => {
  for (const base64 of ["SGVsbG8=", "iVBORw0KGgo=", "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"]) {
    const provider = createFakeProvider(() => jsonBody({ base64 }));
    assertEquals(await client(provider.fetch).requestConnect(), { state: "unknown", qrDataUrl: null });
    assertEquals(provider.calls.length, 1);
  }
});

Deno.test("a foreign top-level identity cannot accompany a flat QR", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({ instanceName: "romani", base64: PNG_QR })
  );
  const error = await assertRejects(
    () => client(provider.fetch).requestConnect(),
    EvolutionPairingError,
  );
  assertEquals(error.code, "identity_mismatch");
});

async function observedWithin<T>(
  pending: Promise<T>,
): Promise<T | "still_waiting"> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<"still_waiting">((resolve) => {
        timer = setTimeout(() => resolve("still_waiting"), 40);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

Deno.test("provider waiting is bounded even when fetch ignores abort", async () => {
  const delayed = Promise.withResolvers<Response>();
  const pending = client(() => delayed.promise, 5).readStatus().then(
    () => "accepted",
    (error: unknown) =>
      error instanceof EvolutionPairingError ? error.code : "other",
  );
  const observed = await observedWithin(pending);
  delayed.resolve(
    jsonBody({ instance: { instanceName: "curemed", state: "close" } }),
  );
  await pending;
  assertEquals(observed, "timeout");
});

Deno.test("the provider deadline cancels a stalled response body", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const pending = client(() => Promise.resolve(new Response(body)), 5)
    .readStatus().then(
      () => "accepted",
      (error: unknown) =>
        error instanceof EvolutionPairingError ? error.code : "other",
    );
  assertEquals(await observedWithin(pending), "timeout");
  assertEquals(cancelled, true);
});

function client(
  fetchImpl: ReturnType<typeof createFakeProvider>["fetch"],
  deadlineMs?: number,
): EvolutionPairingClient {
  return new EvolutionPairingClient({
    origin: EVOLUTION_ALLOWED_ORIGIN,
    apiKey: KEY_MARKER,
    fetchImpl,
    deadlineMs,
  });
}

Deno.test("the status request uses the fixed path and the instance token", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({ instance: { instanceName: "curemed", state: "open" } })
  );

  const connection = await client(provider.fetch).readStatus();

  assertEquals(provider.calls.length, 1);
  assertEquals(
    provider.calls[0].url,
    `${EVOLUTION_ALLOWED_ORIGIN}/instance/connectionState/${EVOLUTION_INSTANCE}`,
  );
  const headers = provider.calls[0].init?.headers as Record<string, string>;
  assertEquals(headers[EVOLUTION_API_KEY_HEADER], KEY_MARKER);
  assertEquals(provider.calls[0].init?.method, "GET");
  assertEquals(provider.calls[0].init?.redirect, "manual");
  assertEquals(connection, { state: "connected", qrDataUrl: null });
});

Deno.test("the connect request uses the fixed path and asks once", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({ base64: PNG_QR.replace("data:image/png;base64,", "") })
  );

  const connection = await client(provider.fetch).requestConnect();

  assertEquals(provider.calls.length, 1);
  assertEquals(
    provider.calls[0].url,
    `${EVOLUTION_ALLOWED_ORIGIN}/instance/connect/${EVOLUTION_INSTANCE}`,
  );
  assertEquals(connection, { state: "connecting", qrDataUrl: PNG_QR });
});

Deno.test("a foreign instance identity always fails", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({ instance: { instanceName: "romani", state: "open" } })
  );

  const error = await assertRejects(
    () => client(provider.fetch).readStatus(),
    EvolutionPairingError,
  );

  assertEquals(error.code, "identity_mismatch");
});

Deno.test("a foreign identity in a connect answer always fails", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({ instance: { instanceName: "romani", state: "close" } })
  );

  const error = await assertRejects(
    () => client(provider.fetch).requestConnect(),
    EvolutionPairingError,
  );

  assertEquals(error.code, "identity_mismatch");
});

Deno.test("the flat pairing answer is accepted without an invented identity", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({
      base64: PNG_QR.replace("data:image/png;base64,", ""),
      code: "2ABCDEF",
      pairingCode: "12345678",
      count: 1,
    })
  );

  const connection = await client(provider.fetch).requestConnect();

  assertEquals(connection.state, "connecting");
  assertEquals(connection.qrDataUrl, PNG_QR);
});

Deno.test("an already open instance answers without a QR", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({ instance: { instanceName: "curemed", state: "open" } })
  );

  const connection = await client(provider.fetch).requestConnect();

  assertEquals(connection, { state: "connected", qrDataUrl: null });
});

Deno.test("a missing state is unknown and never connected", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({ instance: { instanceName: "curemed" } })
  );

  const connection = await client(provider.fetch).readStatus();

  assertEquals(connection, { state: "unknown", qrDataUrl: null });
});

Deno.test("a status answer without the nested identity is refused", async () => {
  const provider = createFakeProvider(() => jsonBody({ state: "open" }));

  const error = await assertRejects(
    () => client(provider.fetch).readStatus(),
    EvolutionPairingError,
  );

  assertEquals(error.code, "invalid_response");
});

Deno.test("a missing instance token is refused", () => {
  let failed = false;
  try {
    new EvolutionPairingClient({
      origin: EVOLUTION_ALLOWED_ORIGIN,
      apiKey: "   ",
      fetchImpl: createFakeProvider(() => jsonBody({})).fetch,
    });
  } catch (error) {
    failed = true;
    assert(error instanceof EvolutionPairingError);
    assertEquals(error.code, "invalid_config");
  }
  assert(failed, "a blank instance token must be refused");
});

Deno.test("another origin is refused", () => {
  let failed = false;
  try {
    new EvolutionPairingClient({
      origin: "http://curemedkw-evultionapi-wrtdxe:8080",
      apiKey: KEY_MARKER,
      fetchImpl: createFakeProvider(() => jsonBody({})).fetch,
    });
  } catch (error) {
    failed = true;
    assert(error instanceof EvolutionPairingError);
    assertEquals(error.code, "invalid_config");
  }
  assert(failed, "another origin must be refused");
});

Deno.test("an origin with a path, a query or credentials is refused", () => {
  const refused = [
    `${EVOLUTION_ALLOWED_ORIGIN}/other`,
    `${EVOLUTION_ALLOWED_ORIGIN}?instance=romani`,
    "http://user:secret@curemed-evolution:8080",
  ];

  for (const origin of refused) {
    let failed = false;
    try {
      new EvolutionPairingClient({
        origin,
        apiKey: KEY_MARKER,
        fetchImpl: createFakeProvider(() => jsonBody({})).fetch,
      });
    } catch (error) {
      failed = true;
      assert(error instanceof EvolutionPairingError);
    }
    assert(failed, `the origin ${origin} must be refused`);
  }
});

Deno.test("the deadline stops a provider that does not answer", async () => {
  const provider = createHangingProvider();

  const error = await assertRejects(
    () => client(provider.fetch, 20).readStatus(),
    EvolutionPairingError,
  );

  assertEquals(error.code, "timeout");
  assertEquals(provider.calls.length, 1);
});

Deno.test("an already aborted call never reaches the provider", async () => {
  const provider = createFakeProvider(() => jsonBody({}));
  const controller = new AbortController();
  controller.abort();

  const error = await assertRejects(
    () => client(provider.fetch).readStatus(controller.signal),
    EvolutionPairingError,
  );

  assertEquals(error.code, "aborted");
  assertEquals(provider.calls.length, 0);
});

Deno.test("an oversized answer is refused without a declared length", async () => {
  const provider = createFakeProvider(() => rawBody("x".repeat(600 * 1024)));

  const error = await assertRejects(
    () => client(provider.fetch).readStatus(),
    EvolutionPairingError,
  );

  assertEquals(error.code, "response_too_large");
});

Deno.test("a declared length above the cap is refused", async () => {
  const provider = createFakeProvider(() =>
    rawBody("x".repeat(600 * 1024), 200, { "content-length": "999999999" })
  );

  const error = await assertRejects(
    () => client(provider.fetch).readStatus(),
    EvolutionPairingError,
  );

  assertEquals(error.code, "response_too_large");
});

Deno.test("a redirect is refused", async () => {
  const provider = createFakeProvider(() =>
    rawBody("moved", 302, { location: "http://elsewhere.invalid/" })
  );

  const error = await assertRejects(
    () => client(provider.fetch).readStatus(),
    EvolutionPairingError,
  );

  assertEquals(error.code, "provider_unavailable");
});

Deno.test("a refused instance token is a failure", async () => {
  const provider = createFakeProvider(() => rawBody("denied", 401));

  const error = await assertRejects(
    () => client(provider.fetch).readStatus(),
    EvolutionPairingError,
  );

  assertEquals(error.code, "unauthorized");
});

Deno.test("an error body inside a 200 answer is a failure", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({ error: true, message: "the provider said something" })
  );

  const error = await assertRejects(
    () => client(provider.fetch).requestConnect(),
    EvolutionPairingError,
  );

  assertEquals(error.code, "provider_unavailable");
});

Deno.test("a failure never carries the token or the provider body", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({ error: true, message: `secret ${KEY_MARKER}` })
  );

  const error = await assertRejects(
    () => client(provider.fetch).requestConnect(),
    EvolutionPairingError,
  );

  assert(!error.message.includes(KEY_MARKER));
  assert(!error.message.includes("secret"));
});

Deno.test("an unusable QR stays a safe no QR state", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({ base64: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", count: 1 })
  );

  const connection = await client(provider.fetch).requestConnect();

  assertEquals(connection.qrDataUrl, null);
  assertEquals(connection.state, "unknown");
});

Deno.test("an empty QR answer stays a safe no QR state", async () => {
  const provider = createFakeProvider(() => jsonBody({ base64: "", count: 0 }));

  const connection = await client(provider.fetch).requestConnect();

  assertEquals(connection, { state: "unknown", qrDataUrl: null });
});

Deno.test("an unknown answer shape is refused", async () => {
  const provider = createFakeProvider(() => rawBody("not json at all"));

  const error = await assertRejects(
    () => client(provider.fetch).readStatus(),
    EvolutionPairingError,
  );

  assertEquals(error.code, "invalid_response");
});

Deno.test("a failed request is never repeated", async () => {
  const provider = createFakeProvider(() => rawBody("denied", 500));

  await assertRejects(
    () => client(provider.fetch).readStatus(),
    EvolutionPairingError,
  );

  assertEquals(provider.calls.length, 1);
});

Deno.test("a connect is never followed by a state probe", async () => {
  const provider = createFakeProvider(() =>
    jsonBody({ base64: PNG_QR.replace("data:image/png;base64,", "") })
  );

  await client(provider.fetch).requestConnect();

  assertEquals(provider.calls.length, 1);
  assert(provider.calls[0].url.endsWith("/instance/connect/curemed"));
});
