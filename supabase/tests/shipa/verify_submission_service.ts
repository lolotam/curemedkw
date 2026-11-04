// Real SDK/core/crypto/SQL. Provider transport is synthetic; no native booking.
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { createClient } from "npm:@supabase/supabase-js@2.105.1";
import { createShipaRuntimeClient } from "../../functions/_shared/shipa-runtime.ts";
import { createShipaReviewStore } from "../../functions/_shared/shipa-review-store.ts";
import { ShipaReviewError } from "../../functions/_shared/shipa-review-contract.ts";
import { createShipaCredentialService } from "../../functions/_shared/shipa-credential-service.ts";
import {
  createShipaDispatcher,
  type ShipaDispatchInput,
} from "../../functions/_shared/shipa-dispatch.ts";
import { createSyntheticMasterKey } from "../../functions/_tests/shipa/shipa-admin-fixtures.ts";
import { createEnvironmentConfig } from "../../functions/_tests/shipa/shipa-settings-fixtures.ts";
import {
  isIntegrationUuid,
  isPlainRecord,
} from "../../functions/_shared/integration-credential-contract.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const input = Deno.stdin.readable.getReader();
let buffered = "";
async function bridge(
  request: unknown,
): Promise<{ data: unknown; error: unknown; status: number }> {
  await Deno.stdout.write(encoder.encode(JSON.stringify(request) + "\n"));
  while (!buffered.includes("\n")) {
    const chunk = await input.read();
    if (chunk.done) throw new Error("Submission bridge ended early");
    buffered += decoder.decode(chunk.value, { stream: true });
  }
  const end = buffered.indexOf("\n");
  const response = JSON.parse(buffered.slice(0, end));
  buffered = buffered.slice(end + 1);
  return response;
}
const bindings: Record<string, ShipaDispatchInput> = {};
const calls: { fn: string; shipment: unknown }[] = [];
let loseManualReviewResponse = false;
const sdk = createClient("https://guarded-sql.test", "synthetic-sdk-key", {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: async (value, init) => {
      const request = new Request(value, init);
      const url = new URL(request.url);
      assertEquals(url.origin, "https://guarded-sql.test");
      assertEquals(request.method, "POST");
      assertEquals(url.pathname.startsWith("/rest/v1/rpc/shipa_"), true);
      const fn = url.pathname.split("/").at(-1);
      const args = await request.json();
      calls.push({ fn: String(fn), shipment: args._shipment_id });
      const response = await bridge({ kind: "rpc", fn, args });
      if (fn === "shipa_request_manual" && loseManualReviewResponse) {
        loseManualReviewResponse = false;
        throw new Error("Synthetic committed-review response loss");
      }
      // Actual SQL committed before these injected response losses. There is no
      // fake ledger and no model of SQL marker/eligibility behavior here.
      if (
        (fn === "shipa_begin_submission" &&
          args._shipment_id === bindings.lost_begin?.shipmentId) ||
        (fn === "shipa_complete" &&
          args._shipment_id === bindings.lost_complete?.shipmentId)
      ) {
        throw new Error("Synthetic committed-response loss");
      }
      return Response.json(response.error ?? response.data, {
        status: response.status,
      });
    },
  },
});
const client = createShipaRuntimeClient(sdk);
const master = await createSyntheticMasterKey();
const credential = "synthetic-provider-credential";
const config = {
  ...createEnvironmentConfig(),
  serviceCode: "Next Day",
  pickupInstructions: "",
};
const credentials = createShipaCredentialService({
  client,
  keyring: master.keyring,
  currentKeyVersion: 1,
});
await credentials.save({
  actor: { userId: "89000000-0000-4000-8000-000000000001" },
  request: {
    expectedRevision: 0,
    settings: {
      enabled: false,
      environment: "sandbox",
      dispatchMode: "manual_after_packing",
      sandbox: config,
      live: config,
    },
    credential: { environment: "sandbox", mode: "replace", apiKey: credential },
  },
});
const seeded = await bridge({ kind: "seed" });
// These bindings come only from the manager's marker-guarded fixture setup.
if (!isPlainRecord(seeded.data)) {
  throw new Error("Missing fixture shipment bindings");
}
for (const label of ["accepted", "uncertain", "lost_begin", "lost_complete"]) {
  const binding = seeded.data[label];
  if (
    !isPlainRecord(binding) || !isIntegrationUuid(binding.shipmentId) ||
    !isIntegrationUuid(binding.integrationId) ||
    binding.environment !== "sandbox"
  ) {
    throw new Error("Invalid fixture shipment binding");
  }
  bindings[label] = {
    shipmentId: binding.shipmentId,
    integrationId: binding.integrationId,
    environment: "sandbox",
  };
}
// These calls traverse the real SDK, validators/store and actual service-role
// SQL. No fake SQL model or browser-provided actor/payment evidence is used.
const review = createShipaReviewStore({ client });
const actor = { userId: "89000000-0000-4000-8000-000000000001" };
const canonical = await client.rpc("shipa_resolve_dispatch_binding", {
  _shipment_id: bindings.accepted.shipmentId,
});
if (
  !isPlainRecord(canonical) || canonical.error !== null || !isPlainRecord(canonical.data) ||
  !isIntegrationUuid(canonical.data.order_id)
) {
  throw new Error("Missing canonical fixture order binding");
}
const orderId = canonical.data.order_id;
const preview = await review.preview({ actor, orderId, request: { environment: "sandbox" } });
assertEquals(preview.accepted, true);
const request = {
  environment: "sandbox",
  overrides: {},
  expectedSettingsRevision: preview.settingsRevision,
  expectedInputFingerprint: preview.inputFingerprint,
  reviewReason: "Synthetic packed confirmation",
  acknowledgePricing: false,
  packedConfirmed: true,
};
const adopted = await review.requestManual({ actor, orderId, request });
assertEquals(adopted.shipmentId, bindings.accepted.shipmentId);
assertEquals(adopted.changed, false);
const safeRead = await review.readShipment({ actor, shipmentId: adopted.shipmentId });
assertEquals(safeRead?.orderId, orderId);
assertEquals(safeRead?.source, "manual");
assertEquals(safeRead?.customerRef.startsWith("CM-"), true);
const stale = await assertRejects(() =>
  review.requestManual({
    actor,
    orderId,
    request: { ...request, expectedInputFingerprint: "0".repeat(64) },
  }), ShipaReviewError);
assertEquals(stale.code, "conflict");
const forged = await assertRejects(() =>
  review.readShipment({
    actor: { userId: "89000000-0000-4000-8000-000000000099" },
    shipmentId: adopted.shipmentId,
  }), ShipaReviewError);
assertEquals(forged.code, "forbidden");
const beforeLoss = calls.filter((call) => call.fn === "shipa_request_manual").length;
loseManualReviewResponse = true;
const lostReview = await assertRejects(() =>
  review.requestManual({
    actor,
    orderId,
    request: { ...request, reviewReason: "Synthetic lost-response review" },
  }), ShipaReviewError);
assertEquals(lostReview.code, "unavailable");
assertEquals(calls.filter((call) => call.fn === "shipa_request_manual").length, beforeLoss + 1);
assertEquals(
  (await review.readShipment({ actor, shipmentId: adopted.shipmentId }))?.state,
  "queued",
);

let activeCase = "";
const posts: Record<string, number> = {};
const dispatcher = createShipaDispatcher({
  client,
  keyring: master.keyring,
  fetchImpl: (target, init) => {
    const url = new URL(target);
    assertEquals(url.origin, "https://sandbox-api.shipadelivery.com");
    assertEquals(url.pathname, "/v2/orders");
    assertEquals(url.searchParams.get("apikey"), credential);
    assertEquals(init.method, "POST");
    const payload = JSON.parse(String(init.body));
    assertEquals(payload.destination.options.amountToCollect, 0);
    assertEquals(Object.hasOwn(payload.origin, "options"), false);
    posts[activeCase] = (posts[activeCase] ?? 0) + 1;
    return Promise.resolve(
      activeCase === "uncertain" ? Response.json({}, { status: 503 }) : Response.json({
        shipaRef: `SYNTHETIC-${activeCase}`,
        orderStatus: "Created",
      }),
    );
  },
});
for (
  const [label, expected] of [
    ["accepted", "created"],
    ["uncertain", "uncertain"],
    ["lost_begin", "uncertain"],
    ["lost_complete", "persistence_uncertain"],
  ]
) {
  activeCase = label;
  const result = await dispatcher.processShipment(bindings[label]);
  assertEquals(result.status, expected);
  assertEquals(posts[label] ?? 0, label === "lost_begin" ? 0 : 1);
  const replay = await dispatcher.processShipment(bindings[label]);
  assertEquals(replay.status, "not_started");
  assertEquals(posts[label] ?? 0, label === "lost_begin" ? 0 : 1);
  assertEquals(
    calls.filter((call) =>
      call.fn === "shipa_begin_submission" &&
      call.shipment === bindings[label].shipmentId
    ).length,
    1,
  );
  assertEquals(JSON.stringify(result).includes(credential), false);
  assertEquals(
    JSON.stringify(result).includes("Synthetic buyer address"),
    false,
  );
}
const unknown = await review.readShipment({ actor, shipmentId: bindings.uncertain.shipmentId });
assertEquals(unknown?.state, "unknown");
assertEquals(unknown?.retryAt, null);
await input.cancel();
await Deno.stdout.write(
  encoder.encode(
    JSON.stringify({
      kind: "complete",
      receipt:
        "Real SDK/review/core/crypto/SQL and committed-response-loss cases passed; provider POST synthetic",
    }) + "\n",
  ),
);
