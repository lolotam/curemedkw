// Curemed — the tests of the browser transport.
//
// The real transport and the real strict parser run here. Only the SDK
// boundary is replaced, so the function name, the request body, the strict
// answer parsing and the closed failure surface are all exercised for real.
//
// No test reaches a network, and nothing is stored in the browser.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/integrations/supabase/clientRuntime", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import {
  createEvolutionPairingClient,
  EVOLUTION_PAIRING_ERROR_MESSAGES,
  EVOLUTION_PAIRING_FALLBACK_MESSAGE,
  parseEvolutionPairingResponse,
  type EvolutionInvoke,
} from "@/lib/evolutionPairing";

const QR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==";

function successEnvelope(
  connection: unknown = { state: "connected", qrDataUrl: null },
): unknown {
  return { success: true, connection };
}

function errorEnvelope(code: string, message = "remote text"): unknown {
  return { success: false, error: { code, message } };
}

beforeEach(() => {
  invokeMock.mockReset();
});

it("prototype property names never become trusted error messages", () => {
  for (const code of ["constructor", "__proto__"]) {
    const answer = parseEvolutionPairingResponse(errorEnvelope(code));
    expect(answer).toEqual({ ok: false, code: "unavailable", message: EVOLUTION_PAIRING_FALLBACK_MESSAGE });
  }
});

it("an empty PNG data prefix is not a pairing credential", () => {
  const answer = parseEvolutionPairingResponse(successEnvelope({ state: "connecting", qrDataUrl: "data:image/png;base64," }));
  expect(answer.ok).toBe(false);
});

it("bounded long non-PNG base64 is refused without recursive regex processing", () => {
  const answer = parseEvolutionPairingResponse(successEnvelope({ state: "connecting", qrDataUrl: "data:image/png;base64," + "AAAA".repeat(60_000) }));
  expect(answer.ok).toBe(false);
  expect(parseEvolutionPairingResponse(successEnvelope({ state: "connecting", qrDataUrl: "data:image/png;base64,AB==" })).ok).toBe(false);
});

it.each(["SGVsbG8=", "iVBORw0KGgo=", "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"])(
  "does not present malformed or truncated PNG bytes as a pairing code: %s", (base64) => {
    expect(parseEvolutionPairingResponse(successEnvelope({ state: "connecting",
      qrDataUrl: "data:image/png;base64," + base64 })).ok).toBe(false);
  },
);

describe("the action vocabulary", () => {
  it("sends exactly the two permitted actions to the pairing endpoint", async () => {
    invokeMock.mockResolvedValue({ data: successEnvelope(), error: null });
    const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);

    await client.readStatus();
    await client.requestConnect();

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls[0][0]).toBe("whatsapp-pairing");
    expect(invokeMock.mock.calls[0][1]).toEqual({ body: { action: "status" } });
    expect(invokeMock.mock.calls[1][0]).toBe("whatsapp-pairing");
    expect(invokeMock.mock.calls[1][1]).toEqual({ body: { action: "connect" } });
  });

  it("never retries a refused action", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { json: async () => errorEnvelope("forbidden") } },
    });
    const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);

    await client.requestConnect();

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});

describe("the strict answer parser", () => {
  it("accepts the exact success envelope", () => {
    const result = parseEvolutionPairingResponse(
      successEnvelope({ state: "connecting", qrDataUrl: QR }),
    );

    expect(result).toEqual({
      ok: true,
      connection: { state: "connecting", qrDataUrl: QR },
    });
  });

  it("refuses a success envelope with an extra field", () => {
    const result = parseEvolutionPairingResponse({
      success: true,
      connection: { state: "connected", qrDataUrl: null },
      extra: "unexpected",
    });

    expect(result).toMatchObject({ ok: false, code: "invalid_response" });
  });

  it("refuses a connection that carries a secret field", () => {
    const result = parseEvolutionPairingResponse({
      success: true,
      connection: {
        state: "connecting",
        qrDataUrl: null,
        code: "2ABCDEF",
        pairingCode: "12345678",
      },
    });

    expect(result).toMatchObject({ ok: false, code: "invalid_response" });
  });

  it("refuses an unknown state", () => {
    const result = parseEvolutionPairingResponse(
      successEnvelope({ state: "whatever", qrDataUrl: null }),
    );

    expect(result).toMatchObject({ ok: false, code: "invalid_response" });
  });

  it("refuses a QR that is not a PNG data URL", () => {
    for (const qrDataUrl of [
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "https://example.com/qr.png",
      "<svg onload=alert(1)>",
      "not a data url at all",
    ]) {
      const result = parseEvolutionPairingResponse(
        successEnvelope({ state: "connecting", qrDataUrl }),
      );
      expect(result).toMatchObject({ ok: false, code: "invalid_response" });
    }
  });

  it("refuses a body that is not the success or the failure envelope", () => {
    for (const payload of [null, "text", 7, {}, { success: true }, { success: "yes" }]) {
      const result = parseEvolutionPairingResponse(payload);
      expect(result).toMatchObject({ ok: false, code: "invalid_response" });
    }
  });

  it("refuses a failure envelope with an extra field", () => {
    const result = parseEvolutionPairingResponse({
      success: false,
      error: { code: "forbidden", message: "remote text", hint: "extra" },
    });

    expect(result).toMatchObject({ ok: false, code: "invalid_response" });
  });
});

describe("the closed failure surface", () => {
  it("uses only the local wording from a real HTTP error response", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify(errorEnvelope("forbidden", "private server detail")), { status: 403 }) },
    });
    const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);
    expect(await client.readStatus()).toEqual({
      ok: false,
      code: "forbidden",
      message: EVOLUTION_PAIRING_ERROR_MESSAGES.forbidden,
    });
  });

  it.each(["not_configured", "unauthorized", "timeout", "invalid_response"])(
    "preserves the safe %s code from a non-2xx response",
    async (code) => {
      invokeMock.mockResolvedValue({ data: null, error: { context: new Response(
        JSON.stringify(errorEnvelope(code, "private detail")), { status: 503 },
      ) } });
      const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);
      expect(await client.readStatus()).toEqual({
        ok: false, code, message: EVOLUTION_PAIRING_ERROR_MESSAGES[code],
      });
      expect(invokeMock).toHaveBeenCalledTimes(1);
    },
  );

  it("never promotes an HTTP-error body into a QR success", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { context: new Response(
      JSON.stringify(successEnvelope({ state: "connecting", qrDataUrl: QR })), { status: 500 },
    ) } });
    const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);
    expect(await client.requestConnect()).toEqual({
      ok: false, code: "unavailable", message: EVOLUTION_PAIRING_FALLBACK_MESSAGE,
    });
  });

  it("keeps malformed and unknown HTTP failure envelopes on the fixed fallback", async () => {
    const bodies = ["not-json", "null", JSON.stringify(errorEnvelope("unknown_code")),
      JSON.stringify({ success: false, error: { code: "forbidden", message: "private", hint: "extra" } })];
    for (const body of bodies) {
      invokeMock.mockResolvedValue({ data: null, error: { context: new Response(body, { status: 403 }) } });
      const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);
      expect(await client.readStatus()).toEqual({
        ok: false, code: "unavailable", message: EVOLUTION_PAIRING_FALLBACK_MESSAGE,
      });
    }
  });

  it("cancels an oversized streamed HTTP error before decoding it", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(4097)); },
      cancel() { cancelled = true; },
    });
    invokeMock.mockResolvedValue({ data: null, error: { context: new Response(body, { status: 403 }) } });
    const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);
    expect(await client.readStatus()).toMatchObject({ ok: false, code: "unavailable" });
    expect(cancelled).toBe(true);
  });

  it("uses bytes rather than characters for the HTTP error cap", async () => {
    const body = JSON.stringify(errorEnvelope("forbidden", "😀".repeat(1200)));
    expect(body.length).toBeLessThan(4096);
    invokeMock.mockResolvedValue({ data: null, error: { context: new Response(body, { status: 403 }) } });
    const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);
    expect(await client.readStatus()).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("refuses a declared oversized error without starting its reader", async () => {
    let reads = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() { reads += 1; }, cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    invokeMock.mockResolvedValue({ data: null, error: { context: new Response(body, {
      status: 403, headers: { "content-length": "4097" },
    }) } });
    const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);
    expect(await client.readStatus()).toMatchObject({ ok: false, code: "unavailable" });
    expect(reads).toBe(0);
    expect(cancelled).toBe(true);
  });

  it("times out and cancels a partial valid error whose stream never finishes", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    try {
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(errorEnvelope("forbidden")))); },
        cancel() { cancelled = true; },
      });
      invokeMock.mockResolvedValue({ data: null, error: { context: new Response(body, { status: 403 }) } });
      const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);
      const pending = client.readStatus();
      await vi.advanceTimersByTimeAsync(1001);
      expect(await pending).toEqual({
        ok: false, code: "unavailable", message: EVOLUTION_PAIRING_FALLBACK_MESSAGE,
      });
      expect(cancelled).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("shows the fixed local wording of a known code", () => {
    const result = parseEvolutionPairingResponse(
      errorEnvelope("not_configured", "the server said something secret"),
    );

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("not_configured");
    expect(result.message).toBe(
      EVOLUTION_PAIRING_ERROR_MESSAGES.not_configured,
    );
    expect(result.message).not.toContain("secret");
  });

  it("maps an unknown code onto the fixed unavailable wording", () => {
    const result = parseEvolutionPairingResponse(
      errorEnvelope("something_new", "the server said something secret"),
    );

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("unavailable");
    expect(result.message).toBe(EVOLUTION_PAIRING_FALLBACK_MESSAGE);
  });

  it("reports a refused invocation as the fixed unavailable failure", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { json: async () => errorEnvelope("forbidden") } },
    });
    const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);

    const result = await client.readStatus();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("unavailable");
    expect(result.message).toBe(EVOLUTION_PAIRING_FALLBACK_MESSAGE);
  });

  it("reports a rejected invocation as the fixed unavailable failure", async () => {
    invokeMock.mockRejectedValue(new Error("offline"));
    const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);

    const result = await client.readStatus();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("unavailable");
    expect(result.message).not.toContain("offline");
  });

  it("refuses an answer without a body", async () => {
    invokeMock.mockResolvedValue({ data: null, error: null });
    const client = createEvolutionPairingClient(invokeMock as EvolutionInvoke);

    const result = await client.readStatus();

    expect(result).toMatchObject({ ok: false, code: "invalid_response" });
  });
});
