// Behavioural tests for the Shipa HTTP client.
//
// The real client, the real validators and the real parsers run here. The
// only substitute is the fetch boundary, which is injected as a fake. No test
// in this file reaches the network, reads an environment variable or uses a
// real credential.

import { assertEquals } from "jsr:@std/assert@1.0.19";

import {
  SHIPA_MAX_RESPONSE_BYTES,
  ShipaClient,
} from "../../_shared/shipa-client.ts";
import {
  countryFixture,
  countryListFixture,
  countryWithoutCodeFixture,
  createAcceptedFixture,
  createFakeFetch,
  createWithoutReferenceFixture,
  declaredOversizedResponse,
  disconnectingBodyResponse,
  draftWithExtraField,
  emptyResponse,
  jsonResponse,
  LIVE_ORIGIN,
  orderDetailFixture,
  oversizedBodyResponse,
  SANDBOX_ORIGIN,
  stallingBodyResponse,
  storyFixture,
  TEST_API_KEY as key,
  textResponse,
  trackingFixture,
  validOrderDraft,
} from "./shipa-fixtures.ts";

function sandboxClient(
  fetchImpl: ReturnType<typeof createFakeFetch>["fetch"],
  deadlineMs = 2000,
): ShipaClient {
  return new ShipaClient({
    environment: "sandbox",
    apiKey: key,
    fetchImpl,
    deadlineMs,
  });
}

// ---------------------------------------------------------------------------
// Authentication and environment isolation
// ---------------------------------------------------------------------------

Deno.test("sends the key as an encoded query parameter", async () => {
  const fake = createFakeFetch(() => jsonResponse({ status: "OK" }));
  const client = sandboxClient(fake.fetch);

  const result = await client.health();

  assertEquals(result.ok, true);
  assertEquals(fake.requests.length, 1);

  const url = new URL(fake.requests[0].url);
  assertEquals(url.origin, SANDBOX_ORIGIN);
  assertEquals(url.pathname, "/v2/health");
  assertEquals(url.searchParams.get("apikey"), key);
  assertEquals(fake.requests[0].method, "GET");
  assertEquals(fake.requests[0].headers["accept"], "application/json");
  // No invented authorization or idempotency header.
  assertEquals("authorization" in fake.requests[0].headers, false);
  assertEquals("x-idempotency-key" in fake.requests[0].headers, false);
  assertEquals(fake.requests[0].body, null);
});

Deno.test("encodes a key that needs escaping into a single parameter", async () => {
  const fake = createFakeFetch(() => jsonResponse({ status: "OK" }));
  const client = new ShipaClient({
    environment: "sandbox",
    apiKey: "test+key&more=1",
    fetchImpl: fake.fetch,
    deadlineMs: 2000,
  });

  await client.health();

  const url = new URL(fake.requests[0].url);
  assertEquals(url.searchParams.get("apikey"), "test+key&more=1");
  assertEquals(Array.from(url.searchParams.keys()), ["apikey"]);
  assertEquals(url.searchParams.get("more"), null);
});

Deno.test("never exposes the key in a returned value", async () => {
  const fake = createFakeFetch(() => jsonResponse({ status: "OK" }));
  const client = sandboxClient(fake.fetch);

  const result = await client.health();

  assertEquals(JSON.stringify(result).includes(key), false);
  assertEquals(JSON.stringify(result).includes("apikey"), false);
});

Deno.test("never exposes the request url or an upstream failure text", async () => {
  const fake = createFakeFetch(() => {
    throw new Error(
      "request to https://sandbox-api.shipadelivery.com/v2/orders?apikey=test-key failed",
    );
  });
  const client = sandboxClient(fake.fetch);

  const result = await client.createOrder(validOrderDraft());

  assertEquals(result, { outcome: "uncertain", code: "network_error" });
  assertEquals(JSON.stringify(result).includes(key), false);
  assertEquals(JSON.stringify(result).includes("apikey"), false);
  assertEquals(JSON.stringify(result).includes("https"), false);
});

Deno.test("keeps sandbox and live apart", async () => {
  const sandboxFake = createFakeFetch(() => jsonResponse({ status: "OK" }));
  const liveFake = createFakeFetch(() => jsonResponse({ status: "OK" }));

  const sandbox = sandboxClient(sandboxFake.fetch);
  const live = new ShipaClient({
    environment: "live",
    apiKey: key,
    fetchImpl: liveFake.fetch,
    deadlineMs: 2000,
  });

  await sandbox.health();
  await live.health();

  assertEquals(
    new URL(sandboxFake.requests[0].url).origin,
    SANDBOX_ORIGIN,
  );
  assertEquals(new URL(liveFake.requests[0].url).origin, LIVE_ORIGIN);
  assertEquals(sandbox.environment, "sandbox");
  assertEquals(live.environment, "live");
});

// ---------------------------------------------------------------------------
// Redirects
// ---------------------------------------------------------------------------

Deno.test("refuses a redirect and never follows it", async () => {
  const fake = createFakeFetch(() =>
    new Response(null, {
      status: 302,
      headers: { location: "https://elsewhere.example/orders" },
    })
  );
  const client = sandboxClient(fake.fetch);

  const result = await client.createOrder(validOrderDraft());

  assertEquals(result, { outcome: "uncertain", code: "redirect_refused" });
  assertEquals(fake.requests.length, 1);
  assertEquals(fake.requests[0].redirect, "manual");
});

// ---------------------------------------------------------------------------
// Creation outcomes
// ---------------------------------------------------------------------------

Deno.test("accepts a creation that carries a provider reference", async () => {
  const fake = createFakeFetch(() => jsonResponse(createAcceptedFixture()));
  const client = sandboxClient(fake.fetch);

  const result = await client.createOrder(validOrderDraft());

  assertEquals(result, {
    outcome: "accepted",
    shipaRef: "SR-2026-0001",
    orderStatus: "Created",
  });

  const url = new URL(fake.requests[0].url);
  assertEquals(url.pathname, "/v2/orders");
  assertEquals(fake.requests[0].method, "POST");
  assertEquals(fake.requests[0].headers["content-type"], "application/json");

  const sent = JSON.parse(fake.requests[0].body ?? "{}");
  assertEquals(sent.type, "Delivery");
  assertEquals(sent.category, "Next Day");
  assertEquals(sent.origin.country, "KWT");
  assertEquals(sent.destination.country, "KWT");
  assertEquals(sent.destination.options.amountToCollect, 0);
  assertEquals(sent.packages[0].weight, 1.5);
});

Deno.test("treats a success without a provider reference as uncertain", async () => {
  const fake = createFakeFetch(() =>
    jsonResponse(createWithoutReferenceFixture())
  );
  const client = sandboxClient(fake.fetch);

  const result = await client.createOrder(validOrderDraft());

  assertEquals(result, { outcome: "uncertain", code: "missing_reference" });
});

Deno.test("treats a malformed success body as uncertain", async () => {
  const fake = createFakeFetch(() => textResponse("not json at all"));
  const client = sandboxClient(fake.fetch);

  const result = await client.createOrder(validOrderDraft());

  assertEquals(result, { outcome: "uncertain", code: "malformed_response" });
});

Deno.test("treats a server error as uncertain and never retries", async () => {
  const fake = createFakeFetch(() =>
    jsonResponse({ code: 500 }, { status: 503 })
  );
  const client = sandboxClient(fake.fetch);

  const result = await client.createOrder(validOrderDraft());

  assertEquals(result, { outcome: "uncertain", code: "server_error" });
  assertEquals(fake.requests.length, 1);
});

Deno.test("treats a rate limit as uncertain and never retries", async () => {
  const fake = createFakeFetch(() =>
    jsonResponse({ code: 429 }, { status: 429 })
  );
  const client = sandboxClient(fake.fetch);

  const result = await client.createOrder(validOrderDraft());

  assertEquals(result, { outcome: "uncertain", code: "rate_limited" });
  assertEquals(fake.requests.length, 1);
});

Deno.test("treats a validation status as uncertain because rejection is not proven", async () => {
  const fake = createFakeFetch(() =>
    jsonResponse({ code: 400, message: "Validation failed" }, { status: 400 })
  );
  const client = sandboxClient(fake.fetch);

  const result = await client.createOrder(validOrderDraft());

  // The captured reference documents generic 4XX errors without proving that
  // the rejection happened before an order was created, so the outcome stays
  // uncertain and is never automatically retried.
  assertEquals(result, { outcome: "uncertain", code: "unexpected_status" });
  assertEquals(fake.requests.length, 1);
});

Deno.test("reports a local rejection without sending anything", async () => {
  const fake = createFakeFetch(() => jsonResponse(createAcceptedFixture()));
  const client = sandboxClient(fake.fetch);

  const draft = draftWithExtraField(validOrderDraft(), "amountToCollect", 25);
  const result = await client.createOrder(draft);

  assertEquals(result.outcome, "rejected_local");
  assertEquals(fake.requests.length, 0);
});

// ---------------------------------------------------------------------------
// Deadlines and bounded reads
// ---------------------------------------------------------------------------

Deno.test("aborts a stalled response body when the deadline expires", async () => {
  const fake = createFakeFetch((request) =>
    stallingBodyResponse(request.signal)
  );
  const client = sandboxClient(fake.fetch, 60);

  const result = await client.health();

  assertEquals(result, { ok: false, code: "timeout" });
  assertEquals(fake.requests[0].signal.aborted, true);
});

Deno.test("bounds uncooperative fetch, body read and cancellation", async () => {
  const scenarios = [
    () => new Promise<Response>(() => {}),
    () => new Response(new ReadableStream<Uint8Array>({ start() {} })),
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            return new Promise<void>(() => {});
          },
        }),
        { status: 302 },
      ),
  ];
  for (const scenario of scenarios) {
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      const client = sandboxClient(createFakeFetch(scenario).fetch, 15);
      const result = await Promise.race([
        client.health(),
        new Promise<"unbounded">((resolve) => {
          watchdog = setTimeout(() => resolve("unbounded"), 200);
        }),
      ]);
      assertEquals(result === "unbounded", false);
      if (result !== "unbounded") assertEquals(result.ok, false);
    } finally {
      clearTimeout(watchdog);
    }
  }
});

Deno.test("stops at the declared content length without reading the body", async () => {
  const fake = createFakeFetch(() => declaredOversizedResponse());
  const client = sandboxClient(fake.fetch, 500);

  const result = await client.health();

  // A body that never ends would time out if the declared length were
  // ignored, so this result also proves the length was honoured.
  assertEquals(result, { ok: false, code: "response_too_large" });
});

Deno.test("stops at the streamed size limit", async () => {
  const fake = createFakeFetch(() => oversizedBodyResponse());
  const client = sandboxClient(fake.fetch, 2000);

  const result = await client.health();

  assertEquals(result, { ok: false, code: "response_too_large" });
  assertEquals(SHIPA_MAX_RESPONSE_BYTES, 512 * 1024);
});

Deno.test("reports a dropped connection as a network failure", async () => {
  const fake = createFakeFetch(() => disconnectingBodyResponse());
  const client = sandboxClient(fake.fetch, 2000);

  const result = await client.createOrder(validOrderDraft());

  assertEquals(result, { outcome: "uncertain", code: "network_error" });
});

Deno.test("does not leave a pending timer behind after a fast answer", async () => {
  const fake = createFakeFetch(() => jsonResponse({ status: "OK" }));
  const client = sandboxClient(fake.fetch, 5000);

  const result = await client.health();

  assertEquals(result.ok, true);
  // The request completed before the deadline, so the abort signal was
  // never triggered. A leaked timer would also fail the Deno op sanitizer.
  assertEquals(fake.requests[0].signal.aborted, false);
});

// ---------------------------------------------------------------------------
// Reference handling
// ---------------------------------------------------------------------------

Deno.test("refuses an unsafe order reference without sending anything", async () => {
  const fake = createFakeFetch(() => jsonResponse({}));
  const client = sandboxClient(fake.fetch);

  assertEquals(await client.getOrderDetail(""), {
    ok: false,
    code: "invalid_order_ref",
  });
  assertEquals(await client.getOrderDetail(".."), {
    ok: false,
    code: "invalid_order_ref",
  });
  assertEquals(await client.getOrderDetail("orders/1"), {
    ok: false,
    code: "invalid_order_ref",
  });
  assertEquals(fake.requests.length, 0);
});

Deno.test("encodes a provider reference into the path", async () => {
  const fake = createFakeFetch(() => jsonResponse({ shipaRef: "SR-1" }));
  const client = sandboxClient(fake.fetch);

  await client.getOrderDetail("SR-2026-0001");

  assertEquals(
    new URL(fake.requests[0].url).pathname,
    "/v2/orders/SR-2026-0001",
  );
});

// ---------------------------------------------------------------------------
// Read-only parsing
// ---------------------------------------------------------------------------

Deno.test("reads the health document", async () => {
  const fake = createFakeFetch(() => jsonResponse({ status: "OK" }));
  const client = sandboxClient(fake.fetch);

  const result = await client.health();

  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.data.status, "OK");
});

Deno.test("reads a country document that carries no code property", async () => {
  const fake = createFakeFetch(() => jsonResponse(countryWithoutCodeFixture()));
  const client = sandboxClient(fake.fetch);

  const result = await client.getCountry("KWT");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.name, "Kuwait");
    assertEquals(result.data.isoAlpha3, "KWT");
    assertEquals(result.data.cities.length, 1);
    assertEquals(result.data.cities[0].name, "Kuwait City");
  }
  assertEquals(
    new URL(fake.requests[0].url).pathname,
    "/v2/countries/KWT",
  );
});

Deno.test("reads a country with its cities", async () => {
  const fake = createFakeFetch(() => jsonResponse(countryFixture()));
  const client = sandboxClient(fake.fetch);

  const result = await client.getCountry("KWT");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.cities.length, 3);
    assertEquals(result.data.cities[0].state, "Al Asimah");
  }
});

Deno.test("refuses a country code that is not an ISO3 code", async () => {
  const fake = createFakeFetch(() => jsonResponse(countryFixture()));
  const client = sandboxClient(fake.fetch);

  assertEquals(await client.getCountry("kwt"), {
    ok: false,
    code: "invalid_request",
  });
  assertEquals(fake.requests.length, 0);
});

Deno.test("reads the country directory", async () => {
  const fake = createFakeFetch(() => jsonResponse(countryListFixture()));
  const client = sandboxClient(fake.fetch);

  const result = await client.listCountries();

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.length, 2);
    assertEquals(result.data[0].isoAlpha3, "KWT");
  }
});

Deno.test("never reports a malformed document as an empty success", async () => {
  const fake = createFakeFetch(() => jsonResponse({ countries: [] }));
  const client = sandboxClient(fake.fetch);

  const result = await client.listCountries();

  assertEquals(result, { ok: false, code: "invalid_response" });
});

Deno.test("reads an order detail with its identity facts", async () => {
  const fake = createFakeFetch(() => jsonResponse(orderDetailFixture()));
  const client = sandboxClient(fake.fetch);

  const result = await client.getOrderDetail("cm-order-0001");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.shipaRef, "SR-2026-0001");
    assertEquals(result.data.customerRef, "cm-order-0001");
    assertEquals(result.data.status, "Pending Pickup Confirmation");
    assertEquals(result.data.storyStatusId, 2);
    assertEquals(result.data.destination?.city, "Hawalli");
    assertEquals(result.data.packages.length, 1);
    assertEquals(result.data.packages[0].shipaRef, "PKG-0001");
    // The customer phone is deliberately not copied out of the document.
    assertEquals(JSON.stringify(result).includes("+96550000002"), false);
  }
});

Deno.test("reports a missing order as not found", async () => {
  const fake = createFakeFetch(() => emptyResponse(404));
  const client = sandboxClient(fake.fetch);

  assertEquals(await client.getOrderDetail("cm-order-0001"), {
    ok: false,
    code: "not_found",
  });
});

Deno.test("reads an order history", async () => {
  const fake = createFakeFetch(() => jsonResponse(storyFixture()));
  const client = sandboxClient(fake.fetch);

  const result = await client.getOrderStory("SR-2026-0001");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.length, 2);
    assertEquals(result.data[0].statusCode, "1");
    assertEquals(result.data[1].status, "Ready For Pickup");
  }
  assertEquals(
    new URL(fake.requests[0].url).pathname,
    "/v2/orders/SR-2026-0001/story",
  );
});

Deno.test("never reports a malformed history as an empty success", async () => {
  const fake = createFakeFetch(() => jsonResponse({ entries: [] }));
  const client = sandboxClient(fake.fetch);

  assertEquals(await client.getOrderStory("SR-2026-0001"), {
    ok: false,
    code: "invalid_response",
  });
});

Deno.test("reads a live tracking position", async () => {
  const fake = createFakeFetch(() => jsonResponse(trackingFixture()));
  const client = sandboxClient(fake.fetch);

  const result = await client.getTracking("SR-2026-0001");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.available, true);
    if (result.data.available) {
      assertEquals(result.data.location.latitude, 29.3759);
      assertEquals(result.data.eta, "12:45");
    }
  }
});

Deno.test("treats a null tracking answer as no live position", async () => {
  const fake = createFakeFetch(() => jsonResponse(null));
  const client = sandboxClient(fake.fetch);

  const result = await client.getTracking("SR-2026-0001");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.available, false);
  }
});

Deno.test("refuses a tracking position outside the coordinate bounds", async () => {
  const fake = createFakeFetch(() =>
    jsonResponse({ location: { latitude: 91, longitude: 47.9 } })
  );
  const client = sandboxClient(fake.fetch);

  assertEquals(await client.getTracking("SR-2026-0001"), {
    ok: false,
    code: "invalid_response",
  });
});
