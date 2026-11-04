// Shipa admin — the transport and the strict response mapper.
//
// These tests exercise the real transport and the real strict parser. Only the
// SDK boundary is replaced: the fake `functions.invoke` is the same seam the
// production client uses, so the request bodies, the envelope parsing and the
// shared settings validation all run for real.
//
// Nothing here reaches a network, and no real credential appears.

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createShipaAdminClient,
  SHIPA_ADMIN_ERROR_MESSAGES,
  type ShipaAdminClient,
} from "@/lib/shipaAdmin";
import type { ShipaSaveableSettings } from "@/lib/shipaSettings";
import { shipaAutomaticActivationIssues } from "@/lib/shipaAdminPolicy";
import { buildShipaSaveableSettings, draftFromShipaSettings } from "@/lib/shipaAdminDraft";
import {
  createFakeInvoke,
  failureResponse,
  type FakeInvoke,
  readinessFixture,
  recordedAction,
  saveableSettingsFixture,
  settingsEnvelopeFixture,
  settingsFixture,
  successResponse,
  TEST_KEY,
  writtenSettingsFixture,
} from "@/test/shipaAdminFixtures";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/integrations/supabase/clientRuntime", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

let fake: FakeInvoke;
let client: ShipaAdminClient;

it("does not activate a new environment using readiness for the previous one", () => {
  const saved = settingsFixture();
  saved.live = structuredClone(saved.sandbox);
  const draft = { ...draftFromShipaSettings(saved), enabled: true,
    dispatchMode: "automatic_after_payment" as const, environment: "live" as const };
  const now = Date.parse("2026-11-03T10:00:00Z");
  const readiness = readinessFixture({ live: { credentialPresent: true, configurationReady: true,
    probeCurrent: true, credentialsVerified: true, originCityMatched: true, safeCode: null } });
  const issues = shipaAutomaticActivationIssues({ draft, saved, built: buildShipaSaveableSettings(draft),
    readiness, newKeyPending: false, nowMs: now });
  expect(issues.some((issue) => issue.includes("revision or environment"))).toBe(true);
});

it.each(["active configuration", "pending credential"])("rechecks established automation after changing %s", (change) => {
  const saved = settingsFixture();
  saved.enabled = true;
  saved.dispatchMode = "automatic_after_payment";
  const draft = draftFromShipaSettings(structuredClone(saved));
  if (change === "active configuration") draft.sandbox.settings.origin.contactName = "Updated pickup";
  const issues = shipaAutomaticActivationIssues({ draft, saved,
    built: buildShipaSaveableSettings(draft), readiness: null,
    newKeyPending: change === "pending credential", nowMs: Date.now() });
  expect(issues.length).toBeGreaterThan(0);
});

beforeEach(() => {
  fake = createFakeInvoke();
  invokeMock.mockReset();
  invokeMock.mockImplementation(fake.invoke);
  client = createShipaAdminClient(fake.invoke);
});

describe("the action vocabulary", () => {
  it.each([7, 9])(
    "refuses committed-write projection revision %s when 8 is required",
    async (revision) => {
      fake.queueResult(successResponse(writtenSettingsFixture(revision)));
      const result = await client.saveSettings({
        expectedRevision: 7,
        settings: saveableSettingsFixture(),
      });
      expect(result).toMatchObject({ ok: false, code: "invalid_response" });
      expect(fake.calls).toHaveLength(1);
    },
  );
  it("preserves the stored key for a blank replacement", async () => {
    fake.queueResult(successResponse(writtenSettingsFixture()));
    const result = await client.saveCredential({
      expectedRevision: 7,
      settings: saveableSettingsFixture(),
      credential: { environment: "sandbox", mode: "replace", apiKey: "   " },
    });
    expect(result.ok).toBe(true);
    expect(recordedAction(fake.calls[0]).request?.credential).toEqual({
      environment: "sandbox",
      mode: "preserve",
    });
  });
  it("sends exactly the five permitted actions to the shipa-admin function", async () => {
    const settings = saveableSettingsFixture();
    fake.queueResult(successResponse(settingsEnvelopeFixture()));
    fake.queueResult(successResponse(writtenSettingsFixture(8)));
    fake.queueResult(successResponse(writtenSettingsFixture(9)));
    fake.queueResult(successResponse(readinessFixture()));
    fake.queueResult(successResponse(readinessFixture()));

    await client.readSettings();
    await client.saveSettings({ expectedRevision: 7, settings });
    await client.saveCredential({
      expectedRevision: 8,
      settings,
      credential: { environment: "sandbox", mode: "replace", apiKey: TEST_KEY },
    });
    await client.readReadiness();
    await client.diagnoseReadiness({ expectedRevision: 7, environment: "sandbox" });

    expect(fake.calls).toHaveLength(5);
    expect(fake.calls.map((call) => call.functionName)).toEqual([
      "shipa-admin",
      "shipa-admin",
      "shipa-admin",
      "shipa-admin",
      "shipa-admin",
    ]);
    expect(fake.calls.map((call) => recordedAction(call).action)).toEqual([
      "settings.read",
      "settings.save",
      "credential.save",
      "readiness.read",
      "readiness.diagnose",
    ]);
  });

  it("sends the expected revision and the saveable settings only", async () => {
    const settings = saveableSettingsFixture();
    fake.queueResult(successResponse(writtenSettingsFixture()));

    await client.saveSettings({ expectedRevision: 7, settings });

    const request = recordedAction(fake.calls[0]).request;
    expect(request?.expectedRevision).toBe(7);
    const payload = request?.settings as ShipaSaveableSettings;
    expect(Object.keys(payload).sort()).toEqual([
      "dispatchMode",
      "enabled",
      "environment",
      "live",
      "sandbox",
    ]);
    expect((payload.sandbox as unknown as Record<string, unknown>).credential).toBeUndefined();
  });

  it("never sends a payload that carries credential metadata", async () => {
    const settings = saveableSettingsFixture();
    const polluted = {
      ...settings,
      sandbox: {
        ...settings.sandbox,
        credential: { present: true, rotatedAt: null, keyVersion: null },
      },
    } as unknown as ShipaSaveableSettings;

    const result = await client.saveSettings({ expectedRevision: 7, settings: polluted });

    expect(result.ok).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("the closed failure surface", () => {
  it("refuses successful probe flags paired with a provider failure code", async () => {
    fake.queueResult(successResponse(readinessFixture({ sandbox: { safeCode: "unauthorized" } })));
    expect(await client.readReadiness()).toMatchObject({ ok: false, code: "invalid_response" });
  });
  it("refuses oversized HTTP error bodies instead of reading them as a valid code", async () => {
    fake.queueResult({ data: null, error: { context: new Response(JSON.stringify({
      error: { code: "conflict", message: "x".repeat(5000) },
    }), { status: 409 }) } });
    expect(await client.readSettings()).toMatchObject({ ok: false, code: "unavailable" });
    expect(fake.calls).toHaveLength(1);
  });

  it("bounds a stalled HTTP error body and never retries the mutation", async () => {
    vi.useFakeTimers();
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }), { status: 503 });
    fake.queueResult({ data: null, error: { context: response } });
    let settled: unknown;
    const operation = client.readSettings().then((result) => { settled = result; });
    try {
      await vi.advanceTimersByTimeAsync(1001);
      expect(settled).toMatchObject({ ok: false, code: "unavailable" });
      expect(fake.calls).toHaveLength(1);
    } finally {
      stream?.error(new Error("synthetic test cleanup"));
      await operation;
      vi.useRealTimers();
    }
  });
  it("shows the fixed local wording of a known code and ignores the server text", async () => {
    fake.queueResult(failureResponse("conflict", "server said something secret"));

    const result = await client.readSettings();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("conflict");
    expect(result.message).toBe(SHIPA_ADMIN_ERROR_MESSAGES.conflict);
    expect(result.message).not.toContain("server said something secret");
  });

  it("maps an unknown code onto the fixed unavailable wording", async () => {
    fake.queueResult(failureResponse("something_new", "server said something secret"));

    const result = await client.readSettings();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("unavailable");
    expect(result.message).toBe(SHIPA_ADMIN_ERROR_MESSAGES.unavailable);
    expect(result.message).not.toContain("server said something secret");
  });

  it("reports a rejected invocation as the fixed unavailable failure", async () => {
    fake.queueError(new Error("network down"));

    const result = await client.readSettings();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("unavailable");
    expect(result.message).toBe(SHIPA_ADMIN_ERROR_MESSAGES.unavailable);
    expect(result.message).not.toContain("network down");
  });

  it("never retries a refused action", async () => {
    fake.queueResult(failureResponse("conflict"));

    await client.readSettings();

    expect(fake.calls).toHaveLength(1);
  });
});

describe("the strict response mapper", () => {
  it.each([
    "bad credential time",
    "inconsistent presence",
    "zero key version",
    "out-of-range revision",
  ])(
    "refuses %s in safe metadata",
    async (scenario) => {
      const envelope = settingsEnvelopeFixture();
      if (scenario === "bad credential time") {
        envelope.settings.sandbox.credential.rotatedAt = "invalid";
      }
      if (scenario === "inconsistent presence") {
        envelope.settings.sandbox.credential.present = false;
      }
      if (scenario === "zero key version") envelope.settings.sandbox.credential.keyVersion = 0;
      if (scenario === "out-of-range revision") envelope.settings.revision = 2147483648;
      fake.queueResult(successResponse(envelope));
      expect(await client.readSettings()).toMatchObject({ ok: false, code: "invalid_response" });
    },
  );
  it("refuses a null success body", async () => {
    fake.queueResult(successResponse(null));

    const result = await client.readSettings();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("invalid_response");
  });

  it("refuses a success body with an extra field", async () => {
    const envelope = { ...settingsEnvelopeFixture(), extra: "unexpected" };
    fake.queueResult(successResponse(envelope));

    const result = await client.readSettings();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("invalid_response");
  });

  it("refuses a settings payload that carries a secret field", async () => {
    const envelope = settingsEnvelopeFixture();
    fake.queueResult({
      data: {
        success: true,
        data: {
          ...envelope,
          settings: {
            ...envelope.settings,
            sandbox: {
              ...envelope.settings.sandbox,
              credential: { ...envelope.settings.sandbox.credential, apiKey: TEST_KEY },
            },
          },
        },
      },
      error: null,
    });

    const result = await client.readSettings();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("invalid_response");
  });

  it("does not accept the snake_case database projection as HTTP data", async () => {
    fake.queueResult({
      data: {
        success: true,
        data: {
          settings_revision: 7,
          active_environment: "sandbox",
          environments: {},
          scheduler: {},
        },
      },
      error: null,
    });

    const result = await client.readReadiness();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("invalid_response");
  });

  it("refuses a readiness payload whose entitlement is not unconfirmed", async () => {
    const readiness = readinessFixture();
    fake.queueResult({
      data: {
        success: true,
        data: {
          ...readiness,
          environments: {
            ...readiness.environments,
            sandbox: { ...readiness.environments.sandbox, serviceEntitlement: "confirmed" },
          },
        },
      },
      error: null,
    });

    const result = await client.readReadiness();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("invalid_response");
  });
});

describe("the default client", () => {
  it("uses the runtime client boundary of the SDK", async () => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      data: { success: true, data: settingsEnvelopeFixture() },
      error: null,
    });

    const { shipaAdminClient } = await import("@/lib/shipaAdmin");
    const result = await shipaAdminClient.readSettings();

    expect(result.ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0][0]).toBe("shipa-admin");
    expect(invokeMock.mock.calls[0][1]).toEqual({ body: { action: "settings.read" } });
  });

  it("reports a refused SDK response through the fixed wording", async () => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ success: false, error: { code: "forbidden" } }), { status: 403 }) },
    });

    const { shipaAdminClient } = await import("@/lib/shipaAdmin");
    const result = await shipaAdminClient.readSettings();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("forbidden");
    expect(result.message).toBe(SHIPA_ADMIN_ERROR_MESSAGES.forbidden);
  });

  it("treats a rejected SDK promise as the fixed unavailable failure", async () => {
    invokeMock.mockReset();
    invokeMock.mockRejectedValue(new Error("offline"));

    const { shipaAdminClient } = await import("@/lib/shipaAdmin");
    const result = await shipaAdminClient.readSettings();

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error("expected a failure");
    expect(result.code).toBe("unavailable");
  });
});
