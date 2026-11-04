// Synthetic fixtures for the Shipa one-shipment execution tests.
//
// Everything in this file is fabricated. The shipment and integration ids are
// made-up UUIDs, the credential is an invented string and the master key
// material is generated freshly for every test. No real provider key, master
// key, customer address or personal data exists anywhere below.
//
// Only two boundaries are faked: the database client and the provider fetch.
// The credential loader, the submission store, the strict parsers, the real
// adapter builder, the real HTTP client and the native crypto are the
// production modules.

import type { IntegrationCredentialKeyring } from "../../_shared/integration-credentials.ts";
import type { ShipaDispatchInput } from "../../_shared/shipa-dispatch.ts";
import {
  createAcceptedFixture,
  createFakeFetch,
  type FakeFetch,
  jsonResponse,
} from "./shipa-fixtures.ts";
import {
  createStoredCredentialDocument,
  createTestBeginDocument,
  createTestSafeSummaryDocument,
  type FakeRpcResponder,
  type FakeShipaSubmissionRpcClient,
  SHIPA_TEST_CREDENTIAL_FINGERPRINT,
  SHIPA_TEST_CREDENTIAL_REVISION,
  SHIPA_TEST_INTEGRATION_ID,
  SHIPA_TEST_SHIPMENT_ID,
  SHIPA_TEST_STALE_CREDENTIAL_FINGERPRINT,
  SHIPA_TEST_STALE_CREDENTIAL_REVISION,
  type TestBeginOptions,
  type TestSummaryOptions,
} from "./shipa-submission-fixtures.ts";

export { createAcceptedFixture, createFakeFetch, jsonResponse };
export type { FakeFetch };

/** The server-owned binding of one sandbox shipment. */
export const SHIPA_TEST_DISPATCH_INPUT: ShipaDispatchInput = {
  shipmentId: SHIPA_TEST_SHIPMENT_ID,
  integrationId: SHIPA_TEST_INTEGRATION_ID,
  environment: "sandbox",
};

/** The same shipment in the live environment. */
export const SHIPA_TEST_LIVE_DISPATCH_INPUT: ShipaDispatchInput = {
  shipmentId: SHIPA_TEST_SHIPMENT_ID,
  integrationId: SHIPA_TEST_INTEGRATION_ID,
  environment: "live",
};

/** The options of a synthetic stored credential. */
export interface DispatchCredentialOptions {
  readonly credentialRevision?: number;
  readonly credentialFingerprint?: string;
  readonly environment?: "sandbox" | "live";
  readonly integrationId?: string;
}

/**
 * Queues the stored credential document the loader reads.
 *
 * The document is encrypted with the real key material, so the loader really
 * decrypts it.
 */
export async function queueCredentialDocument(
  client: FakeShipaSubmissionRpcClient,
  keyring: IntegrationCredentialKeyring,
  options: DispatchCredentialOptions = {},
): Promise<void> {
  const document = await createStoredCredentialDocument({
    keyring,
    integrationId: options.integrationId ?? SHIPA_TEST_INTEGRATION_ID,
    environment: options.environment ?? "sandbox",
    credentialRevision: options.credentialRevision ??
      SHIPA_TEST_CREDENTIAL_REVISION,
    credentialFingerprint: options.credentialFingerprint ??
      SHIPA_TEST_CREDENTIAL_FINGERPRINT,
  });
  client.queue({ data: document });
}

/** Queues an absent credential. */
export function queueMissingCredential(
  client: FakeShipaSubmissionRpcClient,
): void {
  client.queue({ data: null });
}

/** The options of a synthetic begin answer. */
export type DispatchBeginOptions = TestBeginOptions;

/**
 * Builds the responder that answers the begin call.
 *
 * The responder reads the attempt token from the call, so the answer always
 * carries the token the execution core generated for that attempt.
 */
export function createBeginResponder(
  options: DispatchBeginOptions = {},
): FakeRpcResponder {
  return (_fn, args) => {
    const attemptId = options.attemptToken ?? String(args["_attempt_token"]);
    return {
      data: createTestBeginDocument({ ...options, attemptToken: attemptId }),
    };
  };
}

/**
 * Builds the responder that answers the completion call.
 *
 * It answers with the safe summary of the given state.
 */
export function createSummaryResponder(
  options: TestSummaryOptions = {},
): FakeRpcResponder {
  return () => ({ data: createTestSafeSummaryDocument(options) });
}

/** A provider fetch that accepts the order. */
export function createAcceptedProviderFetch(): FakeFetch {
  return createFakeFetch(() => jsonResponse(createAcceptedFixture()));
}

/** A provider fetch that answers with one status and no usable body. */
export function createFailingProviderFetch(status: number): FakeFetch {
  return createFakeFetch(() =>
    jsonResponse({ message: "synthetic failure" }, {
      status,
    })
  );
}

/** A provider fetch that answers with a success that has no reference. */
export function createReferenceLessProviderFetch(): FakeFetch {
  return createFakeFetch(() => jsonResponse({ orderStatus: "Created" }));
}

/**
 * A provider fetch whose transport fails.
 *
 * It models a connection that breaks before any answer, which the adapter
 * reports as an uncertain outcome.
 */
export function createBrokenTransportProviderFetch(): FakeFetch {
  return createFakeFetch(() => {
    throw new Error("synthetic transport failure");
  });
}

/** The stale credential tuple a rotated credential would carry. */
export const SHIPA_TEST_STALE_CREDENTIAL = {
  credentialRevision: SHIPA_TEST_STALE_CREDENTIAL_REVISION,
  credentialFingerprint: SHIPA_TEST_STALE_CREDENTIAL_FINGERPRINT,
};
