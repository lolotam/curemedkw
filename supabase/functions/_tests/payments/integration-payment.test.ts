import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { createClient } from "npm:@supabase/supabase-js@2";
import { recordIntegrationPayment, verifyPendingIntegrationPayment } from "../../_shared/integration-payment.ts";

const id = "87000000-0000-4000-8000-000000000001";
const raw = { Invoice: { Id: "1", ExternalIdentifier: id, Status: "PAID" },
  Transaction: { PaymentId: "p1", Status: "SUCCESS" }, Amount: { BaseCurrency: "KWD", ValueInBaseCurrency: "1.000" } };
function fixture(reply: (path: string, body: Record<string, unknown>, method: string) => unknown) {
  return createClient("https://fixture.supabase.test", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const result = reply(new URL(String(input)).pathname, init?.body ? await new Request(input, init).json() : {}, init?.method ?? "GET");
      return result instanceof Response ? result : Response.json(result);
    } },
  });
}
Deno.test("signed invalid identity is handled without storage", async () => {
  const admin = fixture(() => { throw new Error("unexpected storage"); });
  assertEquals(await recordIntegrationPayment(admin, { ...raw, Invoice: { ...raw.Invoice, ExternalIdentifier: "payment-link" } }, "signed_webhook"),
    { handled: false, reason: "payment_identity_invalid" });
});
Deno.test("unbound non-success is handled; storage errors still throw", async () => {
  for (const message of ["unbound_success_required", "database offline"]) {
    const admin = fixture(path => path.endsWith("wa_find_canonical_payment_attempt") ? { state: "missing" }
      : Response.json({ message }, { status: 500 }));
    if (message === "unbound_success_required") assertEquals(await recordIntegrationPayment(admin, raw, "signed_webhook"),
      { handled: false, reason: "unbound_non_success" });
    else await assertRejects(() => recordIntegrationPayment(admin, raw, "signed_webhook"), Error, message);
  }
});
for (const kind of ["malformed", "amount", "identity", "network", "timeout", "resolved"]) {
  Deno.test(`verification classifies ${kind}`, async () => {
    const resolutions: Record<string, unknown>[] = [];
    const admin = fixture((path, body) => {
      if (path.endsWith("wa_claim_pending_payment_verification")) return { id, order_id: id, lease_token: id, transaction_payment_id: "p1" };
      if (path.endsWith("wa_resolve_pending_payment_verification")) {
        resolutions.push(body);
        // The SQL owner rejects contradicting evidence on the resolved write.
        if (body.p_terminal_state === "resolved" && kind === "amount") return Response.json({ message: "verified_payment_amount_mismatch" }, { status: 400 });
        if (body.p_terminal_state === "resolved" && kind === "identity") return Response.json({ message: "payment_attempt_binding_mismatch" }, { status: 400 });
        return {};
      }
      return null;
    });
    const originalFetch = globalThis.fetch;
    const originalEnv = Deno.env.get;
    Deno.env.get = () => "fixture";
    globalThis.fetch = () => {
      if (kind === "network") throw new Error("offline");
      if (kind === "timeout") throw new DOMException("timeout", "AbortError");
      return Promise.resolve(Response.json({ IsSuccess: true, Data: kind === "malformed" ? { ...raw, Amount: { BaseCurrency: "KWD" } } : raw }));
    };
    try { await verifyPendingIntegrationPayment(admin, id); }
    finally { globalThis.fetch = originalFetch; Deno.env.get = originalEnv; }
    const mismatch = kind === "amount" || kind === "identity";
    assertEquals(resolutions.map(row => row.p_terminal_state),
      mismatch ? ["resolved", "evidence_mismatch"] : [kind === "resolved" ? "resolved" : "retry"]);
    const last = resolutions[resolutions.length - 1];
    if (kind !== "resolved") assertEquals(last.p_verified_result, { code: kind === "amount" ? "payment_amount_mismatch"
      : kind === "identity" ? "payment_identity_mismatch" : kind === "timeout" ? "provider_timeout" : "provider_response_invalid" });
  });
}
Deno.test("paid bind dispatches once through atomic notification claim", async () => {
  let claimed = false;
  let sends = 0;
  const admin = fixture((path, _body, method) => {
    if (path.endsWith("wa_list_unbound_payment_statuses")) return [{ pending_id: id }];
    if (path.endsWith("wa_bind_unbound_payment_status")) return { payment_result: { owner_snapshot: { facts: { order_id: id } }, payment_status: "paid" } };
    if (path.endsWith("wa_claim_pending_payment_verification")) return null;
    if (path.endsWith("wa_read_payment_owner")) return { owner: "integration" };
    if (path.endsWith("/orders") && method === "PATCH") { const first = !claimed; claimed = true; return first ? { id } : null; }
    if (path.endsWith("/orders")) return { id, payment_status: "paid", total: 1 };
    if (path.endsWith("/order_items")) return [];
    if (path.endsWith("/site_settings")) return null;
    if (path.endsWith("/send-order-email")) { sends++; return {}; }
    throw new Error(`Unexpected request: ${path}`);
  });
  const originalEnv = Deno.env.get;
  Deno.env.get = () => "fixture";
  try { await verifyPendingIntegrationPayment(admin); await verifyPendingIntegrationPayment(admin); }
  finally { Deno.env.get = originalEnv; }
  assertEquals(sends, 1);
});
