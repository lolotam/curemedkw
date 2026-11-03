// Behavioural tests for the Shipa settings store: the strict SQL document
// parser, the safe envelope mapping, the closed failure set and the two RPC
// calls.
//
// The database is faked at the SDK boundary. The parser, the shared schemas,
// the error mapping and the store under test are the real production modules.
//
// No secret, no key, no account and no personal data is used: every value is
// a made-up placeholder.

import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";

import {
  SHIPA_SETTINGS_ERROR_MESSAGES,
  ShipaSettingsError,
  type ShipaSettingsErrorCode,
} from "../../_shared/shipa-settings-responses.ts";
import type { ShipaSettingsEnvelope } from "../../_shared/shipa-settings-responses.ts";
import { createShipaSettingsStore } from "../../_shared/shipa-settings-store.ts";
import {
  SHIPA_TEST_ACTOR_ID,
  SHIPA_TEST_INTEGRATION_ID,
  createEnvironmentConfig,
  createEnvironmentSettings,
  createFakeShipaRpcClient,
  createSaveRequest,
  createSettingsBlock,
  createSettingsDocument,
  createSqlError,
} from "./shipa-settings-fixtures.ts";

const EXPECTED_ORIGIN = {
  contactName: "Curemed",
  contactPhone: "+96550000000",
  address: {
    countryCode: "KW" as const,
    governorate: "Hawalli",
    area: "Hawally",
    block: "",
    street: "",
    building: "",
    addressLine: "Warehouse 3",
  },
};

const EXPECTED_ENVIRONMENT: ShipaSettingsEnvelope["settings"]["sandbox"] = {
  appId: "app-test",
  origin: EXPECTED_ORIGIN,
  serviceCode: "Same Day",
  autoConfirm: false,
  pickupInstructions: "",
  parcel: {
    count: 1,
    weightKg: 1.5,
    dimensionsCm: { lengthCm: 20, widthCm: 15, heightCm: 10 },
  },
  credential: { present: false, rotatedAt: null, keyVersion: null },
};

const EXPECTED_ENVELOPE: ShipaSettingsEnvelope = {
  integrationId: SHIPA_TEST_INTEGRATION_ID,
  settings: {
    enabled: false,
    environment: "sandbox",
    dispatchMode: "manual_after_packing",
    revision: 0,
    sandbox: EXPECTED_ENVIRONMENT,
    live: EXPECTED_ENVIRONMENT,
  },
  workerLastOkAt: null,
  verification: { sandbox: null, live: null },
};

const ACTOR = { userId: SHIPA_TEST_ACTOR_ID };

Deno.test("accepts the final SQL integer revision produced by a valid save", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ result: createSettingsDocument({ settings: createSettingsBlock({ revision: 2147483647 }) }) });
  const saved = await createShipaSettingsStore({ client }).save({
    actor: ACTOR, request: createSaveRequest({ expectedRevision: 2147483646 }),
  });
  assertEquals(saved.settings.revision, 2147483647);
});

Deno.test("refuses impossible SQL dates and unsafe credential metadata", async () => {
  for (const patch of [
    { worker_last_ok_at: "2026-02-31T10:00:00Z" },
    { settings: createSettingsBlock({ sandbox: createEnvironmentSettings({
      credential: { present: true, rotatedAt: "2026-11-01T10:00:00Z", keyVersion: 1e30 },
    }) }) },
  ]) {
    const client = createFakeShipaRpcClient();
    client.queue({ result: createSettingsDocument(patch) });
    await expectStoreError("invalid_response", () => createShipaSettingsStore({ client }).read({ actor: ACTOR }));
  }
});

Deno.test("unwraps the Supabase SDK result and prioritizes resolved SQL errors", async () => {
  const cases = [
    { error: null, expected: null },
    { error: createSqlError("40001", "settings_conflict"), expected: "conflict" },
    { error: createSqlError("42501", "not_allowed"), expected: "forbidden" },
  ] as const;
  for (const scenario of cases) {
    const store = createShipaSettingsStore({
      client: { rpc: () => Promise.resolve({ data: createSettingsDocument(), error: scenario.error, status: 200 }) },
    });
    if (scenario.expected === null) {
      assertEquals(await store.read({ actor: ACTOR }), EXPECTED_ENVELOPE);
    } else {
      await expectStoreError(scenario.expected, () => store.read({ actor: ACTOR }));
    }
  }
});

async function expectStoreError(
  code: ShipaSettingsErrorCode,
  action: () => Promise<unknown>,
): Promise<ShipaSettingsError> {
  const error = await assertRejects(action, ShipaSettingsError);
  assertEquals(error.code, code);
  assertEquals(error.message, SHIPA_SETTINGS_ERROR_MESSAGES[code]);
  return error;
}

// --- Reading ---------------------------------------------------------------

Deno.test("reads the safe document with exactly one read call", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ result: createSettingsDocument() });
  const store = createShipaSettingsStore({ client });

  await store.read({ actor: ACTOR });

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_read_settings");
  assertEquals(client.calls[0].args, { _actor_id: SHIPA_TEST_ACTOR_ID });
});

Deno.test("maps the raw document to the safe camelCase envelope", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ result: createSettingsDocument() });
  const store = createShipaSettingsStore({ client });

  const envelope = await store.read({ actor: ACTOR });

  assertEquals(envelope, EXPECTED_ENVELOPE);
});

Deno.test("maps the derived credential metadata and the worker timestamp", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      worker_last_ok_at: "2026-11-03T19:09:15.075+00:00",
      settings: createSettingsBlock({
        sandbox: createEnvironmentSettings({
          credential: { present: true, rotatedAt: "2026-11-01T10:00:00.000Z", keyVersion: 2 },
        }),
      }),
    }),
  });
  const store = createShipaSettingsStore({ client });

  const envelope = await store.read({ actor: ACTOR });

  assertEquals(envelope.workerLastOkAt, "2026-11-03T19:09:15.075+00:00");
  assertEquals(envelope.settings.sandbox.credential, {
    present: true,
    rotatedAt: "2026-11-01T10:00:00.000Z",
    keyVersion: 2,
  });
  assertEquals(envelope.settings.live.credential.present, false);
});

// --- Refusing a malformed document -----------------------------------------

Deno.test("refuses a document with an unknown top-level key", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ result: createSettingsDocument({ unexpected: true }) });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("invalid_response", () => store.read({ actor: ACTOR }));
});

Deno.test("refuses a document with a missing top-level key", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: {
      integration_id: SHIPA_TEST_INTEGRATION_ID,
      settings: createSettingsBlock(),
      verification: { sandbox: null, live: null },
    },
  });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("invalid_response", () => store.read({ actor: ACTOR }));
});

Deno.test("refuses a document whose integration id is not a uuid", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ result: createSettingsDocument({ integration_id: "not-a-uuid" }) });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("invalid_response", () => store.read({ actor: ACTOR }));
});

Deno.test("refuses a document whose settings carry an unknown key", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      settings: createSettingsBlock({ nickname: "warehouse" }),
    }),
  });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("invalid_response", () => store.read({ actor: ACTOR }));
});

Deno.test("refuses a document that leaks a credential tuple", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      settings: createSettingsBlock({
        sandbox: createEnvironmentSettings({
          credential: {
            present: true,
            rotatedAt: "2026-11-01T10:00:00.000Z",
            keyVersion: 1,
            nonce: "AAAAAAAAAAAAAAAAAAAAAA==",
            ciphertext: "AQIDBAUGBwgJCgsMDQ4PEA==",
          },
        }),
      }),
    }),
  });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("invalid_response", () => store.read({ actor: ACTOR }));
});

Deno.test("refuses credential metadata that contradicts the presence flag", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      settings: createSettingsBlock({
        sandbox: createEnvironmentSettings({
          credential: { present: false, rotatedAt: null, keyVersion: 3 },
        }),
      }),
    }),
  });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("invalid_response", () => store.read({ actor: ACTOR }));
});

Deno.test("refuses a present credential without a rotation timestamp", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      settings: createSettingsBlock({
        sandbox: createEnvironmentSettings({
          credential: { present: true, rotatedAt: null, keyVersion: 1 },
        }),
      }),
    }),
  });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("invalid_response", () => store.read({ actor: ACTOR }));
});

Deno.test("refuses a verification summary that is not null", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      verification: { sandbox: { ok: true }, live: null },
    }),
  });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("invalid_response", () => store.read({ actor: ACTOR }));
});

Deno.test("refuses a worker timestamp that is not a timestamp", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({ worker_last_ok_at: "yesterday" }),
  });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("invalid_response", () => store.read({ actor: ACTOR }));
});

Deno.test("refuses a document that is not an object", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ result: "not-a-document" });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("invalid_response", () => store.read({ actor: ACTOR }));
});

// --- The actor boundary -----------------------------------------------------

Deno.test("refuses an actor id that is not a uuid and calls nothing", async () => {
  const client = createFakeShipaRpcClient();
  const store = createShipaSettingsStore({ client });

  await expectStoreError(
    "invalid_request",
    () => store.read({ actor: { userId: "not-a-uuid" } }),
  );
  assertEquals(client.calls.length, 0);
});

// --- Saving -----------------------------------------------------------------

Deno.test("saves with the exact parameter names and no credential change", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      settings: createSettingsBlock({ revision: 5 }),
    }),
  });
  const store = createShipaSettingsStore({ client });

  await store.save({ actor: ACTOR, request: createSaveRequest() });

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_save_settings");
  assertEquals(client.calls[0].args, {
    _expected_revision: 4,
    _settings: {
      enabled: false,
      environment: "sandbox",
      dispatchMode: "manual_after_packing",
      sandbox: {
        appId: "app-test",
        origin: EXPECTED_ORIGIN,
        serviceCode: "Same Day",
        autoConfirm: false,
        pickupInstructions: "",
        parcel: {
          count: 1,
          weightKg: 1.5,
          dimensionsCm: { lengthCm: 20, widthCm: 15, heightCm: 10 },
        },
      },
      live: {
        appId: "app-test",
        origin: EXPECTED_ORIGIN,
        serviceCode: "Same Day",
        autoConfirm: false,
        pickupInstructions: "",
        parcel: {
          count: 1,
          weightKg: 1.5,
          dimensionsCm: { lengthCm: 20, widthCm: 15, heightCm: 10 },
        },
      },
    },
    _credential_change: null,
    _actor_id: SHIPA_TEST_ACTOR_ID,
  });
});

Deno.test("never sends the derived credential metadata in a save", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      settings: createSettingsBlock({ revision: 5 }),
    }),
  });
  const store = createShipaSettingsStore({ client });

  await store.save({ actor: ACTOR, request: createSaveRequest() });

  const settings = client.calls[0].args["_settings"] as Record<string, unknown>;
  const sandbox = settings["sandbox"] as Record<string, unknown>;
  assertEquals(Object.prototype.hasOwnProperty.call(settings, "credential"), false);
  assertEquals(Object.prototype.hasOwnProperty.call(sandbox, "credential"), false);
});

Deno.test("never reads the settings before saving", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      settings: createSettingsBlock({ revision: 5 }),
    }),
  });
  const store = createShipaSettingsStore({ client });

  await store.save({ actor: ACTOR, request: createSaveRequest() });

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_save_settings");
});

Deno.test("returns the safe envelope of a successful save", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      settings: createSettingsBlock({ revision: 5 }),
    }),
  });
  const store = createShipaSettingsStore({ client });

  const envelope = await store.save({ actor: ACTOR, request: createSaveRequest() });

  assertEquals(envelope.settings.revision, 5);
  assertEquals(envelope.integrationId, SHIPA_TEST_INTEGRATION_ID);
  assertEquals(envelope.verification, { sandbox: null, live: null });
});

Deno.test("refuses a save whose returned revision is not the expected one plus one", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      settings: createSettingsBlock({ revision: 9 }),
    }),
  });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("invalid_response", () =>
    store.save({ actor: ACTOR, request: createSaveRequest() })
  );
});

Deno.test("refuses a save request with an unknown field and calls nothing", async () => {
  const client = createFakeShipaRpcClient();
  const store = createShipaSettingsStore({ client });

  await expectStoreError(
    "invalid_request",
    () =>
      store.save({
        actor: ACTOR,
        request: createSaveRequest({ actor: { userId: SHIPA_TEST_ACTOR_ID } }),
      }),
  );
  assertEquals(client.calls.length, 0);
});

Deno.test("refuses a save request that carries a plaintext credential field", async () => {
  const client = createFakeShipaRpcClient();
  const store = createShipaSettingsStore({ client });

  const error = await expectStoreError(
    "invalid_request",
    () =>
      store.save({
        actor: ACTOR,
        request: createSaveRequest({ apiKey: ["marker", "value"].join("-") }),
      }),
  );

  assertEquals(error.message.includes("marker-value"), false);
  assertEquals(client.calls.length, 0);
});

Deno.test("refuses a save request that carries credential metadata", async () => {
  const client = createFakeShipaRpcClient();
  const store = createShipaSettingsStore({ client });
  const request = createSaveRequest();
  const settings = request["settings"] as Record<string, unknown>;
  const sandbox = settings["sandbox"] as Record<string, unknown>;

  await expectStoreError(
    "invalid_request",
    () =>
      store.save({
        actor: ACTOR,
        request: {
          ...request,
          settings: {
            ...settings,
            sandbox: { ...sandbox, credential: { present: true } },
          },
        },
      }),
  );
  assertEquals(client.calls.length, 0);
});

Deno.test("refuses a save request with an out-of-range revision", async () => {
  const client = createFakeShipaRpcClient();
  const store = createShipaSettingsStore({ client });

  await expectStoreError(
    "invalid_request",
    () => store.save({ actor: ACTOR, request: createSaveRequest({ expectedRevision: -1 }) }),
  );
  assertEquals(client.calls.length, 0);
});

// --- The closed failure set -------------------------------------------------

Deno.test("maps a stale writer to a conflict", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ error: createSqlError("40001", "settings_conflict") });
  const store = createShipaSettingsStore({ client });

  await expectStoreError(
    "conflict",
    () => store.save({ actor: ACTOR, request: createSaveRequest() }),
  );
});

Deno.test("maps a refused actor to a forbidden failure", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ error: createSqlError("42501", "permission denied for function shipa_read_settings") });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("forbidden", () => store.read({ actor: ACTOR }));
});

Deno.test("maps a refused envelope to an invalid request", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ error: createSqlError("22023", "invalid settings envelope") });
  const store = createShipaSettingsStore({ client });

  await expectStoreError(
    "invalid_request",
    () => store.save({ actor: ACTOR, request: createSaveRequest() }),
  );
});

Deno.test("maps the exact runtime-not-ready reason to its own failure", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    error: createSqlError("55000", "shipa_runtime_not_ready: the dispatch runtime is not prepared"),
  });
  const store = createShipaSettingsStore({ client });

  await expectStoreError(
    "runtime_not_ready",
    () => store.save({ actor: ACTOR, request: createSaveRequest() }),
  );
});

Deno.test("maps an unknown runtime failure to unavailable", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ error: createSqlError("55000", "some other internal failure") });
  const store = createShipaSettingsStore({ client });

  await expectStoreError(
    "unavailable",
    () => store.save({ actor: ACTOR, request: createSaveRequest() }),
  );
});

Deno.test("maps a missing wrapper to an upgrade requirement", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ error: createSqlError("PGRST202", "Could not find the function public.shipa_read_settings") });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("upgrade_required", () => store.read({ actor: ACTOR }));
});

Deno.test("maps an unknown database state to unavailable", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ error: createSqlError("XX000", "something else entirely") });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("unavailable", () => store.read({ actor: ACTOR }));
});

Deno.test("maps a rejected promise without a database state to unavailable", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ rejection: new Error("socket closed") });
  const store = createShipaSettingsStore({ client });

  await expectStoreError("unavailable", () => store.read({ actor: ACTOR }));
});

Deno.test("never leaks the database message, detail, hint or cause", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    error: {
      code: "42501",
      message: "marker-secret-message",
      details: "marker-secret-detail",
      hint: "marker-secret-hint",
    },
  });
  const store = createShipaSettingsStore({ client });

  const error = await expectStoreError("forbidden", () => store.read({ actor: ACTOR }));

  const serialized = JSON.stringify({ message: error.message, code: error.code });
  assertEquals(serialized.includes("marker-secret"), false);
  assertEquals(error.message.includes("marker-secret"), false);
  assertEquals("cause" in error, false);
});

Deno.test("never returns a credential tuple or plaintext in the envelope", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({ result: createSettingsDocument() });
  const store = createShipaSettingsStore({ client });

  const envelope = await store.read({ actor: ACTOR });
  const serialized = JSON.stringify(envelope);

  assertEquals(serialized.includes("ciphertext"), false);
  assertEquals(serialized.includes("nonce"), false);
  assertEquals(serialized.includes("apiKey"), false);
  assertEquals(serialized.includes("integration_id"), false);
});

// --- Disabled configurations ------------------------------------------------

Deno.test("saves the preferences of a disabled configuration", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    result: createSettingsDocument({
      settings: createSettingsBlock({ enabled: false, revision: 5 }),
    }),
  });
  const store = createShipaSettingsStore({ client });

  const envelope = await store.save({ actor: ACTOR, request: createSaveRequest() });

  assertEquals(envelope.settings.enabled, false);
  assertEquals(envelope.settings.revision, 5);
});

Deno.test("never reports a refused enablement as an enabled configuration", async () => {
  const client = createFakeShipaRpcClient();
  client.queue({
    error: createSqlError("55000", "shipa_runtime_not_ready"),
  });
  const store = createShipaSettingsStore({ client });
  const request = createSaveRequest({
    expectedRevision: 4,
    settings: {
      enabled: true,
      environment: "sandbox",
      dispatchMode: "manual_after_packing",
      sandbox: createEnvironmentConfig(),
      live: createEnvironmentConfig(),
    },
  });

  await expectStoreError(
    "runtime_not_ready",
    () => store.save({ actor: ACTOR, request: request }),
  );
  assertEquals(client.calls.length, 1);
});
