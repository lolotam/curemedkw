import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1.0.19";
import { createEvolutionInboxClient, inboxIdentity, inboxMessage, InboxError } from "../../_shared/evolution-inbox.ts";
import { decodeInboxMedia } from "../../whatsapp-inbox/media.ts";
import { createEvolutionPairingWebhookHandler } from "../../whatsapp-pairing-webhook/handler.ts";
import { verifiedPaymentAttestation } from "../../_shared/integration-payment.ts";

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
