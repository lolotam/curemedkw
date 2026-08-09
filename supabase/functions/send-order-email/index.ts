// Send order-confirmation email via admin-configured SMTP (denomailer).
//
// Public endpoint (verify_jwt = false) — gated server-side via site_settings
// ("order_email"), which is admin-RLS protected and editable from
// /admin/order-email. SMTP credentials live in the database so they can be
// rotated without a deploy; ORDER_EMAIL_SMTP_* env vars act as a fallback.
//
// Two independent legs are sent per order:
//   customer -> the address on the order, never cc'd (that would disclose
//               internal admin addresses to the customer)
//   admin    -> settings.admin_emails, first as To and the rest as Cc
//
// The dispatcher (_shared/apply-payment.ts) invokes this fire-and-forget under
// Promise.allSettled, so an HTTP status it never reads carries no information.
// Per-leg outcomes are therefore returned in `results` and persisted to
// order_email_logs, and a partial failure still responds 200.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { handleOptions, jsonError, jsonResponse } from "../_shared/cors.ts";
import {
  buildOrderTokens,
  buildPlainText,
  DEFAULT_SUBJECTS,
  DEFAULT_TEMPLATES,
  renderTemplate,
  SAMPLE_ITEMS,
  SAMPLE_ORDER,
  type EmailAudience,
  type EmailLang,
  type OrderItemLike,
  type OrderLike,
  type TemplateKey,
} from "../_shared/order-email-template.ts";

const BodySchema = z.object({
  mode: z.enum(["order", "test"]).default("order"),
  order_id: z.string().uuid().optional(),
  audience: z.enum(["customer", "admin", "both"]).default("both"),
  lang: z.enum(["ar", "en"]).optional(),
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
  reply_to?: string;
  storefront_url?: string;
  /** Legacy single recipient — still honoured when admin_emails is empty. */
  to?: string;
  /** Legacy carbon copies — still honoured when admin_emails is empty. */
  cc?: string[];
  admin_emails?: string[];
  notify_customer?: boolean;
  notify_admins?: boolean;
  customer_language?: EmailLang;
  admin_language?: EmailLang;
  subjects?: Partial<Record<TemplateKey, string>>;
  templates?: Partial<Record<TemplateKey, string>>;
}

interface LegResult {
  audience: EmailAudience;
  lang: EmailLang;
  to: string;
  cc: string[];
  status: "sent" | "failed" | "skipped";
  error: string | null;
  reason?: string;
}

/** One email to actually send: an audience, a language and an envelope. */
interface Leg {
  audience: EmailAudience;
  lang: EmailLang;
  to: string[];
  cc: string[];
}

interface SmtpConfig {
  host: string;
  user: string;
  pass: string;
  port: number;
  /** True only when the port expects TLS from the first byte (implicit TLS). */
  implicitTls: boolean;
  fromEmail: string;
  /** Doubles as the From display name and the {{store_name}} token. */
  storeName: string;
  replyTo?: string;
}

interface OrderContext {
  order: OrderLike;
  items: OrderItemLike[];
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface PlanLegsInput {
  cfg: OrderEmailSettings;
  mode: "order" | "test";
  audience: "customer" | "admin" | "both";
  langOverride?: EmailLang;
  testTo?: string;
  customerEmail: string;
}

function cleanEmails(values: unknown[]): string[] {
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? "").trim().toLowerCase();
    if (value.includes("@")) seen.add(value);
  }
  return [...seen];
}

/** admin_emails is canonical; fall back to the legacy to/cc pair. */
function resolveAdminEmails(cfg: OrderEmailSettings): string[] {
  if (Array.isArray(cfg.admin_emails) && cfg.admin_emails.length > 0) {
    return cleanEmails(cfg.admin_emails);
  }
  return cleanEmails([cfg.to ?? "", ...(Array.isArray(cfg.cc) ? cfg.cc : [])]);
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    console.error("send-order-email: method_not_allowed");
    return jsonError(req, "method_not_allowed", "Method not allowed.", 405);
  }

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      console.error("send-order-email: invalid_request_body");
      return jsonError(req, "invalid_request_body", "Invalid request body.", 400);
    }
    const { mode, order_id, audience, lang: langOverride, test_to } = parsed.data;

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
      return jsonResponse(req, { success: true, skipped: true, reason: "disabled" });
    }

    const smtp = resolveSmtp(cfg);
    if (!smtp) {
      return jsonResponse(req, { success: true, skipped: true, reason: "smtp_not_configured" });
    }

    const context = await loadOrderContext(admin, order_id, mode);
    if (!context) {
      const code = order_id ? "order_not_found" : "order_id_required";
      console.error(`send-order-email: ${code}`);
      return jsonError(req, code, order_id ? "Order not found." : "order_id is required.", order_id ? 404 : 400);
    }

    const { legs, skipped } = planLegs({
      cfg,
      mode,
      audience,
      langOverride,
      testTo: test_to,
      customerEmail: String(context.order.customer_email ?? "").trim().toLowerCase(),
    });
    const results: LegResult[] = [...skipped];

    if (legs.length === 0) {
      return jsonResponse(req, { success: true, skipped: true, reason: "no_recipient", results });
    }

    const client = new SMTPClient({
      connection: {
        hostname: smtp.host,
        port: smtp.port,
        tls: smtp.implicitTls,
        auth: { username: smtp.user, password: smtp.pass },
      },
    });

    try {
      for (const leg of legs) {
        const rendered = renderLeg(leg, context, cfg, smtp.storeName);
        const result = await sendLeg(client, leg, rendered, smtp);
        results.push(result);
        await logSend(admin, { orderId: order_id ?? null, leg, subject: rendered.subject, result });
      }
    } finally {
      // close() is typed `void | Promise<void>`; awaiting it inside its own
      // try keeps a teardown error from masking an otherwise successful send.
      try {
        await client.close();
      } catch (err) {
        console.error("send-order-email: smtp_close_failed:", (err as Error).message);
      }
    }

    return jsonResponse(req, {
      success: true,
      mode,
      order_id: order_id ?? null,
      skipped: false,
      results,
    });
  } catch (err) {
    console.error("send-order-email: unhandled_error:", (err as Error).message);
    return jsonError(req, "unhandled_error", "Unexpected server error.", 500);
  }
});

/** Database config wins; env vars are the fallback for a fresh install. */
function resolveSmtp(cfg: OrderEmailSettings): SmtpConfig | null {
  const host = (cfg.smtp_host || Deno.env.get("ORDER_EMAIL_SMTP_HOST") || "").trim();
  const user = (cfg.smtp_user || Deno.env.get("ORDER_EMAIL_SMTP_USER") || "").trim();
  const pass = (cfg.smtp_pass || Deno.env.get("ORDER_EMAIL_SMTP_PASS") || "").trim();
  const port = Number(cfg.smtp_port ?? Deno.env.get("ORDER_EMAIL_SMTP_PORT") ?? 587) || 587;
  const fromEmail = (cfg.from_email || user).trim();
  if (!host || !user || !pass || !fromEmail) return null;
  // Implicit TLS is a property of the PORT, never a free-standing flag. Sending
  // a TLS ClientHello to 587 (a STARTTLS port) makes the server reply with its
  // plaintext "220" greeting, which the TLS layer reports as the misleading
  // "received corrupt message of type InvalidContentType". Deriving it here
  // means a bad smtp_secure value in settings can no longer break delivery.
  const implicitTls = port === 465 ? true : port === 587 ? false : cfg.smtp_secure === true;
  if (cfg.smtp_secure === true && port !== 465) {
    console.error(`send-order-email: smtp_secure_ignored port=${port} (implicit TLS only on 465)`);
  }
  return {
    host,
    user,
    pass,
    port,
    implicitTls,
    fromEmail,
    storeName: (cfg.from_name || "Curemed").trim(),
    replyTo: cfg.reply_to?.trim() || undefined,
  };
}

/**
 * A test send may name a real order — the cheapest way to prove the template
 * handles real line items — and falls back to the shared sample order.
 * Returns null when the order is required but unavailable.
 */
async function loadOrderContext(
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any, any, any>,
  orderId: string | undefined,
  mode: "order" | "test",
): Promise<OrderContext | null> {
  if (!orderId) {
    return mode === "test" ? { order: SAMPLE_ORDER, items: SAMPLE_ITEMS } : null;
  }
  const { data: orderRow } = await admin
    .from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!orderRow) return null;
  const { data: itemRows } = await admin
    .from("order_items").select("*").eq("order_id", orderId)
    .order("created_at", { ascending: true });
  return { order: orderRow as OrderLike, items: (itemRows ?? []) as OrderItemLike[] };
}

/**
 * Decide which emails to actually send. Everything not sent is returned as a
 * `skipped` result with a reason, so the caller can always explain itself.
 */
function planLegs(input: PlanLegsInput): { legs: Leg[]; skipped: LegResult[] } {
  const { cfg, mode, audience, langOverride, testTo, customerEmail } = input;
  const legs: Leg[] = [];
  const skipped: LegResult[] = [];
  const skip = (a: EmailAudience, lang: EmailLang, reason: string) =>
    skipped.push({ audience: a, lang, to: "", cc: [], status: "skipped", error: null, reason });

  if (audience === "customer" || audience === "both") {
    const lang = langOverride ?? cfg.customer_language ?? "ar";
    // In test mode the customer leg is redirected to testTo and skipped
    // entirely without one — a test must never reach a real customer.
    const recipient = mode === "test" ? String(testTo ?? "").trim() : customerEmail;
    if (cfg.notify_customer === false) skip("customer", lang, "notify_customer_disabled");
    else if (!recipient.includes("@")) {
      skip("customer", lang, mode === "test" ? "test_to_required" : "no_customer_email");
    } else legs.push({ audience: "customer", lang, to: [recipient], cc: [] });
  }

  if (audience === "admin" || audience === "both") {
    const lang = langOverride ?? cfg.admin_language ?? "en";
    const recipients = mode === "test" && testTo ? cleanEmails([testTo]) : resolveAdminEmails(cfg);
    if (cfg.notify_admins === false) skip("admin", lang, "notify_admins_disabled");
    else if (recipients.length === 0) skip("admin", lang, "no_admin_recipient");
    else legs.push({ audience: "admin", lang, to: [recipients[0]], cc: recipients.slice(1) });
  }

  return { legs, skipped };
}

function renderLeg(
  leg: Leg,
  context: OrderContext,
  cfg: OrderEmailSettings,
  storeName: string,
): RenderedEmail {
  const key = `${leg.audience}_${leg.lang}` as TemplateKey;
  const tokens = buildOrderTokens(context.order, context.items, {
    lang: leg.lang,
    storefrontUrl: String(cfg.storefront_url ?? "").trim(),
    storeName,
  });
  return {
    subject: renderTemplate(cfg.subjects?.[key] || DEFAULT_SUBJECTS[key], tokens),
    html: renderTemplate(cfg.templates?.[key] || DEFAULT_TEMPLATES[key], tokens),
    text: buildPlainText(tokens, leg.lang),
  };
}

/** Sends one leg. A failure is returned, never thrown — the other leg must still go. */
async function sendLeg(
  client: SMTPClient,
  leg: Leg,
  rendered: RenderedEmail,
  smtp: SmtpConfig,
): Promise<LegResult> {
  const shape = { audience: leg.audience, lang: leg.lang, to: leg.to.join(", "), cc: leg.cc };
  try {
    await client.send({
      from: `${smtp.storeName} <${smtp.fromEmail}>`,
      to: leg.to,
      cc: leg.cc.length ? leg.cc : undefined,
      replyTo: smtp.replyTo,
      subject: rendered.subject,
      content: rendered.text,
      html: rendered.html,
    });
    return { ...shape, status: "sent", error: null };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error(`send-order-email: send_failed audience=${leg.audience} ${message}`);
    return { ...shape, status: "failed", error: message };
  }
}

/** Best-effort audit row. Never let logging break a successful send. */
async function logSend(
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any, any, any>,
  entry: { orderId: string | null; leg: Leg; subject: string; result: LegResult },
): Promise<void> {
  const { orderId, leg, subject, result } = entry;
  try {
    // order_email_logs post-dates the generated types, so the row shape is
    // asserted here rather than inferred.
    await admin.from("order_email_logs").insert({
      order_id: orderId,
      audience: leg.audience,
      lang: leg.lang,
      recipient: [...leg.to, ...leg.cc].join(", "),
      subject,
      status: result.status,
      error_message: result.error,
    } as never);
  } catch (err) {
    console.error("send-order-email: log_insert_failed:", (err as Error).message);
  }
}
