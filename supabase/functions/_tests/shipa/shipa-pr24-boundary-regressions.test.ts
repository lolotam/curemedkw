// PR24 boundary regressions: real production modules; only the SDK is faked.
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { readShipaAdminJsonBody } from "../../_shared/shipa-admin-actions.ts";
import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
} from "../../_shared/integration-credentials.ts";
import { IntegrationCredentialError } from "../../_shared/integration-credential-contract.ts";
import { parseShipaOrderDetail } from "../../_shared/shipa-responses.ts";
import { createShipaSubmissionStore } from "../../_shared/shipa-submission-store.ts";
import { ShipaSubmissionError } from "../../_shared/shipa-submission-contract.ts";
import {
  createFakeShipaSubmissionRpcClient,
  SHIPA_TEST_INTEGRATION_ID,
  SHIPA_TEST_SHIPMENT_ID,
} from "./shipa-submission-fixtures.ts";
import { createSyntheticKeyring } from "./shipa-credential-loader-fixtures.ts";
import { mapShipaShipmentFailure } from "../../_shared/shipa-shipment-actions.ts";
import { ShipaCredentialLoaderError } from "../../_shared/shipa-credential-loader.ts";
import {
  createManualHarness,
  queueManualCreateSuccess,
} from "./shipa-manual-fixtures.ts";
import {
  createTestManualRequest,
  SHIPA_TEST_REVIEW_ACTOR_ID,
  SHIPA_TEST_REVIEW_ORDER_ID,
} from "./shipa-review-fixtures.ts";
import { parseShipaReviewManualRequest } from "../../_shared/shipa-review-validation.ts";

Deno.test("malformed UTF-8 is refused rather than silently repairing a saved value", async () => {
  const bytes = new Uint8Array([123, 34, 118, 34, 58, 34, 0xff, 34, 125]);
  const request = new Request("https://fixture.invalid", {
    method: "POST",
    body: bytes,
  });
  assertEquals(await readShipaAdminJsonBody(request), {
    ok: false,
    status: 400,
  });
});

Deno.test("unpaired surrogates cannot silently change an encrypted credential", async () => {
  const { keyring } = await createSyntheticKeyring();
  const context = {
    integrationId: SHIPA_TEST_INTEGRATION_ID,
    provider: "shipa" as const,
    environment: "sandbox" as const,
    keyVersion: 1,
  };
  for (const plaintext of ["key-\ud800", "key-\udc00"]) {
    const error = await assertRejects(
      () => encryptIntegrationCredential(plaintext, context, keyring),
      IntegrationCredentialError,
    );
    assertEquals(error.code, "invalid_plaintext");
  }
  // A real supplementary character and a literal replacement character remain valid.
  const plaintext = "synthetic-\u{1F512}-\ufffd";
  const envelope = await encryptIntegrationCredential(
    plaintext,
    context,
    keyring,
  );
  assertEquals(
    await decryptIntegrationCredential(envelope, context, keyring),
    plaintext,
  );
});

Deno.test("absent order parties stay null while malformed parties are refused", () => {
  for (const fields of [{}, { origin: null, destination: null }]) {
    const parsed = parseShipaOrderDetail({
      shipaRef: "synthetic-reference",
      ...fields,
    });
    assertEquals(parsed.ok, true);
    if (parsed.ok) {
      assertEquals(parsed.value.origin, null);
      assertEquals(parsed.value.destination, null);
    }
  }
  for (const origin of [[], "invalid", { contactName: [] }]) {
    assertEquals(
      parseShipaOrderDetail({ shipaRef: "synthetic-reference", origin }).ok,
      false,
    );
  }
});

Deno.test("deferred SDK transport rejections remain unavailable rather than malformed success", async () => {
  const client = createFakeShipaSubmissionRpcClient();
  const deferred = client.queueDeferred();
  const store = createShipaSubmissionStore({ client });
  const operation = store.prepare({
    shipmentId: SHIPA_TEST_SHIPMENT_ID,
    integrationId: SHIPA_TEST_INTEGRATION_ID,
    environment: "sandbox",
  });
  await deferred.called;
  deferred.resolve({ rejection: new Error("synthetic transport loss") });
  const error = await assertRejects(() => operation, ShipaSubmissionError);
  assertEquals(error.code, "unavailable");
  assertEquals(client.calls.length, 1);
});

Deno.test("an absent shipment credential is a configuration refusal rather than a transient outage", () => {
  const failure = mapShipaShipmentFailure(
    new ShipaCredentialLoaderError("credential_missing"),
  );
  assertEquals(failure.code, "not_eligible");
  assertEquals(failure.status, 409);
});

Deno.test("a validated uppercase order identity matches the committed canonical intent", async () => {
  const harness = await createManualHarness();
  await queueManualCreateSuccess(harness.client, harness.keyring);
  const request = parseShipaReviewManualRequest(createTestManualRequest());
  if (!request.ok) throw new Error("invalid synthetic manual request");
  const result = await harness.service.create({
    actor: { userId: SHIPA_TEST_REVIEW_ACTOR_ID },
    orderId: SHIPA_TEST_REVIEW_ORDER_ID.toUpperCase(),
    request: request.value,
  });
  assertEquals(result.shipment.orderId, SHIPA_TEST_REVIEW_ORDER_ID);
  assertEquals(result.dispatch.status, "created");
  assertEquals(harness.provider.requests.length, 1);
});
