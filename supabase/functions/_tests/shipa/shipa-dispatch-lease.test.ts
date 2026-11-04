// The real dispatcher, crypto, store and provider adapter execute. Only RPC,
// HTTP and the server clock are synthetic. No native provider call is made.
import { assertEquals } from "jsr:@std/assert@1.0.19";
import { createShipaDispatcher } from "../../_shared/shipa-dispatch.ts";
import {
  createFakeShipaSubmissionRpcClient,
  createSyntheticKeyring,
  createTestPreparationDocument,
} from "./shipa-submission-fixtures.ts";
import {
  createAcceptedProviderFetch,
  createBeginResponder,
  createSummaryResponder,
  queueCredentialDocument,
  SHIPA_TEST_DISPATCH_INPUT,
} from "./shipa-dispatch-fixtures.ts";

const STARTED_AT = Date.parse("2026-11-04T00:12:12.967Z");

Deno.test("a late valid begin answer never starts HTTP after the lease has expired", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  let currentTime = STARTED_AT;
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  const begin = client.queueDeferred();
  client.queueResponder(createSummaryResponder());
  const dispatcher = createShipaDispatcher({
    client,
    keyring,
    fetchImpl: provider.fetch,
    now: () => currentTime,
  });
  const running = dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT);
  await begin.called;
  assertEquals(provider.requests.length, 0);
  currentTime += 46_000;
  begin.resolve(createBeginResponder());
  const result = await running;
  assertEquals(result, { status: "uncertain", code: "begin_lease_unusable" });
  assertEquals(provider.requests.length, 0);
  assertEquals(client.calls.map((call) => call.fn), [
    "shipa_read_credential",
    "shipa_prepare_submission",
    "shipa_begin_submission",
  ]);
});

Deno.test("insufficient remaining lease never authorizes HTTP or a local-rejection completion", async () => {
  for (const remaining of [-1, 0, 14_999]) {
    const client = createFakeShipaSubmissionRpcClient();
    const { keyring } = await createSyntheticKeyring();
    const provider = createAcceptedProviderFetch();
    await queueCredentialDocument(client, keyring);
    client.queue({ data: createTestPreparationDocument() });
    client.queueResponder(
      createBeginResponder({ leaseExpiresAt: new Date(STARTED_AT + remaining).toISOString() }),
    );
    client.queueResponder(createSummaryResponder());
    const dispatcher = createShipaDispatcher({
      client,
      keyring,
      fetchImpl: provider.fetch,
      now: () => STARTED_AT,
    });
    assertEquals(await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT), {
      status: "uncertain",
      code: "begin_lease_unusable",
    });
    assertEquals(provider.requests.length, 0);
    assertEquals(client.calls.length, 3);
  }
});

Deno.test("a current matching lease permits exactly one provider request and completion", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const { keyring } = await createSyntheticKeyring();
  const provider = createAcceptedProviderFetch();
  await queueCredentialDocument(client, keyring);
  client.queue({ data: createTestPreparationDocument() });
  client.queueResponder(
    createBeginResponder({ leaseExpiresAt: new Date(STARTED_AT + 15_000).toISOString() }),
  );
  client.queueResponder(createSummaryResponder());
  const dispatcher = createShipaDispatcher({
    client,
    keyring,
    fetchImpl: provider.fetch,
    now: () => STARTED_AT,
  });
  assertEquals((await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT)).status, "created");
  assertEquals(provider.requests.length, 1);
  assertEquals(client.calls.map((call) => call.fn), [
    "shipa_read_credential",
    "shipa_prepare_submission",
    "shipa_begin_submission",
    "shipa_complete",
  ]);
});

Deno.test("an unusable server clock never authorizes HTTP after the marker", async () => {
  for (
    const now of [() => Number.NaN, () => Infinity, () => {
      throw new Error("clock unavailable");
    }]
  ) {
    const client = createFakeShipaSubmissionRpcClient();
    const { keyring } = await createSyntheticKeyring();
    const provider = createAcceptedProviderFetch();
    await queueCredentialDocument(client, keyring);
    client.queue({ data: createTestPreparationDocument() });
    client.queueResponder(createBeginResponder());
    const dispatcher = createShipaDispatcher({ client, keyring, fetchImpl: provider.fetch, now });
    assertEquals(await dispatcher.processShipment(SHIPA_TEST_DISPATCH_INPUT), {
      status: "uncertain",
      code: "begin_lease_unusable",
    });
    assertEquals(provider.requests.length, 0);
    assertEquals(client.calls.length, 3);
  }
});
