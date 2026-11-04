// Real SDK/core/crypto/SQL. Provider transport is synthetic; no native booking.
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { createClient } from "npm:@supabase/supabase-js@2.105.1";
import { createShipaRuntimeClient } from "../../functions/_shared/shipa-runtime.ts";
import { createShipaReviewStore } from "../../functions/_shared/shipa-review-store.ts";
import { ShipaReviewError } from "../../functions/_shared/shipa-review-contract.ts";
import { createShipaCredentialService } from "../../functions/_shared/shipa-credential-service.ts";
import { createShipaAdminHandler } from "../../functions/shipa-admin/handler.ts";
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
      if (url.pathname === "/auth/v1/user") {
        if (
          request.headers.get("authorization") !== "Bearer synthetic-session"
        ) {
          return Response.json({ message: "Synthetic session refused" }, {
            status: 401,
          });
        }
        return Response.json({
          id: "89000000-0000-4000-8000-000000000001",
          email: "core-proof@example.test",
          app_metadata: {},
          user_metadata: {},
        });
      }
      if (url.pathname === "/rest/v1/user_roles") {
        assertEquals(
          url.searchParams.get("user_id"),
          "eq.89000000-0000-4000-8000-000000000001",
        );
        assertEquals(url.searchParams.get("role"), "eq.admin");
        const role = await bridge({
          kind: "role",
          actor: "89000000-0000-4000-8000-000000000001",
        });
        return Response.json(role.error ?? role.data, { status: role.status });
      }
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
for (
  const label of [
    "accepted",
    "uncertain",
    "lost_begin",
    "lost_complete",
    "manual_endpoint",
  ]
) {
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
  !isPlainRecord(canonical) || canonical.error !== null ||
  !isPlainRecord(canonical.data) ||
  !isIntegrationUuid(canonical.data.order_id)
) {
  throw new Error("Missing canonical fixture order binding");
}
const orderId = canonical.data.order_id;
const preview = await review.preview({
  actor,
  orderId,
  request: { environment: "sandbox" },
});
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
const safeRead = await review.readShipment({
  actor,
  shipmentId: adopted.shipmentId,
});
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
const beforeLoss =
  calls.filter((call) => call.fn === "shipa_request_manual").length;
loseManualReviewResponse = true;
const lostReview = await assertRejects(() =>
  review.requestManual({
    actor,
    orderId,
    request: { ...request, reviewReason: "Synthetic lost-response review" },
  }), ShipaReviewError);
assertEquals(lostReview.code, "unavailable");
assertEquals(
  calls.filter((call) => call.fn === "shipa_request_manual").length,
  beforeLoss + 1,
);
assertEquals(
  (await review.readShipment({ actor, shipmentId: adopted.shipmentId }))?.state,
  "queued",
);

let activeCase = "";
const posts: Record<string, number> = {};
const provider = async (target: string, init: RequestInit) => {
  const url = new URL(target);
  assertEquals(url.origin, "https://sandbox-api.shipadelivery.com");
  assertEquals(url.pathname, "/v2/orders");
  assertEquals(url.searchParams.get("apikey"), credential);
  assertEquals(init.method, "POST");
  const payload = JSON.parse(String(init.body));
  assertEquals(payload.destination.options.amountToCollect, 0);
  assertEquals(Object.hasOwn(payload.origin, "options"), false);
  const marker = await bridge({
    kind: "marker",
    shipment: bindings[activeCase].shipmentId,
  });
  assertEquals(
    marker.data,
    true,
    "provider request preceded its durable submission marker",
  );
  posts[activeCase] = (posts[activeCase] ?? 0) + 1;
  return Promise.resolve(
    activeCase === "uncertain"
      ? Response.json({}, { status: 503 })
      : Response.json({
        shipaRef: `SYNTHETIC-${activeCase}`,
        orderStatus: "Created",
      }),
  );
};
const dispatcher = createShipaDispatcher({
  client,
  keyring: master.keyring,
  fetchImpl: provider,
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
const unknown = await review.readShipment({
  actor,
  shipmentId: bindings.uncertain.shipmentId,
});
assertEquals(unknown?.state, "unknown");
assertEquals(unknown?.retryAt, null);

// The real HTTP handler verifies its session through the actual SDK and reads
// the actual SQL role row. Only remote auth/provider transport is synthetic.
const handler = createShipaAdminHandler({
  client,
  readEncryptionKey: () => master.encoded,
  fetchImpl: provider,
});
async function endpoint(
  payload: unknown,
  expectedStatus = 200,
  sessionMarker = "synthetic-session",
) {
  const response = await handler(
    new Request("https://guarded.test/shipa-admin?actor=forged", {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionMarker}`,
        "x-actor-id": "forged",
      },
      body: JSON.stringify(payload),
    }),
  );
  assertEquals(response.status, expectedStatus);
  const text = await response.text();
  for (
    const sensitive of [
      credential,
      master.encoded,
      "ciphertext",
      "nonce",
      "attempt_token",
      "Synthetic buyer address",
    ]
  ) {
    assertEquals(text.includes(sensitive), false);
  }
  return JSON.parse(text);
}
activeCase = "manual_endpoint";
const endpointBinding = await client.rpc("shipa_resolve_dispatch_binding", {
  _shipment_id: bindings.manual_endpoint.shipmentId,
});
if (!isPlainRecord(endpointBinding) || !isPlainRecord(endpointBinding.data)) {
  throw new Error("Missing endpoint binding");
}
const endpointOrder = endpointBinding.data.order_id;
const endpointPreview = await endpoint({
  action: "shipment.preview",
  orderId: endpointOrder,
  request: { environment: "sandbox" },
});
assertEquals(endpointPreview.data.accepted, true);
const endpointBody = {
  action: "shipment.create",
  orderId: endpointOrder,
  request: {
    ...request,
    expectedSettingsRevision: endpointPreview.data.settingsRevision,
    expectedInputFingerprint: endpointPreview.data.inputFingerprint,
  },
};
const callsBeforeDenied = calls.length;
await endpoint(endpointBody, 401, "invalid-session");
assertEquals(calls.length, callsBeforeDenied);
await endpoint({ ...endpointBody, actor }, 400);
assertEquals(calls.length, callsBeforeDenied);
const booked = await endpoint(endpointBody);
assertEquals(booked.data.dispatch.status, "created");
assertEquals(posts.manual_endpoint, 1);
const loaded = await endpoint({
  action: "shipment.read",
  shipmentId: bindings.manual_endpoint.shipmentId,
});
assertEquals(loaded.data.state, "created");
assertEquals(loaded.data.shipaRef, "SYNTHETIC-manual_endpoint");
const replayed = await endpoint(endpointBody, 409);
assertEquals(replayed.error.code, "needs_reconciliation");
assertEquals(posts.manual_endpoint, 1);
await input.cancel();
await Deno.stdout.write(
  encoder.encode(
    JSON.stringify({
      kind: "complete",
      receipt:
        "Real SDK/auth-role HTTP/manual/review/core/crypto/SQL and committed-response-loss cases passed; provider POST synthetic",
    }) + "\n",
  ),
);
