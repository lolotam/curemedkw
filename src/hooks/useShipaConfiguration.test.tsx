// Real controller/transport/schema; only the SDK response timing is synthetic.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useShipaConfiguration } from "@/hooks/useShipaConfiguration";
import type { ShipaAdminInvokeResult } from "@/lib/shipaAdmin";
import {
  createFakeInvoke,
  failureResponse,
  type FakeInvoke,
  readinessFixture,
  settingsEnvelopeFixture,
  successResponse,
  writtenSettingsFixture,
} from "@/test/shipaAdminFixtures";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock(
  "@/integrations/supabase/clientRuntime",
  () => ({ supabase: { functions: { invoke: invokeMock } } }),
);
let fake: FakeInvoke;
beforeEach(() => {
  fake = createFakeInvoke();
  invokeMock.mockReset();
  invokeMock.mockImplementation(fake.invoke);
  fake.queueResult(successResponse(settingsEnvelopeFixture()));
  fake.queueResult(successResponse(readinessFixture()));
});

function deferredResponse() {
  let resolve!: (response: ShipaAdminInvokeResult) => void;
  const promise = new Promise<ShipaAdminInvokeResult>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("readiness response ordering", () => {
  it("does not issue a second write for simultaneous save requests", async () => {
    const { result } = renderHook(() => useShipaConfiguration());
    await waitFor(() => expect(result.current.readinessState.status).toBe("ready"));
    const write = deferredResponse();
    fake.queueDeferred(write.promise);
    fake.queueResult(successResponse(readinessFixture({ settingsRevision: 8 })));
    act(() => {
      result.current.requestSave();
      result.current.requestSave();
    });
    expect(fake.calls).toHaveLength(3);
    await act(async () => {
      write.resolve(successResponse(writtenSettingsFixture()));
    });
    expect(result.current.saved?.revision).toBe(8);
    expect(
      fake.calls.filter((call) => (call.body as { action: string }).action === "settings.save"),
    ).toHaveLength(1);
  });
  it("keeps the later read pending when a superseded read finishes first", async () => {
    const { result } = renderHook(() => useShipaConfiguration());
    await waitFor(() => expect(result.current.readinessState.status).toBe("ready"));
    const old = deferredResponse();
    const current = deferredResponse();
    fake.queueDeferred(old.promise);
    fake.queueDeferred(current.promise);
    act(() => {
      void result.current.refreshReadiness();
      void result.current.refreshReadiness();
    });
    expect(result.current.readinessPending).toBe(true);
    await act(async () => {
      old.resolve(failureResponse("unavailable"));
    });
    expect(result.current.readinessPending).toBe(true);
    expect(result.current.readinessState.status).toBe("ready");
    await act(async () => {
      current.resolve(successResponse(readinessFixture({ settingsRevision: 8 })));
    });
    expect(result.current.readinessPending).toBe(false);
    expect(result.current.readinessState).toMatchObject({
      status: "ready",
      data: { settingsRevision: 8 },
    });
  });

  it("does not replace the latest successful facts with a late failed response", async () => {
    const { result } = renderHook(() => useShipaConfiguration());
    await waitFor(() => expect(result.current.readinessState.status).toBe("ready"));
    const old = deferredResponse();
    const current = deferredResponse();
    fake.queueDeferred(old.promise);
    fake.queueDeferred(current.promise);
    act(() => {
      void result.current.refreshReadiness();
      void result.current.refreshReadiness();
    });
    await act(async () => {
      current.resolve(successResponse(readinessFixture({ settingsRevision: 8 })));
    });
    await act(async () => {
      old.resolve(failureResponse("unavailable"));
    });
    expect(result.current.readinessPending).toBe(false);
    expect(result.current.readinessState).toMatchObject({
      status: "ready",
      data: { settingsRevision: 8 },
    });
    expect(fake.calls).toHaveLength(4);
  });
});
