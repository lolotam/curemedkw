// Send WhatsApp notifications via Postora.
// Public endpoint (verify_jwt = false) — gated server-side via site_settings.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const POSTORA_ENDPOINT =
  "https://efruibswazzuuupgyzmf.supabase.co/functions/v1/ecommerce-whatsapp-api";

const BodySchema = z.object({
  event: z.enum([
    "order.paid",
    "order.shipped",
    "cart.abandoned",
    "review.request",
    "admin.new_order",
    "test",
  ]),
  to: z.array(z.string().min(6).max(20)).min(1).max(10),
  data: z.record(z.any()).default({}),
  order_id: z.string().uuid().optional(),
});

const DEFAULT_TEMPLATES: Record<string, { ar: string; en: string }> = {
  "order.paid": {
    ar: "مرحباً {{customer_name}} 🌿\nشكراً لطلبك من Curemed.\nرقم الطلب: {{order_number}}\nالمجموع: {{total}} د.ك\nيمكنك متابعة طلبك: {{invoice_url}}",
    en: "Hi {{customer_name}} 🌿\nThanks for your Curemed order.\nOrder #: {{order_number}}\nTotal: KD {{total}}\nTrack here: {{invoice_url}}",
  },
  "order.shipped": {
    ar: "طلبك رقم {{order_number}} قيد التوصيل 🚚\nشكراً لاختيارك Curemed.",
    en: "Your order {{order_number}} is on the way 🚚\nThanks for choosing Curemed.",
  },
  "cart.abandoned": {
    ar: "مرحباً {{customer_name}}، عربتك تنتظرك في Curemed 🛒\n{{cart_url}}",
    en: "Hi {{customer_name}}, your Curemed cart is waiting 🛒\n{{cart_url}}",
  },
  "review.request": {
    ar: "نتمنى أن تكون قد استمتعت بمنتجات Curemed 💚\nشاركنا رأيك: {{review_url}}",
    en: "Hope you loved your Curemed products 💚\nLeave a review: {{review_url}}",
  },
  "admin.new_order": {
    ar: "🛎️ طلب جديد {{order_number}}\nالعميل: {{customer_name}}\nهاتف: {{customer_phone}}\nالمجموع: {{total}} د.ك\n{{items_summary}}",
    en: "🛎️ New order {{order_number}}\nCustomer: {{customer_name}}\nPhone: {{customer_phone}}\nTotal: KD {{total}}\n{{items_summary}}",
  },
  test: {
    ar: "رسالة اختبار من Curemed عبر Postora ✅",
    en: "Test message from Curemed via Postora ✅",
  },
};

function render(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(data[k] ?? ""));
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { event, to, data, order_id } = parsed.data;

    // apiKey is resolved below from site_settings (preferred) with env-var fallback.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Load settings
    const { data: settingRow } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "whatsapp_integration")
      .maybeSingle();
    const settings = (settingRow?.value as any) ?? {};
    const enabled = settings.enabled !== false; // default on if key exists
    const lang: "ar" | "en" = settings.language === "en" ? "en" : "ar";
    const eventsCfg = settings.events ?? {};
    const eventKey = event.replace(".", "_"); // order.paid -> order_paid
    const eventEnabled = eventsCfg[eventKey] !== false;

    // Prefer the key saved via /admin/whatsapp UI; fall back to env var.
    const apiKey =
      (typeof settings.api_key === "string" && settings.api_key.trim()) ||
      Deno.env.get("POSTORA_WHATSAPP_API_KEY") ||
      "";

    if (!apiKey || !enabled || !eventEnabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: !apiKey ? "no_api_key" : !enabled ? "disabled" : "event_off" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tplOverride =
      settings.templates?.[`${eventKey}_${lang}`] ??
      settings.templates?.[eventKey]?.[lang];
    const tpl = tplOverride || DEFAULT_TEMPLATES[event][lang];
    const message = render(tpl, data);

    const results: any[] = [];
    for (const rawPhone of to) {
      const phone = normalizePhone(rawPhone);
      if (!phone) continue;

      const payload = { action: "send_text", to: phone, text: message, message };
      const url = `${POSTORA_ENDPOINT}?action=send_text`;
      let status = "sent";
      let respJson: any = null;
      let errMsg: string | null = null;
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify(payload),
        });
        const text = await r.text();
        try { respJson = JSON.parse(text); } catch { respJson = { raw: text }; }
        if (!r.ok) {
          status = "failed";
          errMsg = `HTTP ${r.status}: ${text.slice(0, 300)}`;
        } else if (respJson && respJson.success === false) {
          status = "failed";
          errMsg = `Postora rejected: ${respJson.error ?? text.slice(0, 300)}`;
        }
      } catch (e) {
        status = "failed";
        errMsg = (e as Error).message;
      }

      await admin.from("whatsapp_send_logs").insert({
        event,
        recipient: phone,
        status,
        request_payload: payload,
        response_payload: respJson ?? {},
        error_message: errMsg,
        order_id: order_id ?? null,
      });

      results.push({ to: phone, status, error: errMsg });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-whatsapp error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
