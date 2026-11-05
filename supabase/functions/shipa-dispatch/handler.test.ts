import { assertEquals } from "jsr:@std/assert@1.0.19";
import { createShipaDispatchHandler } from "./handler.ts";
import type { ShipaRuntimeClient } from "../_shared/shipa-runtime.ts";

function harness(failExpiry = false, failPayment = false, configured = true) {
  let heartbeat = 0;
  let payments = 0;
  let calls = 0;
  const client: ShipaRuntimeClient = {
    auth: { getUser: () => { throw new Error("worker must not authenticate a browser"); } },
    from: () => { throw new Error("worker must use RPC"); },
    rpc: (name) => {
      calls++;
      if (name === "shipa_worker_context") return Promise.resolve({ data: configured ? { integration_id: "87000000-0000-4000-8000-000000000001", environment: "sandbox", credential_fingerprint: "a".repeat(64) } : null, error: null });
      if (name === "shipa_record_scheduler_ok") heartbeat++;
      return Promise.resolve({ data: name === "shipa_select_dispatch_candidates" ? [] : {}, error: failExpiry && name === "shipa_expire_leases" ? {} : null });
    },
  };
  const handler = createShipaDispatchHandler({ client, credentials: { serviceRoleKey: "service", schedulerToken: "scheduler" },
    readEncryptionKey: () => btoa("k".repeat(32)), verifyPendingPayments: () => { payments++; return failPayment ? Promise.reject(new Error("payment offline")) : Promise.resolve(); } });
  return { handler, get payments() { return payments; }, get heartbeat() { return heartbeat; }, get calls() { return calls; } };
}

Deno.test("worker refuses browser requests before database access", async () => {
  const test = harness();
  const response = await test.handler(new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer browser-session" } }));
  assertEquals(response.status, 401); assertEquals(test.calls, 0);
});

Deno.test("payment verification outage does not suppress shipment readiness", async () => {
  const test = harness(false, true);
  const response = await test.handler(new Request("https://example.test", { method: "POST", headers: { "x-shipa-dispatch-token": "scheduler" } }));
  assertEquals(response.status, 200);
  assertEquals((await response.json()).paymentVerificationPending, true);
  assertEquals(test.heartbeat, 1);
});

Deno.test("only successful scheduler runs record readiness, including an empty queue", async () => {
  for (const scenario of ["scheduler", "service", "failure"]) {
    const test = harness(scenario === "failure");
    const headers: Record<string, string> = scenario === "service" ? { Authorization: "Bearer service" } : { "x-shipa-dispatch-token": "scheduler" };
    const response = await test.handler(new Request("https://example.test", { method: "POST", headers }));
    assertEquals(response.status, scenario === "failure" ? 503 : 200);
    assertEquals(test.heartbeat, scenario === "scheduler" ? 1 : 0);
  }
});

Deno.test("unconfigured Shipa still verifies payments without shipment work", async () => {
  for (const failPayment of [false, true]) {
    const test = harness(false, failPayment, false);
    const response = await test.handler(new Request("https://example.test", { method: "POST", headers: { "x-shipa-dispatch-token": "scheduler" } }));
    assertEquals(response.status, 200);
    assertEquals(await response.json(), { success: true, shipa: "not_configured", paymentVerificationPending: failPayment });
    assertEquals(test.payments, 1);
    assertEquals(test.calls, 1);
    assertEquals(test.heartbeat, 0);
  }
});
