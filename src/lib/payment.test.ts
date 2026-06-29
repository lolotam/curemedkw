import { afterEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/clientRuntime", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

const { createMyFatoorahPayment, verifyMyFatoorahPayment } = await import("@/lib/payment");
import type { OnlinePaymentMethod } from "@/lib/payment";

const ANY_METHOD: OnlinePaymentMethod = "CARD";

function relayError(message: string): { name: string; message: string } {
  return { name: "FunctionsRelayError", message };
}

function serverErrorJson(body: unknown): {
  name: string;
  message: string;
  context: { json: () => Promise<unknown> };
} {
  return {
    name: "FunctionsHttpError",
    message: "Edge Function returned a non-2xx status code",
    context: { json: () => Promise.resolve(body) },
  };
}

function ok(): { data: null; error: null } {
  return { data: null, error: null };
}

describe("createMyFatoorahPayment error classification", () => {
  afterEach(() => invokeMock.mockReset());

  it("test_createPayment_returns_payment_gateway_unreachable_on_FunctionsRelayError", async () => {
    invokeMock.mockResolvedValue({ data: null, error: relayError("Failed to send a request to the Edge Function") });

    const result = await createMyFatoorahPayment("00000000-0000-0000-0000-000000000000", ANY_METHOD);

    expect(result.success).toBe(false);
    expect(result.error_code).toBe("payment_gateway_unreachable");
    expect(result.error).toMatch(/payment gateway is unreachable/i);
  });

  it("test_createPayment_classifies_cors_phrase_as_payment_gateway_unreachable", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { name: "TypeError", message: "Load failed (CORS preflight)" } });

    const result = await createMyFatoorahPayment("00000000-0000-0000-0000-000000000000", ANY_METHOD);

    expect(result.error_code).toBe("payment_gateway_unreachable");
  });

  it("test_createPayment_prefers_server_provided_code_and_message_when_present", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: serverErrorJson({
        success: false,
        error: { code: "invalid_request_body", message: "Invalid request body." },
      }),
    });

    const result = await createMyFatoorahPayment("00000000-0000-0000-0000-000000000000", ANY_METHOD);

    expect(result.error_code).toBe("invalid_request_body");
    expect(result.error).toBe("Invalid request body.");
  });

  it("test_createPayment_falls_back_to_payment_error_for_unknown_failure_shape", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "Boom" } });

    const result = await createMyFatoorahPayment("00000000-0000-0000-0000-000000000000", ANY_METHOD);

    expect(result.error_code).toBe("payment_error");
    expect(result.error).toBe("Boom");
  });
});

describe("verifyMyFatoorahPayment error classification", () => {
  afterEach(() => invokeMock.mockReset());

  it("test_verifyPayment_returns_payment_gateway_unreachable_when_invoke_fails_with_network_error", async () => {
    invokeMock.mockResolvedValue({ data: null, error: relayError("Failed to fetch") });

    const result = await verifyMyFatoorahPayment("payment-1");

    expect(result.error_code).toBe("payment_gateway_unreachable");
    expect(result.payment_status).toBe("pending_status_update");
  });
});
