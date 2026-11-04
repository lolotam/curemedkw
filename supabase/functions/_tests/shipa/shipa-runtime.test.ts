// Behavioural tests for the Shipa runtime factory.
//
// The real settings store, the real credential service, the real readiness
// service, the real Web Crypto primitives and the real strict parsers run
// here. The only substitute is the Supabase SDK boundary, which is faked.
//
// No secret, key, account or personal data is used: every value is a made-up
// placeholder, and the synthetic master key is generated freshly for every
// test.

import { assertEquals } from "jsr:@std/assert@1.0.19";
import { createClient } from "npm:@supabase/supabase-js@2.105.1";
import { requireShipaAdmin } from "../../_shared/shipa-auth.ts";

import { decryptIntegrationCredential } from "../../_shared/integration-credentials.ts";
import {
  createShipaRuntimeClient,
  createShipaRuntimeServices,
  SHIPA_RUNTIME_KEY_VERSION,
} from "../../_shared/shipa-runtime.ts";
import {
  createFakeEncryptionKeyReader,
  createFakeShipaAdminClient,
  createSyntheticMasterKey,
  type FakeShipaAdminClient,
} from "./shipa-admin-fixtures.ts";
import {
  createCredentialSaveRequest,
  expectConfigurationFailure,
  FAKE_SDK_ENVELOPE,
} from "./shipa-configuration-service-fixtures.ts";
import { createReadinessDocument } from "./shipa-readiness-service-fixtures.ts";
import {
  createSettingsBlock,
  createSettingsDocument,
  SHIPA_TEST_ACTOR_ID,
  SHIPA_TEST_INTEGRATION_ID,
} from "./shipa-settings-fixtures.ts";

/** The verified administrator of the synthetic session. */
const ADMIN_ID = SHIPA_TEST_ACTOR_ID;

/** The revision the synthetic stored settings carry. */
const STORED_REVISION = 4;

/** A synthetic replacement credential. It is not a real provider key. */
const FAKE_KEY = "synthetic-runtime-replacement-key-not-real";

Deno.test("forwards verified auth, role filters and RPC through the real SDK", async () => {
  const calls: Request[] = [];
  const sdk = createClient("https://sdk-boundary.test", "synthetic-sdk-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => {
        const request = new Request(input, init);
        calls.push(request);
        const path = new URL(request.url).pathname;
        const result = path === "/auth/v1/user"
          ? {
            id: ADMIN_ID,
            email: "sdk@example.test",
            app_metadata: {},
            user_metadata: {},
          }
          : path === "/rest/v1/user_roles"
          ? [{ role: "admin" }]
          : { settings: "synthetic-projection" };
        return Promise.resolve(
          new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          }),
        );
      },
    },
  });
  const adapter = createShipaRuntimeClient(sdk);
  const access = "synthetic-session";
  const result = await requireShipaAdmin(
    new Request("https://admin.test", {
      headers: { authorization: `Bearer ${access}` },
    }),
    adapter,
  );
  assertEquals(result, { ok: true, actor: { userId: ADMIN_ID } });
  assertEquals(calls[0].headers.get("authorization"), `Bearer ${access}`);
  const roleUrl = new URL(calls[1].url);
  assertEquals(roleUrl.searchParams.get("select"), "role");
  assertEquals(roleUrl.searchParams.get("user_id"), `eq.${ADMIN_ID}`);
  assertEquals(roleUrl.searchParams.get("role"), "eq.admin");
  const response = await adapter.rpc("shipa_read_settings", {
    _actor_id: ADMIN_ID,
  });
  assertEquals(response, {
    data: { settings: "synthetic-projection" },
    error: null,
  });
  assertEquals(
    new URL(calls[2].url).pathname,
    "/rest/v1/rpc/shipa_read_settings",
  );
  assertEquals(await calls[2].json(), { _actor_id: ADMIN_ID });
  assertEquals(calls.length, 3);
});

function createRuntime(
  client: FakeShipaAdminClient,
  readEncryptionKey: () => string | undefined,
) {
  return createShipaRuntimeServices({ client, readEncryptionKey });
}

// ---------------------------------------------------------------------------
// The safe services
// ---------------------------------------------------------------------------

Deno.test("serves the safe settings without consulting the key reader", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  const runtime = createRuntime(client, keyReader.read);

  const envelope = await runtime.settingsStore.read({
    actor: { userId: ADMIN_ID },
  });

  assertEquals(envelope.integrationId, SHIPA_TEST_INTEGRATION_ID);
  assertEquals(envelope.settings.revision, STORED_REVISION);
  assertEquals(keyReader.callCount(), 0);
});

Deno.test("serves the readiness projection without consulting the key reader", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  client.respond("shipa_read_readiness", {
    data: createReadinessDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });
  const runtime = createRuntime(client, keyReader.read);

  const readiness = await runtime.createReadinessService().read({
    actor: { userId: ADMIN_ID },
  });

  assertEquals(readiness.settingsRevision, 4);
  assertEquals(keyReader.callCount(), 0);
});

// ---------------------------------------------------------------------------
// The master key
// ---------------------------------------------------------------------------

Deno.test("refuses a missing master key with a fixed failure", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader();
  const runtime = createRuntime(client, keyReader.read);

  const failure = await expectConfigurationFailure(() =>
    runtime.requireKeyring()
  );

  assertEquals(failure.code, "invalid_configuration");
  assertEquals(keyReader.callCount(), 1);
});

Deno.test("refuses a master key that is not canonical base64", async () => {
  const client = createFakeShipaAdminClient();
  const keyReader = createFakeEncryptionKeyReader("not-canonical-base64!!");
  const runtime = createRuntime(client, keyReader.read);

  const failure = await expectConfigurationFailure(() =>
    runtime.requireKeyring()
  );

  assertEquals(failure.code, "invalid_configuration");
});

Deno.test("loads the master key into the server-owned key version", async () => {
  const client = createFakeShipaAdminClient();
  const master = await createSyntheticMasterKey();
  const keyReader = createFakeEncryptionKeyReader(master.encoded);
  const runtime = createRuntime(client, keyReader.read);

  const keyring = await runtime.requireKeyring();

  assertEquals(SHIPA_RUNTIME_KEY_VERSION, 1);
  assertEquals(keyring.size, 1);
  assertEquals(keyring.get(SHIPA_RUNTIME_KEY_VERSION) !== undefined, true);
});

// ---------------------------------------------------------------------------
// The credential service
// ---------------------------------------------------------------------------

Deno.test("encrypts a replaced credential under the server-owned key version", async () => {
  const client = createFakeShipaAdminClient();
  const master = await createSyntheticMasterKey();
  const keyReader = createFakeEncryptionKeyReader(master.encoded);
  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_save_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION + 1 }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  const runtime = createRuntime(client, keyReader.read);

  const service = await runtime.requireCredentialService();
  await service.save({
    actor: { userId: ADMIN_ID },
    request: createCredentialSaveRequest({
      expectedRevision: STORED_REVISION,
      credential: {
        environment: "sandbox",
        mode: "replace",
        apiKey: FAKE_KEY,
      },
    }),
  });

  const call = client.rpcCalls.find((entry) =>
    entry.fn === "shipa_save_settings"
  );
  if (call === undefined) {
    throw new Error("the service made no settings write");
  }
  const change = call.args["_credential_change"] as Record<string, unknown>;
  const envelope = change["envelope"] as Record<string, unknown>;

  // The version is the server's own, and the key belongs to the runtime.
  assertEquals(envelope["key_version"], SHIPA_RUNTIME_KEY_VERSION);
  assertEquals(envelope["integration_id"], SHIPA_TEST_INTEGRATION_ID);

  const plaintext = await decryptIntegrationCredential(
    envelope,
    {
      integrationId: SHIPA_TEST_INTEGRATION_ID,
      provider: "shipa",
      environment: "sandbox",
      keyVersion: SHIPA_RUNTIME_KEY_VERSION,
    },
    master.keyring,
  );
  assertEquals(plaintext, FAKE_KEY);
});
