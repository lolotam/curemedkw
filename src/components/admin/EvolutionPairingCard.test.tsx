// Curemed — the tests of the WhatsApp pairing card.
//
// The real card runs here against the real transport contract. Only the
// pairing client boundary is replaced, so the mount read, the explicit
// connect, the duplicate guard, the late answer fence, the QR lifetime and
// the closed failure surface are all exercised for real.
//
// No test reaches a network and nothing is written to the browser storage.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock, authState } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  authState: { callback: null as null | ((event: string) => void) },
}));

vi.mock("@/integrations/supabase/clientRuntime", () => ({
  supabase: {
    functions: { invoke: invokeMock },
    auth: {
      onAuthStateChange: (callback: (event: string) => void) => {
        authState.callback = callback;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

import { EvolutionPairingCard } from "@/components/admin/EvolutionPairingCard";
import {
  EVOLUTION_PAIRING_ERROR_MESSAGES,
  createEvolutionPairingClient,
  type EvolutionPairingClient,
  type EvolutionPairingResult,
} from "@/lib/evolutionPairing";

const QR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

function ok(
  state: "connected" | "disconnected" | "connecting" | "unknown",
  qrDataUrl: string | null = null,
): EvolutionPairingResult {
  return { ok: true, connection: { state, qrDataUrl } };
}

function failed(message: string): EvolutionPairingResult {
  return { ok: false, code: "not_configured", message };
}

function atSdkBoundary(
  status: () => Promise<EvolutionPairingResult>,
  connect: () => Promise<EvolutionPairingResult>,
): EvolutionPairingClient {
  return createEvolutionPairingClient(async (functionName, options) => {
    expect(functionName).toBe("whatsapp-pairing");
    const result = await (options.body.action === "status" ? status() : connect());
    return {
      data: result.ok === true
        ? { success: true, connection: result.connection }
        : { success: false, error: { code: result.code, message: result.message } },
      error: null,
    };
  });
}

function createFakeClient(
  status: EvolutionPairingResult = ok("disconnected"),
  connect: EvolutionPairingResult = ok("connecting", QR),
) {
  const readStatus = vi.fn(async () => status);
  const requestConnect = vi.fn(async () => connect);
  const client = atSdkBoundary(readStatus, requestConnect);
  return { client, readStatus, requestConnect };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  invokeMock.mockReset();
  authState.callback = null;
});

describe("the mounted card", () => {
  it("reads the state on mount and never connects", async () => {
    const fake = createFakeClient();

    render(<EvolutionPairingCard client={fake.client} />);

    await screen.findByText("Not connected");
    expect(fake.readStatus).toHaveBeenCalledTimes(1);
    expect(fake.requestConnect).not.toHaveBeenCalled();
  });

  it("shows an unknown state honestly", async () => {
    const fake = createFakeClient(ok("unknown"));

    render(<EvolutionPairingCard client={fake.client} />);

    await screen.findByText("Status unknown");
    expect(screen.getByText(/did not report a state/i)).toBeTruthy();
  });

  it("keeps a connected session and offers no QR", async () => {
    const fake = createFakeClient(ok("connected"));

    render(<EvolutionPairingCard client={fake.client} />);

    await screen.findByText("Connected");
    expect(screen.getByRole("button", { name: "Paired" })).toBeDisabled();
    expect(fake.requestConnect).not.toHaveBeenCalled();
  });

  it("shows the fixed safe wording of a refused read", async () => {
    const fake = createFakeClient(
      failed(EVOLUTION_PAIRING_ERROR_MESSAGES.not_configured),
    );

    render(<EvolutionPairingCard client={fake.client} />);

    await screen.findByText(EVOLUTION_PAIRING_ERROR_MESSAGES.not_configured);
    expect(fake.requestConnect).not.toHaveBeenCalled();
  });
});

describe("the explicit connect", () => {
  it("asks for the QR only after an explicit click", async () => {
    const fake = createFakeClient();

    render(<EvolutionPairingCard client={fake.client} />);
    await screen.findByText("Not connected");

    fireEvent.click(screen.getByRole("button", { name: /Show pairing code/ }));

    await screen.findByRole("dialog");
    expect(fake.requestConnect).toHaveBeenCalledTimes(1);
    expect(fake.readStatus).toHaveBeenCalledTimes(1);
  });

  it("ignores a second click in the same frame", async () => {
    const fake = createFakeClient();

    render(<EvolutionPairingCard client={fake.client} />);
    await screen.findByText("Not connected");

    const button = screen.getByRole("button", { name: /Show pairing code/ });
    fireEvent.click(button);
    fireEvent.click(button);

    await screen.findByRole("dialog");
    expect(fake.requestConnect).toHaveBeenCalledTimes(1);
  });

  it("shows the QR inside an accessible dialog", async () => {
    const fake = createFakeClient();

    render(<EvolutionPairingCard client={fake.client} />);
    await screen.findByText("Not connected");
    fireEvent.click(screen.getByRole("button", { name: /Show pairing code/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByAltText(/pairing QR code/i)).toBeTruthy();
    expect(screen.getByText(/Linked devices/i)).toBeTruthy();
  });

  it("drops the QR when the dialog is closed", async () => {
    const fake = createFakeClient();

    render(<EvolutionPairingCard client={fake.client} />);
    await screen.findByText("Not connected");
    fireEvent.click(screen.getByRole("button", { name: /Show pairing code/ }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByAltText(/pairing QR code/i)).toBeNull();
    });
  });

  it("drops the QR when the session changes", async () => {
    const fake = createFakeClient();

    render(<EvolutionPairingCard client={fake.client} />);
    await screen.findByText("Not connected");
    fireEvent.click(screen.getByRole("button", { name: /Show pairing code/ }));
    await screen.findByAltText(/pairing QR code/i);

    act(() => {
      authState.callback?.("SIGNED_OUT");
    });

    await waitFor(() => {
      expect(screen.queryByAltText(/pairing QR code/i)).toBeNull();
    });
  });

  it("expires the QR locally and asks for a refresh", async () => {
    const fake = createFakeClient();

    render(<EvolutionPairingCard client={fake.client} qrLifetimeMs={20} />);
    await screen.findByText("Not connected");
    fireEvent.click(screen.getByRole("button", { name: /Show pairing code/ }));
    await screen.findByAltText(/pairing QR code/i);

    await waitFor(() => {
      expect(screen.getByText(/no longer shown here/i)).toBeTruthy();
    });
    expect(screen.queryByAltText(/pairing QR code/i)).toBeNull();
  });

  it("does not claim that the provider expired the code", async () => {
    const fake = createFakeClient();

    render(<EvolutionPairingCard client={fake.client} qrLifetimeMs={20} />);
    await screen.findByText("Not connected");
    fireEvent.click(screen.getByRole("button", { name: /Show pairing code/ }));
    await screen.findByAltText(/pairing QR code/i);

    await waitFor(() => {
      expect(screen.getByText(/no longer shown here/i)).toBeTruthy();
    });
    expect(screen.queryByText(/expired/i)).toBeNull();
    expect(screen.queryByText(/invalid/i)).toBeNull();
  });
});

describe("the late answers", () => {
  it("discards a pairing answer received after sign-out", async () => {
    const pending = deferred<EvolutionPairingResult>();
    const fake = createFakeClient();
    fake.requestConnect.mockImplementation(() => pending.promise);
    render(<EvolutionPairingCard client={fake.client} />);
    await screen.findByText("Not connected");
    fireEvent.click(screen.getByRole("button", { name: /Show pairing code/ }));
    act(() => authState.callback?.("SIGNED_OUT"));
    await act(async () => pending.resolve(ok("connecting", QR)));
    expect(screen.queryByAltText(/pairing QR code/i)).toBeNull();
  });
  it("ignores an answer that arrives after the card is gone", async () => {
    const pending = deferred<EvolutionPairingResult>();
    const readStatus = vi.fn(() => pending.promise);
    const requestConnect = vi.fn();
    const client = atSdkBoundary(readStatus, requestConnect);

    const { unmount } = render(<EvolutionPairingCard client={client} />);
    unmount();

    await act(async () => {
      pending.resolve(ok("connecting", QR));
    });

    expect(readStatus).toHaveBeenCalledTimes(1);
    expect(screen.queryByAltText(/pairing QR code/i)).toBeNull();
  });

  it("ignores an answer of an older request", async () => {
    const pending = deferred<EvolutionPairingResult>();
    const readStatus = vi.fn(() => pending.promise);
    const requestConnect = vi.fn(async () => ok("connecting", QR));
    const client = atSdkBoundary(readStatus, requestConnect);

    render(<EvolutionPairingCard client={client} />);
    fireEvent.click(screen.getByRole("button", { name: /Show pairing code/ }));
    await screen.findByAltText(/pairing QR code/i);

    await act(async () => {
      pending.resolve(ok("disconnected"));
    });

    expect(screen.getByAltText(/pairing QR code/i)).toBeTruthy();
  });
});

describe("the browser storage", () => {
  it("keeps the QR out of the console and out of the storage", async () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = createFakeClient();

    render(<EvolutionPairingCard client={fake.client} />);
    await screen.findByText("Not connected");
    fireEvent.click(screen.getByRole("button", { name: /Show pairing code/ }));
    await screen.findByAltText(/pairing QR code/i);

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    const logged = [
      ...consoleSpy.mock.calls,
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ].map((call) => String(call[0] ?? ""));
    expect(logged.some((line) => line.includes(QR))).toBe(false);
    expect(
      logged.some((line) => /apikey|secret|pairingCode|base64/i.test(line)),
    ).toBe(false);

    consoleSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
