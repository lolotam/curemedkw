// Behavioural tests for the Shipa credential service.
//
// The real settings store, the real strict request parser, the real Web
// Crypto primitives and the real credential contract run here. The only
// substitute is the SDK boundary, which is faked.
//
// No secret, no key, no account and no personal data is used: every value is
// a made-up placeholder, and the synthetic master key is generated freshly
// for every test.

import { assertEquals } from "jsr:@std/assert@1.0.19";

import { decryptIntegrationCredential } from "../../_shared/integration-credentials.ts";
import { ShipaConfigurationError } from "../../_shared/shipa-configuration-service-contract.ts";
import { createShipaCredentialService } from "../../_shared/shipa-credential-service.ts";
import {
  createSyntheticKeyring,
  SHIPA_TEST_API_CREDENTIAL as providerKey,
} from "./shipa-credential-loader-fixtures.ts";
import {
  createCredentialSaveRequest,
  createFakeShipaSdkClient,
  expectConfigurationFailure,
  FAKE_SDK_ENVELOPE,
  type FakeShipaSdkClient,
} from "./shipa-configuration-service-fixtures.ts";
import {
  createEnvironmentConfig,
  createEnvironmentSettings,
  createSettingsBlock,
  createSettingsDocument,
  createSqlError,
  SHIPA_TEST_ACTOR_ID,
  SHIPA_TEST_INTEGRATION_ID,
} from "./shipa-settings-fixtures.ts";

const ACTOR = { userId: SHIPA_TEST_ACTOR_ID };

/** The revision the synthetic stored settings carry. */
const STORED_REVISION = 4;

/**
 * Builds a client whose settings read reports the given revision and whose
 * save reports the revision one step further.
 */
function createServiceClient(
  revision = STORED_REVISION,
): FakeShipaSdkClient {
  const client = createFakeShipaSdkClient();
  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_save_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: revision + 1 }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  return client;
}

function savedCall(client: FakeShipaSdkClient) {
  const call = client.calls.find((entry) => entry.fn === "shipa_save_settings");
  if (call === undefined) {
    throw new Error("the service made no settings write");
  }
  return call;
}

// ---------------------------------------------------------------------------
// Replacement
// ---------------------------------------------------------------------------

Deno.test("replaces the credential in the server-read binding", async () => {
  const replacement = "  synthetic-replacement-key  ";
  const client = createServiceClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const envelope = await service.save({
    actor: ACTOR,
    request: createCredentialSaveRequest({
      expectedRevision: STORED_REVISION,
      credential: {
        environment: "sandbox",
        mode: "replace",
        apiKey: replacement,
      },
    }),
  });

  // The save advances the revision exactly once.
  assertEquals(envelope.settings.revision, STORED_REVISION + 1);

  const change = savedCall(client).args["_credential_change"] as Record<
    string,
    unknown
  >;
  assertEquals(change["mode"], "replace");
  assertEquals(change["environment"], "sandbox");

  const stored = change["envelope"] as Record<string, unknown>;
  assertEquals(stored["integration_id"], SHIPA_TEST_INTEGRATION_ID);
  assertEquals(stored["provider"], "shipa");
  assertEquals(stored["environment"], "sandbox");
  assertEquals(stored["key_version"], keyVersion);

  // The envelope really decrypts in the server-read binding, and the key was
  // trimmed before it was encrypted.
  const plaintext = await decryptIntegrationCredential(
    stored,
    {
      integrationId: SHIPA_TEST_INTEGRATION_ID,
      provider: "shipa",
      environment: "sandbox",
      keyVersion,
    },
    keyring,
  );
  assertEquals(plaintext, "synthetic-replacement-key");
});

Deno.test("never asks the browser for the integration id", async () => {
  const client = createServiceClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const failure = await expectConfigurationFailure(() =>
    service.save({
      actor: ACTOR,
      request: createCredentialSaveRequest({
        integrationId: SHIPA_TEST_INTEGRATION_ID,
      }),
    })
  );

  assertEquals(failure.code, "invalid_request");
  assertEquals(client.calls.length, 0);
});

Deno.test("writes the verified actor id and the validated settings", async () => {
  const client = createServiceClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  await service.save({
    actor: ACTOR,
    request: createCredentialSaveRequest({ expectedRevision: STORED_REVISION }),
  });

  const call = savedCall(client);
  assertEquals(call.args["_actor_id"], SHIPA_TEST_ACTOR_ID);
  assertEquals(call.args["_expected_revision"], STORED_REVISION);
  const settings = call.args["_settings"] as Record<string, unknown>;
  assertEquals(settings["dispatchMode"], "manual_after_packing");
  assertEquals(settings["environment"], "sandbox");
  // The derived credential metadata is server-owned and is never sent.
  const sandbox = settings["sandbox"] as Record<string, unknown>;
  assertEquals(Object.hasOwn(sandbox, "credential"), false);
});

Deno.test("makes exactly one settings write", async () => {
  const client = createServiceClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  await service.save({
    actor: ACTOR,
    request: createCredentialSaveRequest({ expectedRevision: STORED_REVISION }),
  });

  assertEquals(client.calls.length, 2);
  assertEquals(client.calls[0].fn, "shipa_read_settings");
  assertEquals(client.calls[1].fn, "shipa_save_settings");
});

// ---------------------------------------------------------------------------
// Preserve and removal
// ---------------------------------------------------------------------------

Deno.test("preserves the stored credential for an explicit preserve", async () => {
  const client = createServiceClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  await service.save({
    actor: ACTOR,
    request: createCredentialSaveRequest({
      expectedRevision: STORED_REVISION,
      credential: { environment: "sandbox", mode: "preserve" },
    }),
  });

  assertEquals(savedCall(client).args["_credential_change"], null);
});

Deno.test("treats a blank replacement key as preserve", async () => {
  const client = createServiceClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  await service.save({
    actor: ACTOR,
    request: createCredentialSaveRequest({
      expectedRevision: STORED_REVISION,
      credential: { environment: "sandbox", mode: "replace", apiKey: "   " },
    }),
  });

  // A blank key never removes a stored credential.
  assertEquals(savedCall(client).args["_credential_change"], null);
});

Deno.test("removes the credential of the named environment only", async () => {
  const client = createServiceClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  await service.save({
    actor: ACTOR,
    request: createCredentialSaveRequest({
      expectedRevision: STORED_REVISION,
      credential: { environment: "live", mode: "remove" },
    }),
  });

  const change = savedCall(client).args["_credential_change"] as Record<
    string,
    unknown
  >;
  assertEquals(change["mode"], "remove");
  assertEquals(change["environment"], "live");
  assertEquals(change["envelope"], undefined);
});

// ---------------------------------------------------------------------------
// Refusal before any I/O
// ---------------------------------------------------------------------------

Deno.test("refuses a tainted request before any database call", async () => {
  const client = createServiceClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const taintedSettings = {
    enabled: false,
    environment: "sandbox",
    dispatchMode: "manual_after_packing",
    sandbox: { ...createEnvironmentConfig(), apiKey: "leaked-key" },
    live: createEnvironmentConfig(),
  };

  const tainted: readonly Record<string, unknown>[] = [
    createCredentialSaveRequest({ actor: ACTOR }),
    createCredentialSaveRequest({ endpoint: "https://attacker.example" }),
    createCredentialSaveRequest({ proof: "signed" }),
    createCredentialSaveRequest({ ciphertext: "AAA" }),
    createCredentialSaveRequest({ envelope: {} }),
    createCredentialSaveRequest({ credentialMetadata: { present: true } }),
    createCredentialSaveRequest({
      credential: { environment: "sandbox", mode: "remove", apiKey: "leaked" },
    }),
    createCredentialSaveRequest({
      credential: {
        environment: "sandbox",
        mode: "preserve",
        apiKey: "leaked",
      },
    }),
    createCredentialSaveRequest({
      credential: { environment: "sandbox", mode: "replace" },
    }),
    createCredentialSaveRequest({
      credential: { environment: "production", mode: "preserve" },
    }),
    createCredentialSaveRequest({
      credential: { environment: "sandbox", mode: "rotate" },
    }),
    createCredentialSaveRequest({ settings: taintedSettings }),
  ];

  for (const request of tainted) {
    const failure = await expectConfigurationFailure(() =>
      service.save({ actor: ACTOR, request })
    );
    assertEquals(failure.code, "invalid_request");
  }

  // Nothing reached the database.
  assertEquals(client.calls.length, 0);
});

Deno.test("refuses an actor descriptor that carries anything else", async () => {
  const client = createServiceClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const withRole = { userId: SHIPA_TEST_ACTOR_ID, role: "admin" };
  const notAUuid = { userId: "not-a-uuid" };

  for (const actor of [withRole, notAUuid]) {
    const failure = await expectConfigurationFailure(() =>
      service.save({
        actor,
        request: createCredentialSaveRequest({
          expectedRevision: STORED_REVISION,
        }),
      })
    );
    assertEquals(failure.code, "invalid_request");
  }

  assertEquals(client.calls.length, 0);
});

Deno.test("refuses a stale expected revision before any write", async () => {
  const client = createServiceClient(STORED_REVISION);
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const failure = await expectConfigurationFailure(() =>
    service.save({
      actor: ACTOR,
      request: createCredentialSaveRequest({ expectedRevision: 1 }),
    })
  );

  assertEquals(failure.code, "conflict");
  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_read_settings");
});

// ---------------------------------------------------------------------------
// The closed SQL failures
// ---------------------------------------------------------------------------

async function saveWithSqlFailure(
  error: unknown,
): Promise<ShipaConfigurationError> {
  const client = createFakeShipaSdkClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  client.respond("shipa_read_settings", {
    data: createSettingsDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_save_settings", { error, extra: FAKE_SDK_ENVELOPE });
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });
  return await expectConfigurationFailure(() =>
    service.save({
      actor: ACTOR,
      request: createCredentialSaveRequest({ expectedRevision: 0 }),
    })
  );
}

Deno.test("maps the closed SQL states onto closed codes", async () => {
  const conflict = await saveWithSqlFailure(
    createSqlError("40001", "settings_conflict"),
  );
  assertEquals(conflict.code, "conflict");

  const uniqueViolation = await saveWithSqlFailure(
    createSqlError("23505", "duplicate_key"),
  );
  assertEquals(uniqueViolation.code, "conflict");

  const deadlock = await saveWithSqlFailure(
    createSqlError("40P01", "deadlock_detected"),
  );
  assertEquals(deadlock.code, "conflict");

  const forbidden = await saveWithSqlFailure(
    createSqlError("42501", "permission denied"),
  );
  assertEquals(forbidden.code, "forbidden");

  const missingWrapper = await saveWithSqlFailure(
    createSqlError("PGRST202", "function not found"),
  );
  assertEquals(missingWrapper.code, "upgrade_required");

  const inUse = await saveWithSqlFailure(
    createSqlError("55000", "shipa_credential_in_use"),
  );
  assertEquals(inUse.code, "credential_in_use");

  const runtimeNotReady = await saveWithSqlFailure(
    createSqlError("55000", "shipa_runtime_not_ready"),
  );
  assertEquals(runtimeNotReady.code, "runtime_not_ready");

  const unknownState = await saveWithSqlFailure(
    createSqlError("XX000", "something else"),
  );
  assertEquals(unknownState.code, "unavailable");
});

Deno.test("matches the SQL reason token exactly", async () => {
  const longerWord = await saveWithSqlFailure(
    createSqlError("55000", "shipa_credential_in_use_pending"),
  );
  assertEquals(longerWord.code, "unavailable");

  const exact = await saveWithSqlFailure(
    createSqlError("55000", "refused: shipa_credential_in_use."),
  );
  assertEquals(exact.code, "credential_in_use");
});

Deno.test("reports a transport failure as unavailable and never retries", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  client.respond("shipa_read_settings", {
    data: createSettingsDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_save_settings", {
    rejection: new Error("connection reset"),
  });
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const failure = await expectConfigurationFailure(() =>
    service.save({
      actor: ACTOR,
      request: createCredentialSaveRequest({ expectedRevision: 0 }),
    })
  );

  assertEquals(failure.code, "unavailable");
  const writes = client.calls.filter((call) =>
    call.fn === "shipa_save_settings"
  );
  assertEquals(writes.length, 1);
});

// ---------------------------------------------------------------------------
// The malformed answer
// ---------------------------------------------------------------------------

Deno.test("never reports a bad revision as a success", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  client.respond("shipa_read_settings", {
    data: createSettingsDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_save_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: 9 }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const failure = await expectConfigurationFailure(() =>
    service.save({
      actor: ACTOR,
      request: createCredentialSaveRequest({ expectedRevision: 0 }),
    })
  );

  assertEquals(failure.code, "invalid_response");
});

Deno.test("refuses a malformed SDK envelope", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  client.respond("shipa_read_settings", {
    data: createSettingsDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_save_settings", { raw: { data: null } });
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const failure = await expectConfigurationFailure(() =>
    service.save({
      actor: ACTOR,
      request: createCredentialSaveRequest({ expectedRevision: 0 }),
    })
  );

  assertEquals(failure.code, "invalid_response");
});

Deno.test("a successful credential save requires an explicit null SDK error", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  client.respond("shipa_read_settings", { data: createSettingsDocument() });
  client.respond("shipa_save_settings", {
    raw: {
      data: createSettingsDocument({
        settings: createSettingsBlock({ revision: 1 }),
      }),
      error: undefined,
    },
  });
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });
  const failure = await expectConfigurationFailure(() =>
    service.save({
      actor: ACTOR,
      request: createCredentialSaveRequest({
        expectedRevision: 0,
        credential: { environment: "sandbox", mode: "preserve" },
      }),
    })
  );
  assertEquals(failure.code, "invalid_response");
  assertEquals(
    client.calls.filter((call) => call.fn === "shipa_save_settings").length,
    1,
  );
});

Deno.test("refuses a SQL document with an unknown field", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  client.respond("shipa_read_settings", {
    data: createSettingsDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_save_settings", {
    data: createSettingsDocument({ cipher: "AAA" }),
    extra: FAKE_SDK_ENVELOPE,
  });
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const failure = await expectConfigurationFailure(() =>
    service.save({
      actor: ACTOR,
      request: createCredentialSaveRequest({ expectedRevision: 0 }),
    })
  );

  assertEquals(failure.code, "invalid_response");
});

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

Deno.test("never leaks a key into a failure", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  client.respond("shipa_read_settings", {
    data: createSettingsDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_save_settings", {
    error: createSqlError("55000", "shipa_credential_in_use"),
    extra: FAKE_SDK_ENVELOPE,
  });
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const failure = await expectConfigurationFailure(() =>
    service.save({
      actor: ACTOR,
      request: createCredentialSaveRequest({
        expectedRevision: 0,
        credential: {
          environment: "sandbox",
          mode: "replace",
          apiKey: providerKey,
        },
      }),
    })
  );

  assertEquals(failure.code, "credential_in_use");
  assertEquals(failure.message.includes(providerKey), false);
  assertEquals(
    JSON.stringify(failure).includes(providerKey),
    false,
  );
  assertEquals(Object.hasOwn(failure, "cause"), false);
});

Deno.test("never returns a key in the safe envelope", async () => {
  const client = createServiceClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const envelope = await service.save({
    actor: ACTOR,
    request: createCredentialSaveRequest({
      expectedRevision: STORED_REVISION,
      credential: {
        environment: "sandbox",
        mode: "replace",
        apiKey: providerKey,
      },
    }),
  });

  const serialised = JSON.stringify(envelope);
  assertEquals(serialised.includes(providerKey), false);
  assertEquals(serialised.includes("ciphertext"), false);
  assertEquals(serialised.includes("nonce"), false);
});

// ---------------------------------------------------------------------------
// The injected key version
// ---------------------------------------------------------------------------

Deno.test("refuses to build a service without a usable key version", async () => {
  const client = createServiceClient();
  const { keyring } = await createSyntheticKeyring();

  for (const currentKeyVersion of [0, -1, 1.5, 1_000_000_000]) {
    let raised: unknown;
    try {
      createShipaCredentialService({ client, keyring, currentKeyVersion });
    } catch (error) {
      raised = error;
    }
    if (!(raised instanceof ShipaConfigurationError)) {
      throw new Error("the service was expected to refuse this key version");
    }
    assertEquals(raised.code, "invalid_configuration");
  }

  // A version the keyring does not hold is refused as well.
  let raised: unknown;
  try {
    createShipaCredentialService({ client, keyring, currentKeyVersion: 2 });
  } catch (error) {
    raised = error;
  }
  if (!(raised instanceof ShipaConfigurationError)) {
    throw new Error(
      "the service was expected to refuse an unknown key version",
    );
  }
  assertEquals(raised.code, "invalid_configuration");
});

Deno.test("reports the stored credential metadata of the safe document", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_save_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({
        revision: STORED_REVISION + 1,
        sandbox: createEnvironmentSettings({
          credential: {
            present: true,
            rotatedAt: "2026-11-03T22:41:55.105Z",
            keyVersion,
          },
        }),
      }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });

  const envelope = await service.save({
    actor: ACTOR,
    request: createCredentialSaveRequest({
      expectedRevision: STORED_REVISION,
      credential: {
        environment: "sandbox",
        mode: "replace",
        apiKey: providerKey,
      },
    }),
  });

  assertEquals(envelope.settings.sandbox.credential.present, true);
  assertEquals(envelope.settings.sandbox.credential.keyVersion, keyVersion);
  assertEquals(envelope.settings.live.credential.present, false);
});

Deno.test("rejects an oversized UTF-8 credential before database access", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring, keyVersion } = await createSyntheticKeyring();
  const service = createShipaCredentialService({
    client,
    keyring,
    currentKeyVersion: keyVersion,
  });
  const failure = await expectConfigurationFailure(() =>
    service.save({
      actor: ACTOR,
      request: createCredentialSaveRequest({
        credential: {
          environment: "sandbox",
          mode: "replace",
          apiKey: "é".repeat(8193),
        },
      }),
    })
  );
  assertEquals(failure.code, "invalid_request");
  assertEquals(client.calls.length, 0);
});
