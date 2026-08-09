// Send WhatsApp notifications via Postora.
// Public endpoint (verify_jwt = false) — gated server-side via site_settings.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

// Postora moved from a hosted Supabase project to self-hosted Kong at
// api.postora.cloud. The old URL was hardcoded here, so every send failed for
// months with no way to correct it short of a redeploy. The endpoint is now
// settings-driven and this constant is only the fallback.
const DEFAULT_POSTORA_ENDPOINT =
  "https://api.postora.cloud/functions/v1/ecommerce-whatsapp-api";

// A settings-driven URL is an SSRF sink: whatever host it names is handed the
// Postora API key in x-api-key, and this container can reach the internal
// Docker network (db, kong, storage) that is unreachable from outside. The
// override therefore selects among Postora hosts over TLS rather than naming
// an arbitrary one; anything else is refused and the default stands.
const ALLOWED_ENDPOINT_HOSTS = new Set(["api.postora.cloud", "postora.cloud"]);

function safeEndpoint(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_POSTORA_ENDPOINT;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    console.error("send-whatsapp: endpoint_rejected reason=unparseable");
    return DEFAULT_POSTORA_ENDPOINT;
  }
  if (url.protocol !== "https:" || !ALLOWED_ENDPOINT_HOSTS.has(url.hostname)) {
    console.error(`send-whatsapp: endpoint_rejected host=${url.hostname} proto=${url.protocol}`);
    return DEFAULT_POSTORA_ENDPOINT;
  }
  return url.toString();
}

const SendSchema = z.object({
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

interface PostoraConfig {
  endpoint: string;
  apiKey: string;
  enabled: boolean;
  lang: "ar" | "en";
  events: Record<string, unknown>;
  templates: Record<string, any>;
}

async function loadConfig(admin: SupabaseClient): Promise<PostoraConfig> {
  const { data: row } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", "whatsapp_integration")
    .maybeSingle();
  const s = (row?.value as any) ?? {};
  return {
    endpoint: safeEndpoint(s.endpoint),
    // Prefer the key saved via /admin/whatsapp UI; fall back to env var.
    apiKey:
      (typeof s.api_key === "string" && s.api_key.trim()) ||
      Deno.env.get("POSTORA_WHATSAPP_API_KEY") ||
      "",
    enabled: s.enabled !== false, // default on if key exists
    lang: s.language === "en" ? "en" : "ar",
    events: s.events ?? {},
    templates: s.templates ?? {},
  };
}

interface SendOutcome {
  payload: Record<string, unknown>;
  body: any;
  status: "sent" | "failed";
  error: string | null;
}

async function postToPostora(
  cfg: PostoraConfig,
  phone: string,
  text: string,
): Promise<SendOutcome> {
  // Postora reads `action` from the JSON body only; the old `?action=` query
  // string was never consumed. `text` is the sole field send_text reads.
  const payload = { action: "send_text", to: phone, text };
  try {
    const r = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey },
      body: JSON.stringify(payload),
    });
    const raw = await r.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { body = { raw } }
    if (!r.ok) {
      return { payload, body, status: "failed", error: `HTTP ${r.status}: ${raw.slice(0, 300)}` };
    }
    // Postora answers HTTP 200 with success:false for connection and delivery
    // problems, tagging them with error_code (WHATSAPP_NOT_CONNECTED,
    // WHATSAPP_SEND_FAILED, ...). Checking only r.ok records those as sent.
    if (body?.success === false) {
      const code = body.error_code ? `${body.error_code}: ` : "";
      return { payload, body, status: "failed", error: `${code}${body.error ?? raw.slice(0, 300)}` };
    }
    return { payload, body, status: "sent", error: null };
  } catch (e) {
    return { payload, body: null, status: "failed", error: (e as Error).message };
  }
}

/**
 * This function runs with verify_jwt = false so the payment path can invoke it,
 * so anything that reports configuration state must gate itself. Mirrors the
 * check in ai-test-connection/index.ts.
 */
async function isAdminCaller(req: Request, admin: SupabaseClient): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data: userRes, error } = await admin.auth.getUser(token);
  if (error || !userRes?.user) return false;
  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "admin")
    .maybeSingle();
  return !!role;
}

/**
 * Postora's GET endpoint reports API-key validity and whether a WhatsApp
 * account is connected, without sending a message. It separates the three
 * failure modes — unreachable host, rejected key, no connected account —
 * that otherwise all surface as an identical "send failed" log row.
 */
async function runDiagnostic(req: Request, cfg: PostoraConfig): Promise<Response> {
  if (!cfg.apiKey) {
    return jsonResponse(req, {
      ok: false, endpoint: cfg.endpoint, reason: "no_api_key",
      message: "No Postora API key saved.",
    });
  }
  try {
    const r = await fetch(cfg.endpoint, { method: "GET", headers: { "x-api-key": cfg.apiKey } });
    const raw = await r.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { body = {} }
    return jsonResponse(req, {
      ok: r.ok && body?.success === true && body?.whatsapp_connected === true,
      http_status: r.status,
      endpoint: cfg.endpoint,
      api_key_valid: body?.api_key_valid === true,
      whatsapp_connected: body?.whatsapp_connected === true,
      account: body?.account ?? null,
      connect_url: body?.connect_url ?? null,
      message: body?.error ?? null,
    });
  } catch (e) {
    return jsonResponse(req, {
      ok: false, endpoint: cfg.endpoint, reason: "unreachable",
      message: (e as Error).message,
    });
  }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const rawBody = await req.json().catch(() => ({}));
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const cfg = await loadConfig(admin);

    // Diagnose reveals the configured endpoint, key validity and the connected
    // business phone number, so it is admin-only even though sending is not.
    if ((rawBody as any)?.action === "diagnose") {
      if (!(await isAdminCaller(req, admin))) {
        return jsonResponse(req, { error: "Admin only" }, 403);
      }
      return await runDiagnostic(req, cfg);
    }

    const parsed = SendSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse(req, { error: parsed.error.flatten() }, 400);
    }
    const { event, to, data, order_id } = parsed.data;

    const eventKey = event.replace(".", "_"); // order.paid -> order_paid
    const skipReason = !cfg.apiKey
      ? "no_api_key"
      : !cfg.enabled
        ? "disabled"
        : cfg.events[eventKey] === false
          ? "event_off"
          : null;
    if (skipReason) return jsonResponse(req, { skipped: true, reason: skipReason });

    const override =
      cfg.templates?.[`${eventKey}_${cfg.lang}`] ?? cfg.templates?.[eventKey]?.[cfg.lang];
    const message = render(override || DEFAULT_TEMPLATES[event][cfg.lang], data);

    const results: any[] = [];
    for (const rawPhone of to) {
      const phone = normalizePhone(rawPhone);
      if (!phone) continue;

      const out = await postToPostora(cfg, phone, message);
      await admin.from("whatsapp_send_logs").insert({
        event,
        recipient: phone,
        status: out.status,
        request_payload: out.payload,
        response_payload: out.body ?? {},
        error_message: out.error,
        order_id: order_id ?? null,
      });
      results.push({ to: phone, status: out.status, error: out.error });
    }

    return jsonResponse(req, { ok: true, results });
  } catch (err) {
    console.error("send-whatsapp: unhandled_error:", (err as Error).message);
    return jsonResponse(req, { error: (err as Error).message }, 500);
  }
});
