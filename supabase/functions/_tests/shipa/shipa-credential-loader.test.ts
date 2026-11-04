// Behavioural tests for the read-only Shipa credential loader.
//
// The real loader, the real strict parsers and the real Web Crypto
// implementation do the work here. Only the database boundary is faked.
//
// Every key is generated freshly for the test that uses it and every
// credential is synthetic: no real provider key, master key or account value
// appears below.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";

import {
  decodeCanonicalBase64,
  encodeCanonicalBase64,
} from "../../_shared/integration-credential-contract.ts";
import {
  createShipaCredentialLoader,
  SHIPA_CREDENTIAL_LOADER_ERROR_MESSAGES,
  type ShipaCredentialBinding,
  ShipaCredentialLoaderError,
  type ShipaCredentialLoaderErrorCode,
} from "../../_shared/shipa-credential-loader.ts";
import {
  createFakeShipaCredentialRpcClient,
  createStoredCredentialDocument,
  createSyntheticKeyring,
  createUndecryptableEnvelope,
  SHIPA_TEST_API_CREDENTIAL,
  SHIPA_TEST_FINGERPRINT,
  SHIPA_TEST_INTEGRATION_ID,
  SHIPA_TEST_OTHER_INTEGRATION_ID,
  SHIPA_TEST_ROTATED_AT,
} from "./shipa-credential-loader-fixtures.ts";

const BINDING: ShipaCredentialBinding = {
  integrationId: SHIPA_TEST_INTEGRATION_ID,
  environment: "sandbox",
};

async function expectLoaderError(
  code: ShipaCredentialLoaderErrorCode,
  action: () => Promise<unknown>,
): Promise<ShipaCredentialLoaderError> {
  const error = await assertRejects(action, ShipaCredentialLoaderError);
  assertEquals(error.code, code);
  assertEquals(error.message, SHIPA_CREDENTIAL_LOADER_ERROR_MESSAGES[code]);
  return error;
}

Deno.test("reports an absent credential honestly and never invents a secret", async () => {
  const client = createFakeShipaCredentialRpcClient();
  client.queue({ data: null });
  client.queue({ data: null });
  const { keyring } = await createSyntheticKeyring();
  const loader = createShipaCredentialLoader({ client, keyring });

  const metadata = await loader.readMetadata(BINDING);
  assertEquals(metadata, {
    present: false,
    credentialRevision: null,
    credentialFingerprint: null,
  });

  await expectLoaderError(
    "credential_missing",
    () => loader.readSecret(BINDING),
  );

  // Two reads, two calls, and never another function.
  assertEquals(client.calls.length, 2);
  for (const call of client.calls) {
    assertEquals(call.fn, "shipa_read_credential");
  }
});

Deno.test("reports the metadata of a stored credential without decrypting it", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });
  client.queue({ data: document });

  const loader = createShipaCredentialLoader({ client, keyring });
  const metadata = await loader.readMetadata(BINDING);

  assertEquals(metadata.present, true);
  assertEquals(metadata.credentialRevision, 3);
  assertEquals(metadata.credentialFingerprint, SHIPA_TEST_FINGERPRINT);
  assertEquals(Object.keys(metadata).sort(), [
    "credentialFingerprint",
    "credentialRevision",
    "present",
  ]);

  // The metadata carries no key, no ciphertext and no nonce.
  const envelope = document["envelope"] as Record<string, unknown>;
  const serialized = JSON.stringify(metadata);
  assertEquals(serialized.includes(SHIPA_TEST_API_CREDENTIAL), false);
  assertEquals(serialized.includes(String(envelope["ciphertext"])), false);
  assertEquals(serialized.includes(String(envelope["nonce"])), false);
});

Deno.test("decrypts a stored credential with the real crypto implementation", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });
  client.queue({ data: document });

  const loader = createShipaCredentialLoader({ client, keyring });
  const secret = await loader.readSecret(BINDING);

  assertEquals(secret.apiKey, SHIPA_TEST_API_CREDENTIAL);
  assertEquals(secret.credentialRevision, 3);
  assertEquals(secret.credentialFingerprint, SHIPA_TEST_FINGERPRINT);
});

Deno.test("makes exactly one credential read and never falls back", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  client.queue({ data: null });
  const loader = createShipaCredentialLoader({ client, keyring });

  await loader.readMetadata(BINDING);

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0].fn, "shipa_read_credential");
  assertEquals(client.calls[0].args, {
    _integration_id: SHIPA_TEST_INTEGRATION_ID,
    _environment: "sandbox",
  });
});

Deno.test("does not retry a failed credential read", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  client.queue({ error: { code: "42501", message: "permission denied" } });
  const loader = createShipaCredentialLoader({ client, keyring });

  await expectLoaderError("unavailable", () => loader.readSecret(BINDING));

  assertEquals(client.calls.length, 1);
});

Deno.test("accepts the actual SDK envelope shape with status, count and statusText", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });
  client.queue({
    data: document,
    extra: { status: 200, statusText: "OK", count: 1 },
  });

  const loader = createShipaCredentialLoader({ client, keyring });
  const metadata = await loader.readMetadata(BINDING);
  assertEquals(metadata.present, true);

  const second = createFakeShipaCredentialRpcClient();
  second.queue({
    data: document,
    extra: { status: 206, statusText: "Partial Content", count: null },
  });
  const other = createShipaCredentialLoader({ client: second, keyring });
  assertEquals((await other.readMetadata(BINDING)).present, true);
});

Deno.test("refuses a stored credential that belongs to another integration", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({
    keyring,
    integrationId: SHIPA_TEST_OTHER_INTEGRATION_ID,
  });
  client.queue({ data: document });
  client.queue({ data: document });

  const loader = createShipaCredentialLoader({ client, keyring });

  // The metadata must not report another integration's credential as present.
  await expectLoaderError(
    "context_mismatch",
    () => loader.readMetadata(BINDING),
  );
  await expectLoaderError("context_mismatch", () => loader.readSecret(BINDING));
});

Deno.test("refuses a stored credential that belongs to another environment", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({
    keyring,
    environment: "live",
  });
  client.queue({ data: document });
  client.queue({ data: document });

  const loader = createShipaCredentialLoader({ client, keyring });
  await expectLoaderError(
    "context_mismatch",
    () => loader.readMetadata(BINDING),
  );
  await expectLoaderError("context_mismatch", () => loader.readSecret(BINDING));
});

Deno.test("refuses a stored credential of another provider", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });
  const envelope = document["envelope"] as Record<string, unknown>;
  client.queue({
    data: { ...document, envelope: { ...envelope, provider: "other" } },
  });

  const loader = createShipaCredentialLoader({ client, keyring });
  await expectLoaderError(
    "invalid_response",
    () => loader.readMetadata(BINDING),
  );
});

Deno.test("reports metadata with a retired key but refuses secret reads without fallback", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring(1);
  const other = await createSyntheticKeyring(2);
  const document = await createStoredCredentialDocument({
    keyring: other.keyring,
    keyVersion: 2,
  });
  client.queue({ data: document });
  client.queue({ data: document });

  const loader = createShipaCredentialLoader({ client, keyring });
  assertEquals(await loader.readMetadata(BINDING), {
    present: true,
    credentialRevision: 3,
    credentialFingerprint: SHIPA_TEST_FINGERPRINT,
  });
  await expectLoaderError(
    "unknown_key_version",
    () => loader.readSecret(BINDING),
  );
});

Deno.test("fails closed on a tampered ciphertext", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });
  const envelope = document["envelope"] as Record<string, unknown>;

  const bytes = decodeCanonicalBase64(String(envelope["ciphertext"]));
  assert(bytes !== null);
  const tampered = Uint8Array.from(bytes);
  tampered[0] = tampered[0] ^ 0x01;

  client.queue({
    data: {
      ...document,
      envelope: {
        ...envelope,
        ciphertext: encodeCanonicalBase64(tampered),
      },
    },
  });

  const loader = createShipaCredentialLoader({ client, keyring });
  await expectLoaderError(
    "decryption_failed",
    () => loader.readSecret(BINDING),
  );
});

Deno.test("does not need a successful decryption to report the metadata", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  client.queue({
    data: {
      envelope: createUndecryptableEnvelope(),
      credential_revision: 3,
      rotated_at: SHIPA_TEST_ROTATED_AT,
      credential_fingerprint: SHIPA_TEST_FINGERPRINT,
    },
  });

  const loader = createShipaCredentialLoader({ client, keyring });
  const metadata = await loader.readMetadata(BINDING);
  assertEquals(metadata.present, true);
  assertEquals(metadata.credentialRevision, 3);
  assertEquals(metadata.credentialFingerprint, SHIPA_TEST_FINGERPRINT);
});

Deno.test("refuses a document with an unknown root field", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });
  client.queue({ data: { ...document, unexpected_field: "value" } });

  const loader = createShipaCredentialLoader({ client, keyring });
  await expectLoaderError(
    "invalid_response",
    () => loader.readMetadata(BINDING),
  );
});

Deno.test("refuses a document that is a bare envelope instead of the root document", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });
  client.queue({ data: document["envelope"] });

  const loader = createShipaCredentialLoader({ client, keyring });
  await expectLoaderError(
    "invalid_response",
    () => loader.readMetadata(BINDING),
  );
});

Deno.test("refuses a document with an unknown envelope field", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });
  const envelope = document["envelope"] as Record<string, unknown>;
  client.queue({
    data: {
      ...document,
      envelope: { ...envelope, credential_revision: 3 },
    },
  });

  const loader = createShipaCredentialLoader({ client, keyring });
  await expectLoaderError(
    "invalid_response",
    () => loader.readMetadata(BINDING),
  );
});

Deno.test("refuses an unusable credential revision", async () => {
  const revisions: readonly unknown[] = [
    0,
    -1,
    1.5,
    2147483648,
    "3",
    null,
  ];

  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });

  const clients = revisions.map(() => createFakeShipaCredentialRpcClient());
  clients.forEach((client, index) => {
    client.queue({
      data: { ...document, credential_revision: revisions[index] },
    });
  });

  const loaders = clients.map((client) =>
    createShipaCredentialLoader({ client, keyring })
  );
  const results = await Promise.all(
    loaders.map((loader) =>
      expectLoaderError("invalid_response", () => loader.readMetadata(BINDING))
    ),
  );
  assertEquals(results.length, revisions.length);
});

Deno.test("refuses an unusable credential fingerprint", async () => {
  const fingerprints: readonly unknown[] = [
    "A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90",
    "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9",
    "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f900",
    "z1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    42,
    null,
  ];

  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });

  const clients = fingerprints.map(() => createFakeShipaCredentialRpcClient());
  clients.forEach((client, index) => {
    client.queue({
      data: { ...document, credential_fingerprint: fingerprints[index] },
    });
  });

  const loaders = clients.map((client) =>
    createShipaCredentialLoader({ client, keyring })
  );
  const results = await Promise.all(
    loaders.map((loader) =>
      expectLoaderError("invalid_response", () => loader.readMetadata(BINDING))
    ),
  );
  assertEquals(results.length, fingerprints.length);
});

Deno.test("refuses an unusable rotation timestamp", async () => {
  const timestamps: readonly unknown[] = [
    "",
    "not a timestamp",
    "2026-11-03",
    "2026-11-03T22:41:55.105Z and more text than a timestamp can hold",
  ];

  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });

  const clients = timestamps.map(() => createFakeShipaCredentialRpcClient());
  clients.forEach((client, index) => {
    client.queue({ data: { ...document, rotated_at: timestamps[index] } });
  });

  const loaders = clients.map((client) =>
    createShipaCredentialLoader({ client, keyring })
  );
  const results = await Promise.all(
    loaders.map((loader) =>
      expectLoaderError("invalid_response", () => loader.readMetadata(BINDING))
    ),
  );
  assertEquals(results.length, timestamps.length);
});

Deno.test("refuses a malformed envelope", async () => {
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });
  const envelope = document["envelope"] as Record<string, unknown>;

  const broken: readonly Record<string, unknown>[] = [
    { ...envelope, nonce: "not base64 at all" },
    { ...envelope, nonce: encodeCanonicalBase64(new Uint8Array(11)) },
    { ...envelope, ciphertext: encodeCanonicalBase64(new Uint8Array(8)) },
    { ...envelope, key_version: 0 },
    { ...envelope, integration_id: "not-a-uuid" },
  ];

  const clients = broken.map(() => createFakeShipaCredentialRpcClient());
  clients.forEach((client, index) => {
    client.queue({ data: { ...document, envelope: broken[index] } });
  });

  const loaders = clients.map((client) =>
    createShipaCredentialLoader({ client, keyring })
  );
  const results = await Promise.all(
    loaders.map((loader) =>
      expectLoaderError("invalid_response", () => loader.readMetadata(BINDING))
    ),
  );
  assertEquals(results.length, broken.length);
});

Deno.test("maps a missing SQL wrapper to upgrade required", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  client.queue({
    error: {
      code: "PGRST202",
      message: "function public.shipa_read_credential does not exist",
      details: "upstream-detail-marker",
      hint: "upstream-hint-marker",
    },
  });

  const loader = createShipaCredentialLoader({ client, keyring });
  const error = await expectLoaderError(
    "upgrade_required",
    () => loader.readSecret(BINDING),
  );
  assertEquals(error.message.includes("upstream-detail-marker"), false);
  assertEquals(error.message.includes("upstream-hint-marker"), false);
  assertEquals(error.message.includes("does not exist"), false);
  assertEquals("cause" in error, false);
});

Deno.test("maps an unknown SQL failure to unavailable", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  client.queue({
    error: { code: "42501", message: "permission denied" },
  });

  const loader = createShipaCredentialLoader({ client, keyring });
  await expectLoaderError("unavailable", () => loader.readSecret(BINDING));
  assertEquals(client.calls.length, 1);
});

Deno.test("maps a rejected database call to unavailable", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  client.queue({ rejection: new Error("transport failure") });

  const loader = createShipaCredentialLoader({ client, keyring });
  await expectLoaderError("unavailable", () => loader.readSecret(BINDING));
  assertEquals(client.calls.length, 1);
});

Deno.test("never repeats the secret, the ciphertext or the upstream detail in a failure", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const document = await createStoredCredentialDocument({ keyring });
  const envelope = document["envelope"] as Record<string, unknown>;
  client.queue({
    error: {
      code: "PGRST202",
      message: `failure that quotes ${SHIPA_TEST_API_CREDENTIAL}`,
      details: "upstream-detail-marker",
    },
  });

  const loader = createShipaCredentialLoader({ client, keyring });
  const error = await expectLoaderError(
    "upgrade_required",
    () => loader.readSecret(BINDING),
  );
  assertEquals(error.message.includes(SHIPA_TEST_API_CREDENTIAL), false);
  assertEquals(error.message.includes(String(envelope["ciphertext"])), false);
  assertEquals(error.message.includes(String(envelope["nonce"])), false);
  assertEquals(error.message.includes("upstream-detail-marker"), false);
  assertEquals("cause" in error, false);
});

Deno.test("validates the server binding before it calls the database", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const loader = createShipaCredentialLoader({ client, keyring });

  await expectLoaderError(
    "invalid_binding",
    () =>
      loader.readMetadata({
        integrationId: "not-a-uuid",
        environment: "sandbox",
      }),
  );
  await expectLoaderError("invalid_binding", () =>
    loader.readMetadata({
      integrationId: SHIPA_TEST_INTEGRATION_ID,
      environment: "staging" as unknown as "sandbox",
    }));
  await expectLoaderError(
    "invalid_binding",
    () => loader.readSecret({ integrationId: "", environment: "sandbox" }),
  );

  // An invalid binding never reaches the database.
  assertEquals(client.calls.length, 0);
});

Deno.test("passes the SQL fingerprint through without recomputing it", async () => {
  const client = createFakeShipaCredentialRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const fingerprint = "0123456789abcdef".repeat(4);
  const document = await createStoredCredentialDocument({
    keyring,
    credentialFingerprint: fingerprint,
  });
  client.queue({ data: document });

  const loader = createShipaCredentialLoader({ client, keyring });
  const metadata = await loader.readMetadata(BINDING);
  assertEquals(metadata.credentialFingerprint, fingerprint);
});
