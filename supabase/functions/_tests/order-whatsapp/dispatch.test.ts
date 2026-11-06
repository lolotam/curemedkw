import { assertEquals } from "jsr:@std/assert@1.0.19";
import { createEvolutionInboxClient } from "../../_shared/evolution-inbox.ts";
import { EVOLUTION_ALLOWED_ORIGIN } from "../../_shared/evolution-pairing.ts";
import { renderWhatsAppTemplate, resolveWhatsAppTemplate } from "../../_shared/order-whatsapp-template.ts";
import { createOrderWhatsAppDispatchHandler } from "../../order-whatsapp-dispatch/handler.ts";

const fixtureKey = "fixture";
type Call = { name: string; args: Record<string, unknown> };
const tokens = { customer_name: "Sara", order_number: "CM-1", total: "12.500", currency: "KWD", order_url: "" };
const claimed = (id: string, recipient: string, language = "en") =>
  ({ id, kind: "confirmation", language, recipient, tokens });

// The database is faked at the RPC boundary and Evolution at HTTP; the Evolution client is production code.
function fixture(options: { state?: string; messages?: unknown[]; templates?: unknown; failRecipient?: string; claimError?: boolean } = {}) {
  const rpcCalls: Call[] = [];
  const sent: Record<string, unknown>[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname.startsWith("/instance/connectionState")) {
      return Response.json({ instance: { state: options.state ?? "open" } });
    }
    const body = await request.json();
    sent.push(body);
    if (body.number === `${options.failRecipient}@s.whatsapp.net`) return new Response("busy", { status: 500 });
    return Response.json({ key: { id: `wa-${sent.length}`, remoteJid: body.number, fromMe: true }, messageTimestamp: 1793872800,
      message: { conversation: body.text } });
  };
  const handler = createOrderWhatsAppDispatchHandler({
    rpc: (name, args) => {
      rpcCalls.push({ name, args });
      if (name === "owa_claim_due") {
        return Promise.resolve(options.claimError ? { data: null, error: { message: "boom 96550000001" } }
          : { data: { messages: options.messages ?? [], templates: options.templates ?? {} }, error: null });
      }
      return Promise.resolve({ data: name === "owa_finish" ? true : { inserted: 1, skipped: 0 }, error: null });
    },
    provider: () => createEvolutionInboxClient({ origin: EVOLUTION_ALLOWED_ORIGIN, apiKey: "fixture-key", fetchImpl: fetchImpl as typeof fetch }),
    schedulerToken: fixtureKey,
  });
  const run = (token: string | null = fixtureKey) => handler(new Request("https://example.test", { method: "POST",
    headers: token === null ? {} : { "x-order-whatsapp-token": token } }));
  return { run, rpcCalls, sent };
}

Deno.test("dispatch refuses a missing or wrong token before touching WhatsApp or the database", async () => {
  for (const token of [null, "wrong-token", ""]) {
    const test = fixture();
    assertEquals((await test.run(token)).status, 401);
    assertEquals([test.rpcCalls.length, test.sent.length], [0, 0]);
  }
});

Deno.test("a disconnected session claims nothing, so queued messages wait", async () => {
  const test = fixture({ state: "close", messages: [claimed("m1", "96550000001")] });
  const response = await test.run();
  assertEquals(await response.json(), { success: true, session: "disconnected", sent: 0, uncertain: 0 });
  assertEquals(test.rpcCalls, []);
});

Deno.test("claimed messages are rendered, sent to the customer's number, recorded and shown in the inbox", async () => {
  const test = fixture({ messages: [claimed("m1", "96550000001", "ar"), claimed("m2", "96550000002", "en")],
    templates: { confirmation_ar: "أهلاً {{customer_name}}، طلبك {{order_number}}\n{{order_url}}", confirmation_en: "  " } });
  assertEquals(await (await test.run()).json(), { success: true, sent: 2, uncertain: 0 });
  assertEquals(test.sent.map(body => [body.number, body.text]), [
    ["96550000001@s.whatsapp.net", "أهلاً Sara، طلبك CM-1"],
    ["96550000002@s.whatsapp.net", "Hi Sara, thank you for your order #CM-1 from Curemed.\nTotal: 12.500 KWD"],
  ]);
  const finished = test.rpcCalls.filter(call => call.name === "owa_finish").map(call => call.args);
  assertEquals(finished, [
    { p_message_id: "m1", p_status: "sent", p_body: "أهلاً Sara، طلبك CM-1", p_provider_message_id: "wa-1" },
    { p_message_id: "m2", p_status: "sent", p_body: test.sent[1].text, p_provider_message_id: "wa-2" },
  ]);
  const ingested = test.rpcCalls.filter(call => call.name === "wa_ingest_messages")
    .map(call => (call.args.p_rows as Record<string, unknown>[])[0]);
  assertEquals(ingested.map(row => [row.provider_message_id, row.direction, row.normalized_phone, row.body]), [
    ["wa-1", "outbound", "96550000001", "أهلاً Sara، طلبك CM-1"], ["wa-2", "outbound", "96550000002", test.sent[1].text],
  ]);
});

Deno.test("a failed send is recorded as uncertain, never retried, and does not stop the next message", async () => {
  const test = fixture({ messages: [claimed("m1", "96550000001"), claimed("m2", "96550000002")], failRecipient: "96550000001" });
  assertEquals(await (await test.run()).json(), { success: true, sent: 1, uncertain: 1 });
  assertEquals(test.sent.length, 2);
  assertEquals(test.rpcCalls.filter(call => call.name === "owa_finish").map(call => [call.args.p_message_id, call.args.p_status]),
    [["m1", "uncertain"], ["m2", "sent"]]);
  assertEquals(test.rpcCalls.filter(call => call.name === "wa_ingest_messages").length, 1);
});

Deno.test("a storage failure answers 503 without echoing database text", async () => {
  const response = await fixture({ claimError: true }).run();
  assertEquals([response.status, await response.text()], [503, JSON.stringify({ code: "dispatch_unavailable" })]);
});

Deno.test("templates fall back to the default and never leak a placeholder", () => {
  assertEquals(resolveWhatsAppTemplate({ delivery_en: "Custom" }, "delivery_en"), "Custom");
  assertEquals(resolveWhatsAppTemplate({ delivery_en: " " }, "delivery_ar"), resolveWhatsAppTemplate(null, "delivery_ar"));
  assertEquals(renderWhatsAppTemplate("Hi {{ customer_name }} {{unknown}}\n\n\n\nBye {{order_url}}  ", tokens), "Hi Sara\n\nBye");
});
