// Synthetic fixtures and the fake fetch boundary for the Shipa adapter tests.
//
// Nothing in this file talks to Shipa. The fake fetch is the only network
// boundary the tests use, and every provider document below is synthetic: no
// credential, no customer data, no real address, no real phone number.
//
// The dummy key is deliberately short and obvious so that a secret scanner
// does not flag it.

import {
  SHIPA_MAX_RESPONSE_BYTES,
  type ShipaFetch,
} from "../../_shared/shipa-client.ts";
import type {
  ShipaOrderDraft,
  ShipaPackageDraft,
  ShipaPartyDraft,
} from "../../_shared/shipa-contract.ts";

/** A dummy key that only the fake fetch ever sees. */
export const TEST_API_KEY = "test-key";

/** The captured origins, repeated here so a test can assert the host. */
export const SANDBOX_ORIGIN = "https://sandbox-api.shipadelivery.com";
export const LIVE_ORIGIN = "https://api.shipadelivery.com";

// ---------------------------------------------------------------------------
// Fake fetch boundary
// ---------------------------------------------------------------------------

export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | null;
  readonly signal: AbortSignal;
  /** The redirect mode the client asked for. */
  readonly redirect: RequestInit["redirect"];
}

export type FakeHandler = (
  request: RecordedRequest,
) => Response | Promise<Response>;

export interface FakeFetch {
  readonly fetch: ShipaFetch;
  readonly requests: RecordedRequest[];
}

/**
 * Builds a fetch that records every request and answers with whatever the
 * handler returns.
 */
export function createFakeFetch(handler: FakeHandler): FakeFetch {
  const requests: RecordedRequest[] = [];
  const fetchImpl: ShipaFetch = async (url, init) => {
    const headers: Record<string, string> = {};
    const raw = init.headers;
    if (
      raw !== undefined &&
      raw !== null &&
      !Array.isArray(raw) &&
      !(raw instanceof Headers)
    ) {
      for (const [key, value] of Object.entries(raw)) {
        headers[key.toLowerCase()] = value;
      }
    }
    const record: RecordedRequest = {
      url,
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? init.body : null,
      signal: init.signal ?? new AbortController().signal,
      redirect: init.redirect,
    };
    requests.push(record);
    return await handler(record);
  };
  return { fetch: fetchImpl, requests };
}

/** A JSON response. */
export function jsonResponse(
  payload: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** A response with a body that is not JSON. */
export function textResponse(
  text: string,
  status = 200,
): Response {
  return new Response(text, {
    status,
    headers: { "content-type": "text/plain" },
  });
}

/** A response without a body. */
export function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

/**
 * A response whose body delivers one chunk and then stalls forever. The
 * stream fails when the request is aborted, which is how a stalled read ends
 * in a real runtime.
 */
export function stallingBodyResponse(signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"status":"OK"'));
      signal.addEventListener("abort", () => {
        try {
          controller.error(new Error("aborted"));
        } catch {
          return;
        }
      });
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * A response that declares a length above the read limit but whose body
 * never ends. A client that honoured the declared length answers
 * immediately; a client that ignored it would stall until the deadline.
 */
export function declaredOversizedResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{}"));
    },
  });
  const response = new Response(stream, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  response.headers.set(
    "content-length",
    String(SHIPA_MAX_RESPONSE_BYTES + 1),
  );
  return response;
}

/** A response that streams more bytes than the read limit allows. */
export function oversizedBodyResponse(): Response {
  const chunk = new Uint8Array(64 * 1024).fill(0x61);
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      sent += 1;
      if (sent > 12) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** A response whose connection drops while the body is streamed. */
export function disconnectingBodyResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"shipaRef":'));
    },
    pull(controller) {
      controller.error(new Error("connection reset"));
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Synthetic provider documents
// ---------------------------------------------------------------------------

/** A country document as the captured reference describes it. */
export function countryFixture(): unknown {
  return {
    name: "Kuwait",
    isoAlpha3: "KWT",
    cities: [
      { name: "Kuwait City", state: "Al Asimah" },
      { name: "Hawalli", state: "Hawalli" },
      { name: "Salmiya", state: "Hawalli" },
    ],
  };
}

/**
 * A country document that carries no `code` property, which is what the
 * reference actually returns even though the schema lists one.
 */
export function countryWithoutCodeFixture(): unknown {
  return {
    name: "Kuwait",
    isoAlpha3: "KWT",
    cities: [{ name: "Kuwait City" }],
  };
}

/** The supported country directory. */
export function countryListFixture(): unknown {
  return [
    { name: "Kuwait", isoAlpha3: "KWT" },
    { name: "Saudi Arabia", isoAlpha3: "SAU" },
  ];
}

/** A successful create response. */
export function createAcceptedFixture(): unknown {
  return { shipaRef: "SR-2026-0001", orderStatus: "Created" };
}

/** A create response without a provider reference. */
export function createWithoutReferenceFixture(): unknown {
  return { orderStatus: "Created" };
}

/** An order detail document. */
export function orderDetailFixture(): unknown {
  return {
    shipaRef: "SR-2026-0001",
    customerRef: "cm-order-0001",
    customerRef2: null,
    status: "Pending Pickup Confirmation",
    storyStatusId: 2,
    storyStatusText: "Pending Pickup Confirmation",
    type: "Delivery",
    category: "Next Day",
    readyForDelivery: false,
    chargeableWeight: 1.5,
    origin: {
      contactName: "Curemed Warehouse",
      contactNo: "+96550000001",
      city: "Kuwait City",
      country: "KWT",
    },
    destination: {
      contactName: "Test Recipient",
      contactNo: "+96550000002",
      city: "Hawalli",
      country: "KWT",
    },
    packages: [
      {
        customerRef: "cm-order-0001-pkg-1",
        name: "Medication parcel",
        shipaRef: "PKG-0001",
        weight: 1.5,
        length: 20,
        width: 15,
        height: 10,
      },
    ],
  };
}

/** An order history document. */
export function storyFixture(): unknown {
  return [
    { status: "Order Created", date: 1762200000, statusCode: "1" },
    { status: "Ready For Pickup", date: 1762203600, statusCode: "3" },
  ];
}

/** A live tracking document. */
export function trackingFixture(): unknown {
  return {
    eta: "12:45",
    duration: { text: "10 min", value: 600 },
    distance: { text: "2 km", value: 2000 },
    location: { latitude: 29.3759, longitude: 47.9774 },
  };
}

// ---------------------------------------------------------------------------
// Synthetic server owned drafts
// ---------------------------------------------------------------------------

/** A draft that passes every local validation rule. */
export function validOrderDraft(): ShipaOrderDraft {
  return {
    customerRef: "cm-order-0001",
    orderType: "Delivery",
    category: "Next Day",
    autoConfirm: false,
    origin: {
      country: "KWT",
      contactName: "Curemed Warehouse",
      contactNo: "+96550000001",
      city: "Kuwait City",
      address: "Test Area 1, Test Block 2, Test Street 3",
    },
    destination: {
      country: "KWT",
      contactName: "Test Recipient",
      contactNo: "+96550000002",
      city: "Hawalli",
      address: "Test Area 4, Test Block 5, Test Street 6",
    },
    package: {
      customerRef: "cm-order-0001-pkg-1",
      name: "Medication parcel",
      description: "Sealed medication parcel",
      weightKg: 1.5,
      lengthCm: 20,
      widthCm: 15,
      heightCm: 10,
    },
  };
}

// ---------------------------------------------------------------------------
// Malformed drafts
// ---------------------------------------------------------------------------
//
// The helpers below add a field the typed surface would not allow. That is
// the point: the local validation has to refuse a value that reached the
// server from somewhere untyped.

/** Adds one unexpected field to an order draft. */
export function draftWithExtraField(
  draft: ShipaOrderDraft,
  key: string,
  value: unknown,
): ShipaOrderDraft {
  const loose: Record<string, unknown> = { ...draft };
  loose[key] = value;
  return loose as ShipaOrderDraft;
}

/** Adds one unexpected field to a party draft. */
export function partyWithExtraField(
  party: ShipaPartyDraft,
  key: string,
  value: unknown,
): ShipaPartyDraft {
  const loose: Record<string, unknown> = { ...party };
  loose[key] = value;
  return loose as ShipaPartyDraft;
}

/** Adds one unexpected field to a package draft. */
export function packageWithExtraField(
  pkg: ShipaPackageDraft,
  key: string,
  value: unknown,
): ShipaPackageDraft {
  const loose: Record<string, unknown> = { ...pkg };
  loose[key] = value;
  return loose as ShipaPackageDraft;
}
