// Send order confirmation email via admin-configured SMTP (denomailer).
// Public endpoint (verify_jwt = false) — gated server-side via site_settings
// ("order_email"). All SMTP credentials live in the database and are editable
// from /admin/whatsapp, so no email secrets are needed in the environment.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BodySchema = z.object({
  // "test" sends a sample to the configured recipients; "order" needs an order_id.
  mode: z.enum(["order", "test"]).default("order"),
  order_id: z.string().uuid().optional(),
  // Optional override for the test recipient.
  test_to: z.string().email().optional(),
});

interface OrderEmailSettings {
  enabled?: boolean;
  smtp_host?: string;
  smtp_port?: number | string;
  smtp_secure?: boolean;
  smtp_user?: string;
  smtp_pass?: string;
  from_email?: string;
  from_name?: string;
  to?: string; // primary recipient
  cc?: string[]; // carbon copies
  storefront_url?: string;
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: unknown): string {
  const num = Number(n ?? 0);
  return Number.isFinite(num) ? num.toFixed(3) : "0.000";
}

function buildHtml(order: any, items: any[]): string {
  const rows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(it.product_name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${esc(it.quantity)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">KD ${money(it.unit_price)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">KD ${money(Number(it.unit_price) * Number(it.quantity))}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <div style="max-width:620px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eaeaea;">
      <div style="background:linear-gradient(135deg,#0ea5e9,#8b5cf6,#ec4899);padding:24px 28px;color:#fff;">
        <h1 style="margin:0;font-size:22px;">New paid order</h1>
        <p style="margin:6px 0 0;opacity:.9;font-size:13px;">Order #${esc(order.order_number)}</p>
      </div>
      <div style="padding:24px 28px;">
        <table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:18px;">
          <tr><td style="padding:4px 0;color:#666;">Customer</td><td style="padding:4px 0;text-align:right;font-weight:600;">${esc(order.customer_name)}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Phone</td><td style="padding:4px 0;text-align:right;">${esc(order.customer_phone)}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Email</td><td style="padding:4px 0;text-align:right;">${esc(order.customer_email || "—")}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Payment</td><td style="padding:4px 0;text-align:right;">${esc(order.payment_online_method || order.payment_method || "—")}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f6f7fb;">
              <th style="padding:8px 12px;text-align:left;">Product</th>
              <th style="padding:8px 12px;text-align:center;">Qty</th>
              <th style="padding:8px 12px;text-align:right;">Price</th>
              <th style="padding:8px 12px;text-align:right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="text-align:right;margin-top:16px;font-size:16px;font-weight:700;">
          Total: KD ${money(order.total)}
        </div>
        ${
          order.address_line || order.street
            ? `<div style="margin-top:18px;padding:14px 16px;background:#f6f7fb;border-radius:10px;font-size:13px;color:#444;">
                <strong>Delivery</strong><br/>
                ${esc([order.governorate, order.area, order.block && "Block " + order.block, order.street, order.building, order.address_line].filter(Boolean).join(", "))}
                ${order.notes ? `<br/><em>Notes: ${esc(order.notes)}</em>` : ""}
              </div>`
            : ""
        }
      </div>
    </div>
    <p style="text-align:center;color:#999;font-size:11px;margin-top:16px;">Sent automatically on payment confirmation.</p>
  </div>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { mode, order_id, test_to } = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: settingRow } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "order_email")
      .maybeSingle();
    const cfg = (settingRow?.value as OrderEmailSettings) ?? {};

    if (cfg.enabled === false) {
      return json({ skipped: true, reason: "disabled" });
    }

    const host = (cfg.smtp_host ?? "").trim();
    const user = (cfg.smtp_user ?? "").trim();
    const pass = (cfg.smtp_pass ?? "").trim();
    const port = Number(cfg.smtp_port ?? 587) || 587;
    const fromEmail = (cfg.from_email ?? user).trim();
    if (!host || !user || !pass || !fromEmail) {
      return json({ skipped: true, reason: "smtp_not_configured" });
    }

    // Recipients
    const to = (cfg.to ?? "").trim();
    const cc = Array.isArray(cfg.cc) ? cfg.cc.filter((x) => x && x.includes("@")) : [];
    const primary = mode === "test" ? (test_to || to) : to;
    if (!primary) return json({ skipped: true, reason: "no_recipient" });

    let subject = "";
    let html = "";
    if (mode === "test") {
      subject = "✅ Curemed test email";
      html = `<div style="font-family:Arial;padding:24px;">
        <h2>SMTP is working 🎉</h2>
        <p>This is a test message from your Curemed admin dashboard.</p>
      </div>`;
    } else {
      if (!order_id) return json({ error: "order_id required" }, 400);
      const { data: order } = await admin.from("orders").select("*").eq("id", order_id).maybeSingle();
      if (!order) return json({ error: "Order not found" }, 404);
      const { data: items } = await admin
        .from("order_items")
        .select("*")
        .eq("order_id", order_id);
      subject = `New paid order #${order.order_number} — KD ${money(order.total)}`;
      html = buildHtml(order, items ?? []);
    }

    const client = new SMTPClient({
      connection: {
        hostname: host,
        port,
        tls: cfg.smtp_secure === true || port === 465,
        auth: { username: user, password: pass },
      },
    });

    const fromName = (cfg.from_name ?? "Curemed").trim();
    await client.send({
      from: `${fromName} <${fromEmail}>`,
      to: primary,
      cc: cc.length ? cc : undefined,
      subject,
      content: "auto",
      html,
    });
    await client.close();

    return json({ ok: true, to: primary, cc });
  } catch (err) {
    console.error("send-order-email error:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
