// Shipa — the admin integrations page.
//
// These tests drive the real page against the real transport: only the SDK
// boundary is replaced, so the request bodies, the strict response parser and
// the shared settings validation all run for real.
//
// No test reaches a network, and the only key that is typed is the synthetic
// one from the fixtures.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { SHIPA_ADMIN_ERROR_MESSAGES } from "@/lib/shipaAdmin";
import type { ShipaSaveableSettings } from "@/lib/shipaSettings";
import {
  createFakeInvoke,
  failureResponse,
  type FakeInvoke,
  readinessFixture,
  recordedAction,
  settingsEnvelopeFixture,
  successResponse,
  TEST_KEY,
  writtenSettingsFixture,
} from "@/test/shipaAdminFixtures";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/integrations/supabase/clientRuntime", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import AdminIntegrations from "@/pages/admin/AdminIntegrations";

let fake: FakeInvoke;

beforeEach(() => {
  fake = createFakeInvoke();
  invokeMock.mockReset();
  invokeMock.mockImplementation(fake.invoke);
});
afterEach(() => vi.useRealTimers());

/** Queues the two reads every page load performs. */
function queueLoad(): void {
  fake.queueResult(successResponse(settingsEnvelopeFixture()));
  fake.queueResult(successResponse(readinessFixture()));
}

function actions(): string[] {
  return fake.calls.map((call) => recordedAction(call).action);
}

describe("confirmation and activation regressions", () => {
  it("includes an entered key in the form save instead of silently discarding it", async () => {
    queueLoad();
    fake.queueResult(successResponse(writtenSettingsFixture()));
    fake.queueResult(successResponse(readinessFixture({ settingsRevision: 8 })));
    render(<AdminIntegrations />);
    await screen.findByText("Revision 7");
    fireEvent.change(screen.getByLabelText("New API key"), { target: { value: TEST_KEY } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await screen.findByText("Revision 8");
    const writes = fake.calls.filter((call) => recordedAction(call).action === "credential.save");
    expect(writes).toHaveLength(1);
    expect(recordedAction(writes[0]).request?.credential).toEqual({
      environment: "sandbox",
      mode: "replace",
      apiKey: TEST_KEY,
    });
    expect(screen.getByLabelText("New API key")).toHaveValue("");
  });
  it("clears the typed key when local parcel validation refuses its save", async () => {
    queueLoad();
    render(<AdminIntegrations />);
    await screen.findByText("Revision 7");
    fireEvent.change(screen.getByLabelText("New API key"), { target: { value: TEST_KEY } });
    fireEvent.change(screen.getByLabelText("Length (cm)"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new key" }));
    expect(screen.getByLabelText("New API key")).toHaveValue("");
    expect(actions()).toEqual(["settings.read", "readiness.read"]);
  });
  it.each(["profile", "key"] as const)(
    "does not reuse readiness after the %s changes",
    async (change) => {
      fake.queueResult(successResponse(settingsEnvelopeFixture()));
      fake.queueResult(
        successResponse(
          readinessFixture({ scheduler: { current: true, lastOkAt: new Date().toISOString() } }),
        ),
      );
      render(<AdminIntegrations />);
      await screen.findByText("Revision 7");
      if (change === "profile") {
        fireEvent.change(screen.getByLabelText("Contact name"), {
          target: { value: "Another pickup desk" },
        });
      }
      if (change === "key") {
        fireEvent.change(screen.getByLabelText("New API key"), {
          target: { value: TEST_KEY },
        });
      }
      fireEvent.click(screen.getByLabelText("Enable Shipa delivery"));
      fireEvent.click(screen.getByRole("radio", { name: /^Automatic after verified payment/ }));
      expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
      expect(actions()).toEqual(["settings.read", "readiness.read"]);
    },
  );

  it("allows disabling an unhealthy automatic configuration without a key or scheduler", async () => {
    const broken = settingsEnvelopeFixture().settings;
    broken.enabled = true;
    broken.dispatchMode = "automatic_after_payment";
    broken.sandbox.credential = { present: false, rotatedAt: null, keyVersion: null };
    broken.sandbox.parcel.weightKg = null;
    broken.sandbox.serviceCode = null;
    fake.queueResult(successResponse(settingsEnvelopeFixture({ settings: broken })));
    fake.queueResult(failureResponse("unavailable"));
    fake.queueResult(successResponse(writtenSettingsFixture(8, { ...broken, enabled: false })));
    fake.queueResult(failureResponse("unavailable"));
    render(<AdminIntegrations />);
    await screen.findByText("Readiness is unavailable");
    fireEvent.click(screen.getByLabelText("Enable Shipa delivery"));
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await screen.findByText("Revision 8");
    const writes = fake.calls.filter((call) => recordedAction(call).action === "settings.save");
    expect(writes).toHaveLength(1);
    expect(recordedAction(writes[0]).request?.settings).toMatchObject({ enabled: false });
  });
  it("requests automatic enablement once when the saved configuration and observations match", async () => {
    const ready = readinessFixture({
      scheduler: { current: true, lastOkAt: new Date().toISOString() },
    });
    const enabled = settingsEnvelopeFixture().settings;
    enabled.enabled = true;
    enabled.dispatchMode = "automatic_after_payment";
    fake.queueResult(successResponse(settingsEnvelopeFixture()));
    fake.queueResult(successResponse(ready));
    fake.queueResult(successResponse(writtenSettingsFixture(8, enabled)));
    fake.queueResult(successResponse({ ...ready, settingsRevision: 8 }));
    render(<AdminIntegrations />);
    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByLabelText("Enable Shipa delivery"));
    fireEvent.click(screen.getByRole("radio", { name: /^Automatic after verified payment/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Save changes/ })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await screen.findByText("Revision 8");
    const writes = fake.calls.filter((call) => recordedAction(call).action === "settings.save");
    expect(writes).toHaveLength(1);
    expect(recordedAction(writes[0]).request?.settings).toMatchObject({
      enabled: true,
      dispatchMode: "automatic_after_payment",
    });
  });

  it("keeps established automatic delivery enabled when its heartbeat becomes stale without polling", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const enabled = settingsEnvelopeFixture().settings;
    enabled.enabled = true;
    enabled.dispatchMode = "automatic_after_payment";
    fake.queueResult(successResponse(settingsEnvelopeFixture({ settings: enabled })));
    fake.queueResult(
      successResponse(
        readinessFixture({ scheduler: { current: true, lastOkAt: new Date().toISOString() } }),
      ),
    );
    render(<AdminIntegrations />);
    await screen.findByText("Revision 7");
    await act(async () => {
      vi.advanceTimersByTime(195000);
    });
    expect(screen.getByText("The scheduler receipt is not current")).toBeVisible();
    expect(screen.getByLabelText("Enable Shipa delivery")).toBeChecked();
    expect(actions()).toEqual(["settings.read", "readiness.read"]);
    expect(screen.getByRole("button", { name: /Save changes/ })).not.toBeDisabled();
  });

  it("sends the confirmed live key once and clears its input", async () => {
    queueLoad();
    const enabled = settingsEnvelopeFixture().settings;
    enabled.enabled = true;
    enabled.environment = "live";
    enabled.live.credential = { present: true, rotatedAt: new Date().toISOString(), keyVersion: 1 };
    fake.queueResult(successResponse(writtenSettingsFixture(8, enabled)));
    fake.queueResult(
      successResponse(readinessFixture({ settingsRevision: 8, activeEnvironment: "live" })),
    );
    render(<AdminIntegrations />);
    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByLabelText("Enable Shipa delivery"));
    fireEvent.click(screen.getByRole("radio", { name: /^Live/ }));
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    fireEvent.change(screen.getByLabelText("New API key"), { target: { value: TEST_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Save new key" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save the live configuration" }));
    await screen.findByText("Revision 8");
    const writes = fake.calls.filter((call) => recordedAction(call).action === "credential.save");
    expect(writes).toHaveLength(1);
    expect(recordedAction(writes[0]).request?.credential).toEqual({
      environment: "live",
      mode: "replace",
      apiKey: TEST_KEY,
    });
    expect(screen.getByLabelText("New API key")).toHaveValue("");
  });
  it("does not report a failed reload as successful or display invented defaults", async () => {
    queueLoad();
    fake.queueResult(failureResponse("unavailable"));
    fake.queueResult(successResponse(readinessFixture()));
    render(<AdminIntegrations />);
    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Discard and reload/ }));
    await screen.findByText("The Shipa configuration could not be read");
    expect(screen.queryByText("The stored Shipa configuration was reloaded.")).toBeNull();
    expect(screen.queryByText("Disabled")).toBeNull();
    expect(screen.queryByText("Active: Sandbox")).toBeNull();
    expect(screen.queryByText(/Loading the Shipa configuration/)).toBeNull();
  });

  it.each(
    [
      "configurationReady",
      "probeCurrent",
      "credentialsVerified",
      "originCityMatched",
      "credentialPresent",
    ] as const,
  )(
    "requires positive saved %s before a new automatic enablement",
    async (flag) => {
      fake.queueResult(successResponse(settingsEnvelopeFixture()));
      fake.queueResult(successResponse(readinessFixture({
        sandbox: { [flag]: false },
        scheduler: { current: true, lastOkAt: new Date().toISOString() },
      })));
      render(<AdminIntegrations />);
      await screen.findByText("Revision 7");
      fireEvent.click(screen.getByLabelText("Enable Shipa delivery"));
      fireEvent.click(screen.getByRole("radio", { name: /^Automatic after verified payment/ }));
      expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
      expect(actions()).not.toContain("settings.save");
    },
  );

  it("clears a typed key when the active environment changes", async () => {
    queueLoad();
    render(<AdminIntegrations />);
    await screen.findByText("Revision 7");
    fireEvent.change(screen.getByLabelText("New API key"), { target: { value: TEST_KEY } });
    fireEvent.click(screen.getByRole("radio", { name: /^Live/ }));
    expect(screen.getByLabelText("New API key")).toHaveValue("");
  });

  it("uses each authoritative returned revision for the next save", async () => {
    queueLoad();
    fake.queueResult(successResponse(writtenSettingsFixture(8)));
    fake.queueResult(successResponse(readinessFixture({ settingsRevision: 8 })));
    fake.queueResult(successResponse(writtenSettingsFixture(9)));
    fake.queueResult(successResponse(readinessFixture({ settingsRevision: 9 })));
    render(<AdminIntegrations />);
    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await screen.findByText("Revision 8");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Save changes/ })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await screen.findByText("Revision 9");
    expect(
      fake.calls.filter((call) => recordedAction(call).action === "settings.save").map((call) =>
        recordedAction(call).request?.expectedRevision
      ),
    ).toEqual([7, 8]);
  });
  it("clears a typed key when the live confirmation is cancelled", async () => {
    queueLoad();
    render(<AdminIntegrations />);
    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByLabelText("Enable Shipa delivery"));
    fireEvent.click(screen.getByRole("radio", { name: /^Live/ }));
    fireEvent.change(screen.getByLabelText("New API key"), { target: { value: TEST_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Save new key" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("New API key")).toHaveValue("");
    expect(actions()).not.toContain("credential.save");
  });

  it("does not bypass automatic activation checks through the key save action", async () => {
    queueLoad();
    fake.queueResult(successResponse(writtenSettingsFixture()));
    fake.queueResult(successResponse(readinessFixture({ settingsRevision: 8 })));
    render(<AdminIntegrations />);
    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByLabelText("Enable Shipa delivery"));
    fireEvent.click(screen.getByRole("radio", { name: /^Automatic after verified payment/ }));
    fireEvent.change(screen.getByLabelText("New API key"), { target: { value: TEST_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Save new key" }));
    expect(actions()).not.toContain("credential.save");
  });
});

describe("the loaded configuration", () => {
  it("shows the saved status, the draft and the safe credential metadata", async () => {
    queueLoad();
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    expect(screen.getByText("Disabled")).toBeTruthy();
    expect(screen.getByText("Active: Sandbox")).toBeTruthy();
    expect(screen.getByText("Key stored")).toBeTruthy();
    expect((screen.getByLabelText("Contact name") as HTMLInputElement).value).toBe(
      "Warehouse desk",
    );
  });

  it("never shows a stored key and never offers one back", async () => {
    queueLoad();
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    const keyField = screen.getByLabelText("New API key") as HTMLInputElement;
    expect(keyField.value).toBe("");
    expect(keyField.type).toBe("password");
    expect(screen.queryByDisplayValue(TEST_KEY)).toBeNull();
  });

  it("shows nothing as configured when the settings cannot be read", async () => {
    fake.queueResult(failureResponse("unavailable"));
    fake.queueResult(successResponse(readinessFixture()));
    render(<AdminIntegrations />);

    await screen.findByText(/The Shipa configuration could not be read/i);
    expect(screen.queryByRole("button", { name: /Save changes/ })).toBeNull();
    expect(screen.queryByLabelText("New API key")).toBeNull();
    expect(screen.queryByText("Revision 7")).toBeNull();
  });

  it("shows a readiness failure independently of the saved settings", async () => {
    fake.queueResult(successResponse(settingsEnvelopeFixture()));
    fake.queueResult(failureResponse("unavailable"));
    render(<AdminIntegrations />);

    await screen.findByText("Readiness is unavailable");
    expect(screen.getByText("Revision 7")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeTruthy();
  });
});

describe("the drafts", () => {
  it("keeps the two environment drafts apart and never copies one into the other", async () => {
    queueLoad();
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Sandbox desk" } });

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect((screen.getByLabelText("Contact name") as HTMLInputElement).value).toBe(
      "CureMed company",
    );

    fireEvent.click(screen.getByRole("button", { name: "Sandbox" }));
    expect((screen.getByLabelText("Contact name") as HTMLInputElement).value).toBe(
      "Sandbox desk",
    );
  });

  it("does not invent a parcel weight when the CureMed pickup details are applied", async () => {
    queueLoad();
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByRole("button", { name: /Use CureMed pickup details/ }));

    expect((screen.getByLabelText("Weight (kg)") as HTMLInputElement).value).toBe("2.5");
    expect((screen.getByLabelText("Contact name") as HTMLInputElement).value).toBe(
      "CureMed company",
    );
  });
});

describe("the write path", () => {
  it("sends the saveable settings with the saved revision and no credential metadata", async () => {
    queueLoad();
    fake.queueResult(successResponse(writtenSettingsFixture()));
    fake.queueResult(successResponse(readinessFixture({ settingsRevision: 8 })));
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(actions()).toContain("settings.save"));
    const request = recordedAction(fake.calls[2]).request;
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

  it("keeps the stored key when the key field is left blank", async () => {
    queueLoad();
    fake.queueResult(successResponse(writtenSettingsFixture()));
    fake.queueResult(successResponse(readinessFixture({ settingsRevision: 8 })));
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByRole("button", { name: "Keep stored key" }));

    await waitFor(() => expect(actions()).toContain("credential.save"));
    const request = recordedAction(fake.calls[2]).request;
    expect(request?.credential).toEqual({ environment: "sandbox", mode: "preserve" });
    expect(JSON.stringify(request)).not.toContain("apiKey");
  });

  it("clears the typed key after a refused save", async () => {
    queueLoad();
    fake.queueResult(failureResponse("credential_in_use"));
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.change(screen.getByLabelText("New API key"), {
      target: { value: TEST_KEY },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new key" }));

    await waitFor(() => expect(actions()).toContain("credential.save"));
    expect((screen.getByLabelText("New API key") as HTMLInputElement).value).toBe("");
    expect(screen.getByText(SHIPA_ADMIN_ERROR_MESSAGES.credential_in_use)).toBeTruthy();
  });

  it("clears the typed key when the edited environment changes", async () => {
    queueLoad();
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.change(screen.getByLabelText("New API key"), {
      target: { value: TEST_KEY },
    });
    expect((screen.getByLabelText("New API key") as HTMLInputElement).value).toBe(
      TEST_KEY,
    );

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect((screen.getByLabelText("New API key") as HTMLInputElement).value).toBe("");
  });

  it("removes the key of the selected environment only after the confirmation", async () => {
    queueLoad();
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByRole("button", { name: /Remove key/ }));
    const cancelled = await screen.findByRole("alertdialog");
    fireEvent.click(within(cancelled).getByRole("button", { name: "Keep the key" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(actions()).not.toContain("credential.save");

    fake.queueResult(successResponse(writtenSettingsFixture()));
    fake.queueResult(successResponse(readinessFixture({ settingsRevision: 8 })));
    fireEvent.click(screen.getByRole("button", { name: /Remove key/ }));
    const confirmed = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirmed).getByRole("button", { name: "Remove the key" }));

    await waitFor(() => expect(actions()).toContain("credential.save"));
    expect(recordedAction(fake.calls[2]).request?.credential).toEqual({
      environment: "sandbox",
      mode: "remove",
    });
  });

  it("explains a conflict and never writes again", async () => {
    queueLoad();
    fake.queueResult(failureResponse("conflict"));
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(screen.getByText("Nothing was saved")).toBeTruthy());
    expect(actions().filter((action) => action === "settings.save")).toHaveLength(1);
  });

  it("refuses to save a negative parcel dimension", async () => {
    queueLoad();
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.change(screen.getByLabelText("Length (cm)"), { target: { value: "-5" } });

    await screen.findByText(/Parcel length must be a positive number/);
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(actions()).not.toContain("settings.save"));
    screen.getAllByText(/Parcel length must be a positive number/).forEach((message) =>
      expect(message).toBeVisible()
    );
  });
});

describe("the confirmations", () => {
  it("asks before enabling the live environment and writes nothing when cancelled", async () => {
    queueLoad();
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByLabelText("Enable Shipa delivery"));
    fireEvent.click(screen.getByRole("radio", { name: /^Live/ }));
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Enable the live environment/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(actions()).not.toContain("settings.save");
  });

  it("saves the live configuration once the confirmation is accepted", async () => {
    queueLoad();
    fake.queueResult(successResponse(writtenSettingsFixture()));
    fake.queueResult(successResponse(readinessFixture({ settingsRevision: 8 })));
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByLabelText("Enable Shipa delivery"));
    fireEvent.click(screen.getByRole("radio", { name: /^Live/ }));
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save the live configuration" }));

    await waitFor(() => expect(actions()).toContain("settings.save"));
  });

  it("blocks a new automatic enablement while the scheduler receipt is stale", async () => {
    queueLoad();
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByLabelText("Enable Shipa delivery"));
    fireEvent.click(screen.getByRole("radio", { name: /^Automatic after verified payment/ }));

    await screen.findByText(/Automatic dispatch cannot be enabled yet/);
    expect(
      screen.getByText(/scheduler heartbeat is missing, stale or in the future/),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Save changes/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("the read-only checks", () => {
  it("reports a negative probe as a fact instead of a healthy connection", async () => {
    queueLoad();
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fake.queueResult(
      successResponse(
        readinessFixture({
          sandbox: { credentialsVerified: false, probeCurrent: false, safeCode: "unauthorized" },
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Run connection check/ }));

    await screen.findByText(/did not verify the sandbox credential/);
    expect(screen.getByText("unauthorized")).toBeVisible();
  });

  it("never replays the save when the readiness refresh fails", async () => {
    queueLoad();
    fake.queueResult(successResponse(writtenSettingsFixture()));
    fake.queueResult(failureResponse("unavailable"));
    render(<AdminIntegrations />);

    await screen.findByText("Revision 7");
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await screen.findByText("The Shipa configuration was saved.");
    expect(actions().filter((action) => action === "settings.save")).toHaveLength(1);
    expect(screen.getByText("Readiness is unavailable")).toBeTruthy();
  });
});
