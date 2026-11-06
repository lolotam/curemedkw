import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createEvolutionInboxClient, InboxError } from "../../_shared/evolution-inbox.ts";
import { EVOLUTION_ALLOWED_ORIGIN } from "../../_shared/evolution-pairing.ts";
import { updateInboxContact } from "../../whatsapp-inbox/contacts.ts";
import { forwardInboxMessage } from "../../whatsapp-inbox/forward.ts";

type Call = { method: string; path: string; body: unknown };
type Route = (call: Call) => Response;

const sourceId = "89000000-0000-4000-8000-000000000001";
const targetChat = "89000000-0000-4000-8000-000000000002";
const requestId = "89000000-0000-4000-8000-000000000003";
const actorId = "89000000-0000-4000-8000-000000000004";
const contactId = "89000000-0000-4000-8000-000000000005";
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

// Only HTTP is replaced; the Supabase SDK and the Evolution client build every request with production code.
function recordingFetch(calls: Call[], route: Route) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const text = await request.text();
    const json = text && (request.headers.get("content-type") ?? "").includes("json");
    const call = { method: request.method, path: new URL(request.url).pathname, body: json ? JSON.parse(text) : text };
    calls.push(call);
    return route(call);
  };
}

function forwardFixture(source: Record<string, unknown>) {
  const database: Call[] = [];
  const evolution: Call[] = [];
  const admin = createClient("https://fixture.supabase.test", "fixture-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: recordingFetch(database, call => {
      if (call.path === "/rest/v1/whatsapp_messages" && call.method === "GET") {
        return Response.json({ id: sourceId, media_object_id: null, provider_media: null, remote_deleted_at: null, ...source });
      }
      if (call.path === "/rest/v1/whatsapp_messages" && call.method === "PATCH") return new Response(null, { status: 204 });
      if (call.path === "/rest/v1/whatsapp_media_objects") {
        return Response.json({ id: "object-1", object_path: "curemed/abc", mime_type: "image/jpeg", file_name: "prices.jpg" });
      }
      if (call.path === "/storage/v1/object/whatsapp-media/curemed/abc") return new Response(jpeg, { headers: { "content-type": "image/jpeg" } });
      if (call.path === "/rest/v1/whatsapp_chats") return Response.json({ id: targetChat, remote_jid: "96550000009@s.whatsapp.net", normalized_phone: "96550000009" });
      if (call.path === "/rest/v1/rpc/wa_reserve_inbox_send") return Response.json(true);
      if (call.path === "/rest/v1/rpc/wa_ingest_messages") return Response.json({ inserted: 1, skipped: 0 });
      throw new Error(`Unexpected database request: ${call.method} ${call.path}`);
    }) },
  });
  const provider = createEvolutionInboxClient({ origin: EVOLUTION_ALLOWED_ORIGIN, apiKey: "fixture-key",
    fetchImpl: recordingFetch(evolution, call => call.path.startsWith("/instance/connectionState")
      ? Response.json({ instance: { state: "open" } })
      : Response.json({ key: { id: "forwarded-1", remoteJid: "96550000009@s.whatsapp.net", fromMe: true }, messageTimestamp: 1793872800,
        message: { conversation: "x" } })) as typeof fetch });
  return { admin, provider, database, evolution };
}

Deno.test("forwarding an attachment sends the stored file with its caption to the chosen chat as a new send", async () => {
  const test = forwardFixture({ message_type: "image", body: "Price list", media_object_id: "object-1" });
  assertEquals(await forwardInboxMessage(test.admin, test.provider, { messageId: sourceId, chatId: targetChat, requestId }, actorId),
    { sent: true });
  const sends = test.evolution.filter(call => call.path.startsWith("/message/"));
  assertEquals(sends, [{ method: "POST", path: "/message/sendMedia/curemed", body: { number: "96550000009@s.whatsapp.net",
    mediatype: "image", mimetype: "image/jpeg", media: btoa(String.fromCharCode(...jpeg)), fileName: "prices.jpg", caption: "Price list" } }]);
  const reservation = test.database.find(call => call.path === "/rest/v1/rpc/wa_reserve_inbox_send")?.body as Record<string, unknown>;
  assertEquals([reservation.p_request_id, reservation.p_chat_id], [requestId, targetChat]);
});

Deno.test("forwarding text sends the same text to the chosen chat", async () => {
  const test = forwardFixture({ message_type: "text", body: "See you at 5" });
  await forwardInboxMessage(test.admin, test.provider, { messageId: sourceId, chatId: targetChat, requestId }, actorId);
  assertEquals(test.evolution.filter(call => call.path.startsWith("/message/")), [{ method: "POST",
    path: "/message/sendText/curemed", body: { number: "96550000009@s.whatsapp.net", text: "See you at 5" } }]);
});

Deno.test("deleted, empty and unsupported messages are refused before anything is sent", async () => {
  const cases: Record<string, unknown>[] = [
    { message_type: "text", body: "", remote_deleted_at: "2026-11-06T10:00:00Z" },
    { message_type: "text", body: "   " },
    { message_type: "unsupported", body: "" },
  ];
  for (const source of cases) {
    const test = forwardFixture(source);
    const error = await assertRejects(() => forwardInboxMessage(test.admin, test.provider,
      { messageId: sourceId, chatId: targetChat, requestId }, actorId), InboxError);
    assertEquals([error.code, error.status], ["forward_not_supported", 409]);
    assertEquals(test.evolution, []);
  }
});

function contactAdmin(receipt: unknown) {
  return createClient("https://fixture.supabase.test", "fixture-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: recordingFetch([], () => Response.json(receipt)) },
  });
}

Deno.test("a refused contact edit surfaces the database's reason, and an accepted one returns the saved contact", async () => {
  const refusals: [string, number][] = [["phone_in_use", 409], ["phone_locked", 409], ["contact_not_found", 404], ["surprise", 503]];
  for (const [code, status] of refusals) {
    const error = await assertRejects(() => updateInboxContact(contactAdmin({ ok: false, code }),
      { contactId, patch: { phone: "96550000009" } }, actorId), InboxError);
    assertEquals([error.code, error.status], [code === "surprise" ? "storage_unavailable" : code, status]);
  }
  const saved = { id: contactId, display_name: "Sara", normalized_phone: "96550000009" };
  assertEquals(await updateInboxContact(contactAdmin({ ok: true, contact: saved }), { contactId, patch: { display_name: "Sara" } }, actorId),
    { contact: saved });
});
