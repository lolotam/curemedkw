import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1.0.19";
import { createEvolutionInboxClient, inboxIdentity, inboxMessage, InboxError } from "../../_shared/evolution-inbox.ts";
import { decodeInboxMedia, getInboxMedia } from "../../whatsapp-inbox/media.ts";
import { createEvolutionPairingWebhookHandler } from "../../whatsapp-pairing-webhook/handler.ts";
import { verifiedPaymentAttestation } from "../../_shared/integration-payment.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

Deno.test("stickers retain the original WebP download payload and emoji reactions remain readable", () => {
  const base = { key: { remoteJid: "123456789012345@lid", id: "sticker-1", fromMe: false }, messageTimestamp: 1793872800 };
  const sticker = { mimetype: "image/webp", isAnimated: true, directPath: "/fixture-sticker" };
  const normalized = inboxMessage({ ...base, message: { stickerMessage: sticker } }, true);
  assertEquals(normalized?.message_type, "image");
  assertEquals(normalized?.provider_media, { key: base.key, message: { stickerMessage: sticker } });
  assertEquals(inboxMessage({ ...base, message: { reactionMessage: { text: "❤️", key: { id: "original" } } } }, true)?.body, "❤️");
  assertEquals(inboxMessage({ ...base, message: { conversation: "👋🏽 😊" } }, true)?.body, "👋🏽 😊");
});

Deno.test("nested disappearing content and captioned documents preserve supported attachments", () => {
  const base = { key: { remoteJid: "123456789012345@lid", id: "nested-1", fromMe: false }, messageTimestamp: 1793872800 };
  const row = inboxMessage({ ...base, message: { viewOnceMessageV2: { message: { ephemeralMessage: { message: {
    documentWithCaptionMessage: { message: { documentMessage: { mimetype: "application/pdf", caption: "Document" } } },
  } } } } } }, false);
  assertEquals(row?.message_type, "document");
  assertEquals(row?.body, "Document");
  const gif = inboxMessage({ ...base, message: { videoMessage: { mimetype: "video/mp4", gifPlayback: true } } }, false);
  assertEquals(gif?.message_type, "video");
  assertEquals(gif?.provider_media, { key: base.key, message: { videoMessage: { mimetype: "video/mp4", gifPlayback: true } } });
  assertEquals(decodeInboxMedia("R0lGODlh", "image/gif").kind, "image");
});

Deno.test("LID messages survive without phone, and alternate phone does not replace addressing identity", () => {
  const message = { key: { remoteJid: "123456789012345@lid", id: "message-1", fromMe: false },
    message: { conversation: "Hello" }, messageTimestamp: 1793872800 };
  assertEquals(inboxMessage(message, true)?.normalized_phone, null);
  assertEquals(inboxMessage(message, true)?.remote_jid, "123456789012345@lid");
  assertEquals(inboxIdentity({ ...message, senderPn: "96550000001@s.whatsapp.net" })?.normalized_phone, "96550000001");
  // SQL alias resolution needs the alternate jid itself, including key-level senderPn.
  assertEquals(inboxIdentity({ ...message, key: { ...message.key, senderPn: "96550000001@s.whatsapp.net" } })?.remoteJidAlt,
    "96550000001@s.whatsapp.net");
  assertEquals(inboxIdentity({ ...message, remoteJidAlt: "not-a-jid" })?.remoteJidAlt, undefined);
  assertEquals(inboxMessage({ ...message, key: { ...message.key, remoteJid: "12345@g.us" } }, true), null);
});

Deno.test("webhook acknowledges persisted messages and retries a failed storage boundary", async () => {
  const accepted: unknown[] = [];
  const handler = createEvolutionPairingWebhookHandler({ readSecret: () => "fixture-secret",
    ingest: (event, payload) => { accepted.push({ event, payload }); return Promise.resolve(); } });
  const request = (instance = "curemed") => new Request("https://example.test/webhook", { method: "POST",
    headers: { "x-curemed-webhook-key": "fixture-secret" }, body: JSON.stringify({ instance, event: "MESSAGES_UPSERT", data: { key: { id: "one" } } }) });
  assertEquals((await handler(request("foreign"))).status, 400);
  assertEquals(accepted.length, 0);
  assertEquals((await handler(request())).status, 200);
  assertEquals(accepted.length, 1);
  const failed = createEvolutionPairingWebhookHandler({ readSecret: () => "fixture-secret", ingest: () => Promise.reject(new Error("database")) });
  assertEquals((await failed(request())).status, 503);
});

Deno.test("fixed provider origin rejects redirects and exposes no upstream secrets", async () => {
  assertThrows(() => createEvolutionInboxClient({ origin: "https://external.test", apiKey: "test" }), InboxError);
  let redirect: RequestRedirect | undefined;
  const client = createEvolutionInboxClient({ origin: "http://curemed-evolution:8080", apiKey: "test",
    fetchImpl: (_url, init) => { redirect = init?.redirect; return Promise.resolve(new Response("secret", { status: 500 })); } });
  await assertRejects(() => client("text", { number: "12345@lid", text: "hello" }), InboxError, "provider_unavailable");
  assertEquals(redirect, "error");
});

Deno.test("media refuses active document types and oversized or malformed encoding", () => {
  for (const [encoded, mime] of [["PHN2Zz4=", "image/svg+xml"], ["###", "image/png"], ["", "image/png"], ["A".repeat(13981020), "image/png"]]) {
    assertThrows(() => decodeInboxMedia(encoded, mime), InboxError);
  }
});

Deno.test("verified payment uses exact provider base amount, never rounds or trusts display currency", () => {
  const response = { Invoice: { Id: "1", ExternalIdentifier: "87000000-0000-4000-8000-000000000001", Status: "PAID" },
    Transaction: { PaymentId: "payment-1", Status: "SUCCESS" }, Amount: { BaseCurrency: "KWD", ValueInBaseCurrency: "10.001" } };
  assertEquals(verifiedPaymentAttestation(response).amount_millis, 10001);
  for (const amount of [{ BaseCurrency: "USD", ValueInBaseCurrency: "10.001" }, { BaseCurrency: "KWD", ValueInBaseCurrency: "10.0001" }]) {
    assertThrows(() => verifiedPaymentAttestation({ ...response, Amount: amount }));
  }
});

Deno.test("message truncation preserves emoji at code point boundary", () => {
  const body = "a".repeat(4095) + "\u{1F600}" + "z";
  const result = inboxMessage({ key: { remoteJid: "123456789012345@lid", id: "boundary" }, message: { conversation: body }, messageTimestamp: 1793872800 }, true);
  assertEquals(result?.body, "a".repeat(4095) + "\u{1F600}");
});

/** Admin client double for an attachment that is already in storage, signed on the internal Kong host. */
function storedMediaAdmin() {
  const row = (data: unknown) => ({ eq: () => row(data), single: () => Promise.resolve({ data, error: null }) });
  const tables: Record<string, unknown> = {
    whatsapp_messages: { id: "message-1", media_object_id: "object-1", provider_media: null },
    whatsapp_media_objects: { object_path: "curemed/abc", mime_type: "application/pdf", file_name: "invoice.pdf" },
  };
  return {
    from: (table: string) => ({ select: () => row(tables[table]) }),
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ error: null,
      data: { signedUrl: "http://kong:8000/storage/v1/object/sign/whatsapp-media/curemed/abc?token=signed" } }) }) },
  } as unknown as SupabaseClient;
}

// Regression 2026-11-06: production inbox images/PDFs never loaded because media.get returned http://kong:8000 links.
Deno.test("media URL handed to the browser uses the public storage origin, not the internal gateway", async () => {
  const provider = () => Promise.reject(new Error("stored media must not hit the provider"));
  const media = await getInboxMedia(storedMediaAdmin(), provider, "message-1", "https://supabase.example.test/");
  assertEquals(media.url, "https://supabase.example.test/storage/v1/object/sign/whatsapp-media/curemed/abc?token=signed");
  assertEquals(media.fileName, "invoice.pdf");
  const unconfigured = await getInboxMedia(storedMediaAdmin(), provider, "message-1", "");
  assertEquals(unconfigured.url, "http://kong:8000/storage/v1/object/sign/whatsapp-media/curemed/abc?token=signed");
});
