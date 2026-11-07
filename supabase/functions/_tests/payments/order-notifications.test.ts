import { assertEquals } from "jsr:@std/assert@1.0.19";
import { createClient } from "npm:@supabase/supabase-js@2";
import { dispatchOrderNotifications } from "../../_shared/apply-payment.ts";

const orderId = "8b000000-0000-4000-8000-000000000001";
const order = { id: orderId, order_number: "CM-7", customer_name: "Sara", customer_phone: "+96550000001", total: 12.5 };

// Only HTTP is replaced: supabase-js builds every database and function request with production code.
function paidOrder(tab: { data: unknown; status?: number }) {
  const events: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const one = (row: unknown) => Response.json((request.headers.get("accept") ?? "").includes("vnd.pgrst.object") ? row : [row]);
    if (url.pathname === "/rest/v1/rpc/wa_read_payment_owner") return Response.json({ owner: "legacy", owner_snapshot: {} });
    if (url.pathname === "/rest/v1/rpc/owa_enqueue_confirmation") {
      return tab.status ? Response.json({ message: "missing" }, { status: tab.status }) : Response.json(tab.data);
    }
    if (url.pathname === "/rest/v1/orders") return one(request.method === "PATCH" ? { id: orderId } : order);
    if (url.pathname === "/rest/v1/order_items") return Response.json([]);
    if (url.pathname === "/rest/v1/site_settings") {
      return one({ value: url.searchParams.get("key") === "eq.whatsapp_integration" ? { admin_numbers: ["+96599999999"] } : {} });
    }
    if (url.pathname.startsWith("/functions/v1/")) {
      const body = await request.json();
      events.push(`${url.pathname.slice("/functions/v1/".length)}:${body.event ?? body.mode}`);
      return Response.json({ success: true });
    }
    throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
  };
  const admin = createClient("https://fixture.supabase.test", "fixture-service-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchImpl as typeof fetch } });
  return { admin, events };
}

Deno.test("an enabled order-WhatsApp tab replaces only the Postora customer confirmation", async () => {
  const test = paidOrder({ data: { enabled: true, queued: true } });
  await dispatchOrderNotifications(test.admin, orderId);
  assertEquals(test.events.sort(), ["send-order-email:order", "send-whatsapp:admin.new_order"]);
});

Deno.test("the Postora customer confirmation still goes out when the tab is off or its RPC is missing", async () => {
  for (const tab of [{ data: { enabled: false, queued: false } }, { data: null, status: 404 }]) {
    const test = paidOrder(tab);
    await dispatchOrderNotifications(test.admin, orderId);
    assertEquals(test.events.sort(), ["send-order-email:order", "send-whatsapp:admin.new_order", "send-whatsapp:order.paid"]);
  }
});
