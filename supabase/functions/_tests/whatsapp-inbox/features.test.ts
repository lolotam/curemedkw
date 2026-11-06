import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createEvolutionInboxClient, InboxError } from "../../_shared/evolution-inbox.ts";
import { EVOLUTION_ALLOWED_ORIGIN } from "../../_shared/evolution-pairing.ts";
import { ingestInboxEvent } from "../../_shared/whatsapp-inbox-webhook.ts";
import { getInboxAvatars } from "../../whatsapp-inbox/avatars.ts";
import { deleteInboxMessage, REVOKE_WINDOW_MS } from "../../whatsapp-inbox/delete.ts";

type Call = { method: string; path: string; body: unknown };
type Route = (call: Call) => Response;

const messageId = "88000000-0000-4000-8000-000000000001";
const actorId = "88000000-0000-4000-8000-000000000002";
const now = Date.parse("2026-11-06T12:00:00Z");

// Only HTTP is replaced; the Supabase SDK and the Evolution client build every request with production code.
function recordingFetch(calls: Call[], route: Route) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const text = await request.text();
    const contentType = request.headers.get("content-type") ?? "";
    const call = { method: request.method, path: new URL(request.url).pathname,
      body: text && contentType.includes("json") ? JSON.parse(text) : text };
    calls.push(call);
    return route(call);
  };
}

function adminWith(calls: Call[], route: Route) {
  return createClient("https://fixture.supabase.test", "fixture-service-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: recordingFetch(calls, route) },
  });
}

function providerWith(calls: Call[], route: Route) {
  return createEvolutionInboxClient({ origin: EVOLUTION_ALLOWED_ORIGIN, apiKey: "fixture-key",
    fetchImpl: recordingFetch(calls, route) as typeof fetch });
}

const revokeCall = { method: "POST", path: "/rest/v1/rpc/wa_apply_remote_revoke", body: { p_provider_message_id: "m-1" } };

Deno.test("a delete-for-everyone made on the phone marks the message deleted in each shape Evolution sends", async () => {
  const shapes: [string, unknown][] = [
    ["messages.upsert", [{ key: { id: "revoke-envelope", remoteJid: "96550000001@s.whatsapp.net", fromMe: false },
      messageTimestamp: 1793872800,
      message: { ephemeralMessage: { message: { protocolMessage: { type: "REVOKE", key: { id: "m-1" } } } } } }]],
    ["messages.delete", { id: "m-1", remoteJid: "96550000001@s.whatsapp.net", fromMe: false }],
    ["messages.delete", { keys: [{ id: "m-1", remoteJid: "96550000001@s.whatsapp.net", fromMe: false }] }],
    ["messages.update", [{ keyId: "m-1", fromMe: true, status: "DELETED" }]],
  ];
  for (const [event, payload] of shapes) {
    const calls: Call[] = [];
    await ingestInboxEvent(adminWith(calls, () => Response.json(true)), event, payload);
    assertEquals(calls, [revokeCall], event);
  }
});

Deno.test("a revoke in a mixed upsert batch is applied and the ordinary message is still ingested", async () => {
  const calls: Call[] = [];
  await ingestInboxEvent(adminWith(calls, () => Response.json(true)), "messages.upsert", [
    { key: { id: "revoke-envelope", remoteJid: "96550000001@s.whatsapp.net", fromMe: false }, messageTimestamp: 1793872800,
      message: { protocolMessage: { type: 0, key: { id: "m-1" } } } },
    { key: { id: "m-2", remoteJid: "96550000001@s.whatsapp.net", fromMe: false }, messageTimestamp: 1793872801,
      message: { conversation: "Still here" } },
  ]);
  assertEquals(calls.map(call => call.path), ["/rest/v1/rpc/wa_ingest_messages", "/rest/v1/rpc/wa_apply_remote_revoke"]);
  const rows = (calls[0].body as { p_rows: { provider_message_id: string }[] }).p_rows;
  assertEquals(rows.map(row => row.provider_message_id), ["m-2"]);
});

function deleteFixture(message: { direction: string; sent_at: string; remote_deleted_at?: string | null }) {
  const database: Call[] = [];
  const evolution: Call[] = [];
  const admin = adminWith(database, call => {
    if (call.path === "/rest/v1/whatsapp_messages") return Response.json({ chat_id: "chat-1", provider_message_id: "sent-1",
      remote_deleted_at: null, ...message });
    if (call.path === "/rest/v1/whatsapp_chats") return Response.json({ id: "chat-1", remote_jid: "123456789012345@lid", normalized_phone: null });
    if (call.path === "/rest/v1/rpc/wa_delete_inbox_message") return Response.json(true);
    throw new Error(`Unexpected database request: ${call.path}`);
  });
  const provider = providerWith(evolution, () => Response.json({ status: "ok" }));
  return { admin, provider, database, evolution };
}

Deno.test("delete for everyone revokes on WhatsApp first, as a DELETE that carries the message key", async () => {
  const test = deleteFixture({ direction: "outbound", sent_at: new Date(now - 60_000).toISOString() });
  assertEquals(await deleteInboxMessage(test.admin, test.provider, { messageId, scope: "everyone" }, actorId, now), { deleted: true });
  assertEquals(test.evolution, [{ method: "DELETE", path: "/chat/deleteMessageForEveryone/curemed",
    body: { id: "sent-1", fromMe: true, remoteJid: "123456789012345@lid" } }]);
  assertEquals(test.database.at(-1), { method: "POST", path: "/rest/v1/rpc/wa_delete_inbox_message",
    body: { p_message_id: messageId, p_scope: "everyone", p_actor_id: actorId } });
});

Deno.test("delete for everyone is refused without contacting WhatsApp for customer messages, old messages and repeats", async () => {
  const cases: [Parameters<typeof deleteFixture>[0], string][] = [
    [{ direction: "inbound", sent_at: new Date(now - 60_000).toISOString() }, "delete_not_allowed"],
    [{ direction: "outbound", sent_at: new Date(now - REVOKE_WINDOW_MS - 1).toISOString() }, "delete_window_expired"],
    [{ direction: "outbound", sent_at: new Date(now - 60_000).toISOString(), remote_deleted_at: new Date(now).toISOString() },
      "delete_not_allowed"],
  ];
  for (const [message, code] of cases) {
    const test = deleteFixture(message);
    const error = await assertRejects(() => deleteInboxMessage(test.admin, test.provider, { messageId, scope: "everyone" }, actorId, now),
      InboxError);
    assertEquals([error.code, error.status], [code, 409]);
    assertEquals(test.evolution, []);
    assertEquals(test.database.some(call => call.path.includes("wa_delete_inbox_message")), false);
  }
});

Deno.test("delete for me only hides the message in this inbox", async () => {
  const test = deleteFixture({ direction: "inbound", sent_at: new Date(now - REVOKE_WINDOW_MS * 10).toISOString() });
  assertEquals(await deleteInboxMessage(test.admin, test.provider, { messageId, scope: "local" }, actorId, now), { deleted: true });
  assertEquals(test.evolution, []);
  assertEquals(test.database.map(call => call.path), ["/rest/v1/rpc/wa_delete_inbox_message"]);
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const staleChat = (id: string) => ({ id, remote_jid: `${id}@lid`, normalized_phone: null, avatar_object_path: null, avatar_checked_at: null });

function avatarFixture(chats: ReturnType<typeof staleChat>[], answer: (jid: string) => Response) {
  const database: Call[] = [];
  const evolution: Call[] = [];
  const downloads: string[] = [];
  const admin = adminWith(database, call => {
    if (call.method === "GET" && call.path === "/rest/v1/whatsapp_chats") return Response.json(chats);
    if (call.method === "PATCH" && call.path === "/rest/v1/whatsapp_chats") return new Response(null, { status: 204 });
    if (call.path.startsWith("/storage/v1/object/whatsapp-media/")) return Response.json({ Key: call.path });
    if (call.path === "/storage/v1/object/sign/whatsapp-media") {
      return Response.json((call.body as { paths: string[] }).paths.map(path => ({ path, error: null,
        signedURL: `/object/sign/whatsapp-media/${path}?token=t` })));
    }
    throw new Error(`Unexpected database request: ${call.method} ${call.path}`);
  });
  const provider = providerWith(evolution, call => answer((call.body as { number: string }).number));
  const fetchImpl = (url: string) => {
    downloads.push(url);
    return Promise.resolve(new Response(jpeg, { headers: { "content-type": "image/jpeg" } }));
  };
  return { admin, provider, database, evolution, downloads, fetchImpl };
}

Deno.test("profile pictures download only from WhatsApp's picture CDN and are handed out on the public origin", async () => {
  const test = avatarFixture([staleChat("trusted"), staleChat("foreign")], jid => Response.json({ profilePictureUrl:
    jid === "trusted@lid" ? "https://pps.whatsapp.net/v/t61/picture.jpg?oe=1" : "https://attacker.test/picture.jpg" }));
  const result = await getInboxAvatars(test.admin, test.provider, ["trusted", "foreign"],
    { publicOrigin: "https://supabase.example.test", fetchImpl: test.fetchImpl });
  assertEquals(test.downloads, ["https://pps.whatsapp.net/v/t61/picture.jpg?oe=1"]);
  assertEquals(result.avatars.foreign, null);
  assertEquals(result.avatars.trusted?.startsWith("https://supabase.example.test/storage/v1/object/sign/whatsapp-media/curemed/avatars/"), true);
  assertEquals(result.pending, false);
  // Both outcomes are recorded, so neither chat asks WhatsApp again for a week.
  assertEquals(test.database.filter(call => call.method === "PATCH").length, 2);
});

Deno.test("pending asks for another round only while there are stale chats left and lookups are succeeding", async () => {
  const chats = Array.from({ length: 8 }, (_, index) => staleChat(`chat-${index}`));
  const cases: [Response, boolean][] = [
    [Response.json({ profilePictureUrl: null }), true],
    [new Response("closed session", { status: 500 }), false],
  ];
  for (const [answer, pending] of cases) {
    const test = avatarFixture(chats, () => answer.clone());
    const result = await getInboxAvatars(test.admin, test.provider, chats.map(chat => chat.id),
      { publicOrigin: "", fetchImpl: test.fetchImpl });
    assertEquals(test.evolution.length, 6);
    assertEquals(result.pending, pending);
    assertEquals(Object.values(result.avatars), Array(8).fill(null));
  }
});
