import { assertEquals } from "jsr:@std/assert@1.0.19";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createInboxHandler } from "../../whatsapp-inbox/handler.ts";
import { ingestInboxEvent } from "../../_shared/whatsapp-inbox-webhook.ts";
import { recordIntegrationPayment } from "../../_shared/integration-payment.ts";

const actor = "87000000-0000-4000-8000-000000000001";
const chat = "87000000-0000-4000-8000-000000000002";
const requestId = "87000000-0000-4000-8000-000000000003";

// Only HTTP is replaced. Authentication, SDK query construction, validation,
// provider dispatch and response handling execute their production code.
function fixture(options: { hook?: unknown; isAdmin?: boolean; providerFails?: boolean; failSyncSave?: boolean; ingestSkips?: boolean } = {}) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let reserved = false;
  let providerSends = 0;
  const admin = createClient("https://fixture.supabase.test", "fixture-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      const body = init?.body ? await new Request(input, init).json() : {};
      calls.push({ path, body });
      if (path === "/auth/v1/user") return Response.json({ id: actor });
      if (path === "/rest/v1/user_roles") return Response.json(options.isAdmin === false ? [] : [{ user_id: actor, role: "admin" }]);
      if (path === "/rest/v1/whatsapp_chats") return Response.json({ id: chat, remote_jid: "123456789012345@lid", normalized_phone: null });
      if (path.endsWith("/wa_reserve_inbox_send")) {
        const first = !reserved; reserved = true; return Response.json(first);
      }
      if (path.endsWith("/wa_ingest_messages")) return Response.json(options.ingestSkips ? { inserted: 0, skipped: 1 } : { inserted: 1, skipped: 0 });
      if (path.endsWith("/wa_mark_chat_read")) return Response.json(true);
      if (path.endsWith("/wa_claim_inbox_sync")) return Response.json({ id: requestId, lease_token: actor,
        cursor_json: { stage: "messages", page: 2 }, processed_count: 100, unresolved_count: 0 });
      if (path === "/rest/v1/whatsapp_sync_runs") return Response.json(options.failSyncSave ? null : { id: requestId });
      throw new Error(`Unexpected database request: ${path}`);
    } },
  });
  const handler = createInboxHandler({ admin,
    readConfig: () => ({ origin: "http://curemed-evolution:8080", apiKey: "fixture-key", webhookSecret: "fixture-hk", storagePublicUrl: "" }),
    fetchImpl: (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      if (path === "/webhook/find/curemed") return Promise.resolve(Response.json(options.hook ?? {}));
      if (path === "/webhook/set/curemed") return Promise.resolve(Response.json({}));
      if (path === "/instance/connectionState/curemed") return Promise.resolve(Response.json({ instance: { state: "open" } }));
      if (path === "/message/sendText/curemed") {
        providerSends++;
        return Promise.resolve(options.providerFails ? new Response("provider secret", { status: 500 }) : Response.json({
          key: { id: "sent-1", remoteJid: "96550000001@s.whatsapp.net", fromMe: true }, messageTimestamp: 1793872800,
          message: { conversation: "Hello" },
        }));
      }
      if (path === "/chat/findMessages/curemed") return Promise.resolve(Response.json({ messages: { pages: 2, records: [{
        key: { id: "history-1", remoteJid: "123456789012345@lid", fromMe: false }, messageTimestamp: 1793872800,
        message: { conversation: "History" },
      }] } }));
      throw new Error(`Unexpected provider request: ${path}`);
    },
  });
  return { calls, sends: () => providerSends,
    request: (body: unknown, authenticated = true) => handler(new Request("https://fixture.test/whatsapp-inbox", {
      method: "POST", headers: authenticated ? { authorization: "Bearer fixture-user-token" } : {}, body: JSON.stringify(body),
    })) };
}

Deno.test("inbox rejects anonymous and non-admin callers before reading or sending customer data", async () => {
  const anonymous = fixture();
  assertEquals((await anonymous.request({ action: "send", chatId: chat, requestId, text: "Hello" }, false)).status, 401);
  assertEquals(anonymous.calls.length, 0);
  const ordinary = fixture({ isAdmin: false });
  assertEquals((await ordinary.request({ action: "send", chatId: chat, requestId, text: "Hello" })).status, 403);
  assertEquals(ordinary.calls.map(call => call.path), ["/auth/v1/user", "/rest/v1/user_roles"]);
});

Deno.test("an uncertain send keeps its reservation and retries cannot send a second customer message", async () => {
  const test = fixture({ providerFails: true });
  const input = { action: "send", chatId: chat, requestId, text: "Hello" };
  const first = await test.request(input);
  assertEquals(first.status, 502);
  assertEquals((await first.json()).error.code, "send_uncertain");
  assertEquals((await test.request(input)).status, 409);
  assertEquals(test.sends(), 1);
  assertEquals(test.calls.some(call => call.path.endsWith("/wa_ingest_messages")), false);
});

Deno.test("a successful reply preserves LID addressing and persists before acknowledging", async () => {
  const test = fixture();
  assertEquals((await test.request({ action: "send", chatId: chat, requestId, text: "Hello" })).status, 200);
  assertEquals(test.calls.find(call => call.path === "/message/sendText/curemed")?.body.number, "123456789012345@lid");
  assertEquals(test.calls.at(-1)?.path, "/rest/v1/rpc/wa_ingest_messages");
  assertEquals((test.calls.at(-1)?.body.p_rows as Record<string, unknown>[])[0].remote_jid, "123456789012345@lid");
  assertEquals(test.sends(), 1);
});

Deno.test("a provider-accepted reply that storage skipped is reported uncertain", async () => {
  const test = fixture({ ingestSkips: true });
  assertEquals((await test.request({ action: "send", chatId: chat, requestId, text: "Hello" })).status, 502);
  assertEquals(test.sends(), 1);
});

Deno.test("native keyId acknowledgements update outgoing messages only", async () => {
  const calls: unknown[] = [];
  const admin = createClient("https://fixture.supabase.test", "fixture-key", { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: async (input, init) => { calls.push({ path: new URL(String(input)).pathname, body: await new Request(input, init).json() }); return Response.json(null); },
  } });
  await ingestInboxEvent(admin, "messages.update", [{ keyId: "sent-1", fromMe: true, status: "READ" }, { keyId: "received-1", fromMe: false, status: "READ" }]);
  assertEquals(calls, [{ path: "/rest/v1/rpc/wa_update_ack", body: { p_message_id: "sent-1", p_state: "read" } }]);
});

Deno.test("committed payment receipt survives a pending verification outage", async () => {
  const admin = createClient("https://fixture.supabase.test", "fixture-key", { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("wa_find_canonical_payment_attempt")) return Promise.resolve(Response.json({ state: "found", order_id: actor, attempt_id: chat }));
      if (path.endsWith("wa_record_provider_payment_outcome")) return Promise.resolve(Response.json({ changed: true, payment_status: "paid", verification_pending: true }));
      return Promise.resolve(Response.json({ message: "offline" }, { status: 503 }));
    },
  } });
  const receipt = await recordIntegrationPayment(admin, { Invoice: { Id: "1", ExternalIdentifier: actor, Status: "PAID" }, Transaction: { PaymentId: "payment-1", Status: "SUCCESS" } }, "signed_webhook");
  assertEquals(receipt?.payment_status, "paid");
  assertEquals(receipt?.changed, true);
});

Deno.test("sync resumes its durable cursor, imports history without unread increments, and detects lost leases", async () => {
  for (const failSyncSave of [false, true]) {
    const test = fixture({ failSyncSave });
    const response = await test.request({ action: "sync" });
    assertEquals(response.status, failSyncSave ? 409 : 200);
    assertEquals(test.calls.find(call => call.path === "/chat/findMessages/curemed")?.body, { page: 2, offset: 100 });
    const rows = test.calls.find(call => call.path.endsWith("/wa_ingest_messages"))?.body.p_rows as Record<string, unknown>[];
    assertEquals(rows[0].count_unread, false);
    assertEquals(test.calls.at(-1)?.body.processed_count, 101);
  }
});

Deno.test("webhook merges events and preserves custom headers using the v2 DTO", async () => {
  const test = fixture({ hook: { events: ["CALL", "MESSAGES_UPSERT"], headers: { custom: "value", "X-Curemed-Webhook-Key": "old" } } });
  assertEquals((await test.request({ action: "webhook.ensure" })).status, 200);
  const calls = test.calls.filter(call => call.path.startsWith("/webhook/"));
  assertEquals(calls.map(call => call.path), ["/webhook/find/curemed", "/webhook/set/curemed"]);
  assertEquals(calls[1].body, { webhook: { enabled: true,
    url: "http://cloud-supabase-hns8fw-supabase-edge-functions:9000/whatsapp-pairing-webhook",
    headers: { custom: "value", "x-curemed-webhook-key": "fixture-hk" }, byEvents: false, base64: false,
    events: ["CALL", "MESSAGES_UPSERT", "CONNECTION_UPDATE", "MESSAGES_UPDATE", "MESSAGES_DELETE"] } });
});
Deno.test("webhook conflicts require explicit force", async () => {
  for (const force of [false, true]) {
    const test = fixture({ hook: { url: "https://other.test/hook", events: ["CALL"] } });
    const response = await test.request({ action: "webhook.ensure", force });
    assertEquals(response.status, force ? 200 : 409);
    if (!force) assertEquals((await response.json()).error.code, "webhook_conflict");
    assertEquals(test.calls.some(call => call.path === "/webhook/set/curemed"), force);
  }
});
