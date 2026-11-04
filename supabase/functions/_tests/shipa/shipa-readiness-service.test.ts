// Behavioural tests for the Shipa readiness service.
//
// The real strict projection parser, the real settings store, the real
// credential loader, the real Web Crypto primitives, the real provider
// adapter and its parsers run here. The only substitutes are the SDK
// boundary and the fetch boundary, which are faked.
//
// No secret, no key, no account and no personal data is used: every value is
// a made-up placeholder, and the synthetic master key is generated freshly
// for every test.

import { assertEquals } from "jsr:@std/assert@1.0.19";

import { createShipaReadinessService } from "../../_shared/shipa-readiness-service.ts";
import {
  createStoredCredentialDocument,
  createSyntheticKeyring,
  SHIPA_TEST_API_CREDENTIAL,
  SHIPA_TEST_FINGERPRINT,
} from "./shipa-credential-loader-fixtures.ts";
import {
  createCredentialSaveRequest,
  createFakeShipaSdkClient,
  expectConfigurationFailure,
  FAKE_SDK_ENVELOPE,
  type FakeShipaSdkClient,
} from "./shipa-configuration-service-fixtures.ts";
import { createFakeFetch, jsonResponse } from "./shipa-fixtures.ts";
import {
  countryResponse,
  createEnvironmentReadiness,
  createMissingEnvironmentReadiness,
  createObservationAcknowledgement,
  createReadinessDocument,
  healthResponse,
  otherCountryResponse,
  SHIPA_TEST_KWT_CITIES,
} from "./shipa-readiness-service-fixtures.ts";
import {
  createSettingsBlock,
  createSettingsDocument,
  createSqlError,
  SHIPA_TEST_ACTOR_ID,
} from "./shipa-settings-fixtures.ts";

const ACTOR = { userId: SHIPA_TEST_ACTOR_ID };

/** The revision the synthetic stored settings carry. */
const STORED_REVISION = 4;

/**
 * Queues the four database answers of one successful diagnosis.
 */
function queueDiagnosis(
  client: FakeShipaSdkClient,
  credentialDocument: Record<string, unknown>,
  acknowledgement: Record<string, unknown> = createObservationAcknowledgement(),
  readiness: Record<string, unknown> = createReadinessDocument(),
): void {
  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_read_credential", {
    data: credentialDocument,
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_record_provider_observation", {
    data: acknowledgement,
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_read_readiness", {
    data: readiness,
    extra: FAKE_SDK_ENVELOPE,
  });
}

function recordedObservation(client: FakeShipaSdkClient) {
  const call = client.calls.find(
    (entry) => entry.fn === "shipa_record_provider_observation",
  );
  if (call === undefined) {
    throw new Error("the service recorded no observation");
  }
  return call.args["_observation"] as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// The read-only projection
// ---------------------------------------------------------------------------

Deno.test("reads the readiness projection without any other call", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch(() => jsonResponse({}, { status: 500 }));
  client.respond("shipa_read_readiness", {
    data: createReadinessDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  const projection = await service.read({ actor: ACTOR });

  assertEquals(projection.settingsRevision, 4);
  assertEquals(projection.activeEnvironment, "sandbox");
  assertEquals(projection.environments.sandbox.credentialPresent, true);
  assertEquals(projection.environments.sandbox.configurationReady, true);
  assertEquals(projection.environments.sandbox.probeCurrent, true);
  assertEquals(projection.environments.sandbox.credentialsVerified, true);
  assertEquals(projection.environments.sandbox.originCityMatched, true);
  assertEquals(projection.environments.sandbox.safeCode, null);
  assertEquals(
    projection.environments.sandbox.serviceEntitlement,
    "unconfirmed",
  );
  assertEquals(projection.environments.live.credentialsVerified, false);
  assertEquals(projection.environments.live.safeCode, "credential_missing");
  assertEquals(projection.scheduler.lastOkAt, null);
  assertEquals(projection.scheduler.current, false);

  // The projection is the only call: no settings, no credential, no provider.
  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_read_readiness");
  assertEquals(fake.requests.length, 0);
});

Deno.test("never maps an unknown field away", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  // The projection never reaches the provider: a real fetch would fail.
  const fake = createFakeFetch(() => jsonResponse({}, { status: 500 }));
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  const tainted: readonly Record<string, unknown>[] = [
    createReadinessDocument({ cipher: "AAA" }),
    createReadinessDocument({
      environments: {
        sandbox: createEnvironmentReadiness(),
        live: createEnvironmentReadiness(),
        extra: {},
      },
    }),
    createReadinessDocument({
      environments: {
        sandbox: createEnvironmentReadiness({ fingerprint: "abc" }),
        live: createEnvironmentReadiness(),
      },
    }),
    createReadinessDocument({
      environments: {
        sandbox: createEnvironmentReadiness({
          service_entitlement: "granted",
        }),
        live: createEnvironmentReadiness(),
      },
    }),
    createReadinessDocument({
      environments: {
        sandbox: createEnvironmentReadiness({ safe_code: "not_a_fixed_code" }),
        live: createEnvironmentReadiness(),
      },
    }),
    createReadinessDocument({
      environments: {
        sandbox: createEnvironmentReadiness({ credentials_verified: "yes" }),
        live: createEnvironmentReadiness(),
      },
    }),
    createReadinessDocument({
      scheduler: { last_ok_at: null, current: false, extra: 1 },
    }),
  ];

  for (const document of tainted) {
    client.respond("shipa_read_readiness", {
      data: document,
      extra: FAKE_SDK_ENVELOPE,
    });
    const failure = await expectConfigurationFailure(() =>
      service.read({ actor: ACTOR })
    );
    assertEquals(failure.code, "invalid_response");
  }
});

// ---------------------------------------------------------------------------
// The diagnosis
// ---------------------------------------------------------------------------

Deno.test("diagnoses with the fixed-origin adapter and records the result", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/health")) return healthResponse("OK");
    return countryResponse();
  });
  queueDiagnosis(
    client,
    await createStoredCredentialDocument({ keyring, environment: "sandbox" }),
  );
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  await service.diagnose({
    actor: ACTOR,
    request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
  });

  // Exactly two provider reads, in order, and nothing else.
  assertEquals(fake.requests.length, 2);
  const health = new URL(fake.requests[0].url);
  assertEquals(health.pathname.endsWith("/health"), true);
  assertEquals(health.origin, "https://sandbox-api.shipadelivery.com");
  assertEquals(health.searchParams.get("apikey"), SHIPA_TEST_API_CREDENTIAL);
  assertEquals(fake.requests[0].method, "GET");
  const country = new URL(fake.requests[1].url);
  assertEquals(country.pathname.endsWith("/countries/KWT"), true);
  assertEquals(country.searchParams.get("apikey"), SHIPA_TEST_API_CREDENTIAL);
  assertEquals(fake.requests[1].method, "GET");

  // The observation carries only normalised server facts.
  const observation = recordedObservation(client);
  assertEquals(observation["credentialFingerprint"], SHIPA_TEST_FINGERPRINT);
  assertEquals(observation["countryCode"], "KWT");
  assertEquals(observation["cities"], SHIPA_TEST_KWT_CITIES);
  assertEquals(observation["code"], null);
  assertEquals(observation["verified"], true);
  assertEquals(Object.keys(observation).length, 5);

  // No provider write, no heartbeat and no settings write.
  assertEquals(
    client.calledFunctions().includes("shipa_record_scheduler_ok"),
    false,
  );
  assertEquals(
    client.calledFunctions().includes("shipa_save_settings"),
    false,
  );
  assertEquals(
    fake.requests.every((request) => request.method === "GET"),
    true,
  );
});

Deno.test("stops at a failing health without asking for the directory", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch(() => jsonResponse({}, { status: 503 }));
  queueDiagnosis(
    client,
    await createStoredCredentialDocument({ keyring, environment: "sandbox" }),
    createObservationAcknowledgement({
      origin_city_matched: false,
      remote_probe_ok: false,
    }),
    createReadinessDocument({
      environments: {
        sandbox: createEnvironmentReadiness({
          probe_current: false,
          credentials_verified: false,
          origin_city_matched: false,
          safe_code: "server_error",
        }),
        live: createMissingEnvironmentReadiness(),
      },
    }),
  );
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  const projection = await service.diagnose({
    actor: ACTOR,
    request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
  });

  assertEquals(fake.requests.length, 1);
  assertEquals(fake.requests[0].method, "GET");
  const observation = recordedObservation(client);
  assertEquals(observation["verified"], false);
  assertEquals(observation["code"], "server_error");
  assertEquals(observation["countryCode"], null);
  assertEquals(observation["cities"], []);
  assertEquals(observation["credentialFingerprint"], SHIPA_TEST_FINGERPRINT);

  // The projection reports the failure honestly.
  assertEquals(projection.environments.sandbox.credentialsVerified, false);
  assertEquals(projection.environments.sandbox.safeCode, "server_error");
});

Deno.test("never verifies an unhealthy service", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/health")) return healthResponse("ERROR");
    return countryResponse();
  });
  queueDiagnosis(
    client,
    await createStoredCredentialDocument({ keyring, environment: "sandbox" }),
    createObservationAcknowledgement({
      origin_city_matched: false,
      remote_probe_ok: false,
    }),
  );
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  await service.diagnose({
    actor: ACTOR,
    request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
  });

  assertEquals(fake.requests.length, 1);
  const observation = recordedObservation(client);
  assertEquals(observation["verified"], false);
  assertEquals(observation["code"], "invalid_response");
});

Deno.test("never verifies a directory that is not Kuwait", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/health")) return healthResponse("OK");
    return otherCountryResponse();
  });
  queueDiagnosis(
    client,
    await createStoredCredentialDocument({ keyring, environment: "sandbox" }),
    createObservationAcknowledgement({
      origin_city_matched: false,
      remote_probe_ok: false,
    }),
  );
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  await service.diagnose({
    actor: ACTOR,
    request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
  });

  const observation = recordedObservation(client);
  assertEquals(observation["verified"], false);
  assertEquals(observation["code"], "invalid_response");
  assertEquals(observation["countryCode"], null);
});

Deno.test("never verifies an empty directory", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/health")) return healthResponse("OK");
    return countryResponse("KWT", []);
  });
  queueDiagnosis(
    client,
    await createStoredCredentialDocument({ keyring, environment: "sandbox" }),
    createObservationAcknowledgement({
      origin_city_matched: false,
      remote_probe_ok: false,
    }),
  );
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  await service.diagnose({
    actor: ACTOR,
    request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
  });

  const observation = recordedObservation(client);
  assertEquals(observation["verified"], false);
  assertEquals(observation["code"], "invalid_response");
  assertEquals(observation["cities"], []);
});

Deno.test("lets a later failure supersede an earlier success", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  let healthCalls = 0;
  const fake = createFakeFetch((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/health")) {
      healthCalls += 1;
      return healthCalls === 1
        ? healthResponse("OK")
        : jsonResponse({}, { status: 503 });
    }
    return countryResponse();
  });
  const credential = await createStoredCredentialDocument({
    keyring,
    environment: "sandbox",
  });

  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_read_credential", {
    data: credential,
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_record_provider_observation", {
    data: createObservationAcknowledgement(),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_read_readiness", {
    data: createReadinessDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });

  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_read_credential", {
    data: credential,
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_record_provider_observation", {
    data: createObservationAcknowledgement({
      origin_city_matched: false,
      remote_probe_ok: false,
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_read_readiness", {
    data: createReadinessDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });

  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });
  const request = {
    expectedRevision: STORED_REVISION,
    environment: "sandbox",
  } as const;

  await service.diagnose({ actor: ACTOR, request });
  await service.diagnose({ actor: ACTOR, request });

  const records = client.calls.filter(
    (entry) => entry.fn === "shipa_record_provider_observation",
  );
  assertEquals(records.length, 2);
  const first = records[0].args["_observation"] as Record<string, unknown>;
  const second = records[1].args["_observation"] as Record<string, unknown>;
  assertEquals(first["verified"], true);
  assertEquals(second["verified"], false);
  assertEquals(second["code"], "server_error");
});

// ---------------------------------------------------------------------------
// Refusal and failure
// ---------------------------------------------------------------------------

Deno.test("refuses a tainted diagnosis request before any call", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch(() => jsonResponse({}, { status: 500 }));
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  const tainted: readonly unknown[] = [
    {
      expectedRevision: STORED_REVISION,
      environment: "sandbox",
      observation: { verified: true },
    },
    { expectedRevision: STORED_REVISION, environment: "sandbox", proof: "x" },
    {
      expectedRevision: STORED_REVISION,
      environment: "sandbox",
      verified: true,
    },
    {
      expectedRevision: STORED_REVISION,
      environment: "sandbox",
      apiKey: "leaked",
    },
    { expectedRevision: STORED_REVISION, environment: "sandbox", actor: ACTOR },
    {
      expectedRevision: STORED_REVISION,
      environment: "sandbox",
      endpoint: "https://attacker.example",
    },
    { expectedRevision: STORED_REVISION, environment: "staging" },
    { expectedRevision: STORED_REVISION },
    { environment: "sandbox" },
    "not-an-object",
    null,
  ];

  for (const request of tainted) {
    const failure = await expectConfigurationFailure(() =>
      service.diagnose({ actor: ACTOR, request })
    );
    assertEquals(failure.code, "invalid_request");
  }

  assertEquals(client.calls.length, 0);
  assertEquals(fake.requests.length, 0);
});

Deno.test("refuses a stale revision before any remote call", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch(() => jsonResponse({}, { status: 200 }));
  client.respond("shipa_read_settings", {
    data: createSettingsDocument(),
    extra: FAKE_SDK_ENVELOPE,
  });
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  const failure = await expectConfigurationFailure(() =>
    service.diagnose({
      actor: ACTOR,
      request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
    })
  );

  assertEquals(failure.code, "conflict");
  assertEquals(client.calls.length, 1);
  assertEquals(fake.requests.length, 0);
});

Deno.test("fails before any remote call when the credential is missing", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch(() => jsonResponse({}, { status: 200 }));
  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_read_credential", {
    data: null,
    extra: FAKE_SDK_ENVELOPE,
  });
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  const failure = await expectConfigurationFailure(() =>
    service.diagnose({
      actor: ACTOR,
      request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
    })
  );

  assertEquals(failure.code, "credential_missing");
  assertEquals(fake.requests.length, 0);
});

Deno.test("fails when the observation write conflicts and never retries", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/health")) return healthResponse("OK");
    return countryResponse();
  });
  client.respond("shipa_read_settings", {
    data: createSettingsDocument({
      settings: createSettingsBlock({ revision: STORED_REVISION }),
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_read_credential", {
    data: await createStoredCredentialDocument({
      keyring,
      environment: "sandbox",
    }),
    extra: FAKE_SDK_ENVELOPE,
  });
  client.respond("shipa_record_provider_observation", {
    error: createSqlError("40001", "settings_conflict"),
    extra: FAKE_SDK_ENVELOPE,
  });
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  const failure = await expectConfigurationFailure(() =>
    service.diagnose({
      actor: ACTOR,
      request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
    })
  );

  assertEquals(failure.code, "conflict");
  const records = client.calls.filter(
    (entry) => entry.fn === "shipa_record_provider_observation",
  );
  assertEquals(records.length, 1);
  // The projection is never read after a refused write.
  assertEquals(
    client.calledFunctions().includes("shipa_read_readiness"),
    false,
  );
});

Deno.test("refuses an acknowledgment that does not describe the probe", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/health")) return healthResponse("OK");
    return countryResponse();
  });
  queueDiagnosis(
    client,
    await createStoredCredentialDocument({ keyring, environment: "sandbox" }),
    createObservationAcknowledgement({ remote_probe_ok: false }),
  );
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  const failure = await expectConfigurationFailure(() =>
    service.diagnose({
      actor: ACTOR,
      request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
    })
  );

  assertEquals(failure.code, "invalid_response");
});

Deno.test("refuses an unrecorded observation", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/health")) return healthResponse("OK");
    return countryResponse();
  });
  queueDiagnosis(
    client,
    await createStoredCredentialDocument({ keyring, environment: "sandbox" }),
    createObservationAcknowledgement({ recorded: false }),
  );
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  const failure = await expectConfigurationFailure(() =>
    service.diagnose({
      actor: ACTOR,
      request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
    })
  );

  assertEquals(failure.code, "invalid_response");
});

Deno.test("returns the honest projection after a concurrent revision", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/health")) return healthResponse("OK");
    return countryResponse();
  });
  queueDiagnosis(
    client,
    await createStoredCredentialDocument({ keyring, environment: "sandbox" }),
    createObservationAcknowledgement(),
    createReadinessDocument({
      settings_revision: STORED_REVISION + 1,
      environments: {
        sandbox: createEnvironmentReadiness({
          probe_current: false,
          credentials_verified: false,
          origin_city_matched: false,
          safe_code: "verification_stale",
        }),
        live: createMissingEnvironmentReadiness(),
      },
    }),
  );
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  const projection = await service.diagnose({
    actor: ACTOR,
    request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
  });

  // The projection is never forced to be true.
  assertEquals(projection.settingsRevision, STORED_REVISION + 1);
  assertEquals(projection.environments.sandbox.credentialsVerified, false);
  assertEquals(projection.environments.sandbox.probeCurrent, false);
  assertEquals(projection.environments.sandbox.safeCode, "verification_stale");
});

Deno.test("never leaks the loaded key into the projection", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const fake = createFakeFetch((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/health")) return healthResponse("OK");
    return countryResponse();
  });
  queueDiagnosis(
    client,
    await createStoredCredentialDocument({ keyring, environment: "sandbox" }),
  );
  const service = createShipaReadinessService({
    client,
    keyring,
    fetchImpl: fake.fetch,
  });

  const projection = await service.diagnose({
    actor: ACTOR,
    request: { expectedRevision: STORED_REVISION, environment: "sandbox" },
  });

  const serialised = JSON.stringify(projection);
  assertEquals(serialised.includes(SHIPA_TEST_API_CREDENTIAL), false);
  assertEquals(serialised.includes(SHIPA_TEST_FINGERPRINT), false);
  assertEquals(serialised.includes("ciphertext"), false);
  assertEquals(serialised.includes("nonce"), false);
});

Deno.test("never treats a credential save request as a diagnosis request", async () => {
  const client = createFakeShipaSdkClient();
  const { keyring } = await createSyntheticKeyring();
  const service = createShipaReadinessService({ client, keyring });

  const failure = await expectConfigurationFailure(() =>
    service.diagnose({
      actor: ACTOR,
      request: createCredentialSaveRequest(),
    })
  );

  assertEquals(failure.code, "invalid_request");
  assertEquals(client.calls.length, 0);
});
