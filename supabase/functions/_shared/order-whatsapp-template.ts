// Order WhatsApp message templates, tokens and renderer.
//
// Dependency-free so the admin page re-exports this same module (src/lib/orderWhatsAppTemplate.ts):
// the preview there is exactly what order-whatsapp-dispatch sends.

export const ORDER_WHATSAPP_KINDS = ["confirmation", "delivery", "follow_up"] as const;
export type OrderWhatsAppKind = typeof ORDER_WHATSAPP_KINDS[number];
export type OrderWhatsAppLang = "ar" | "en";
export type OrderWhatsAppTemplateKey = `${OrderWhatsAppKind}_${OrderWhatsAppLang}`;

/** Tokens the dispatcher fills for every message (see public.owa_claim_due). */
export const ORDER_WHATSAPP_TOKENS = ["customer_name", "order_number", "total", "currency", "order_url"] as const;
export type OrderWhatsAppTokens = Record<typeof ORDER_WHATSAPP_TOKENS[number], string>;

export const DEFAULT_WHATSAPP_TEMPLATES: Record<OrderWhatsAppTemplateKey, string> = {
  confirmation_en: "Hi {{customer_name}}, thank you for your order #{{order_number}} from Curemed.\nTotal: {{total}} {{currency}}\n{{order_url}}",
  confirmation_ar: "مرحباً {{customer_name}}، شكراً لطلبك رقم #{{order_number}} من Curemed.\nالإجمالي: {{total}} {{currency}}\n{{order_url}}",
  delivery_en: "Hi {{customer_name}}, your order #{{order_number}} has been delivered. We hope you enjoy it!",
  delivery_ar: "مرحباً {{customer_name}}، تم توصيل طلبك رقم #{{order_number}}. نتمنى أن ينال إعجابك!",
  follow_up_en: "Hi {{customer_name}}, how is everything with your order #{{order_number}}? Reply here if you need anything.",
  follow_up_ar: "مرحباً {{customer_name}}، كيف كانت تجربتك مع طلبك رقم #{{order_number}}؟ يسعدنا مساعدتك، فقط رد على هذه الرسالة.",
};

export const SAMPLE_WHATSAPP_TOKENS: OrderWhatsAppTokens = {
  customer_name: "Sara", order_number: "CM-10234", total: "12.500", currency: "KWD",
  order_url: "https://curemedkw.com/order/CM-10234",
};

/** The saved template for a kind and language, or the built-in default when none is saved. */
export function resolveWhatsAppTemplate(saved: unknown, key: OrderWhatsAppTemplateKey): string {
  const value = typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>)[key] : undefined;
  return typeof value === "string" && value.trim() ? value : DEFAULT_WHATSAPP_TEMPLATES[key];
}

/**
 * Replaces `{{token}}` placeholders. An unknown or empty token becomes "" so a customer never receives a
 * raw placeholder. Trailing spaces, runs of blank lines and the line break an empty last token leaves are
 * trimmed. WhatsApp caps text at 4096 characters.
 */
export function renderWhatsAppTemplate(template: string, tokens: Partial<OrderWhatsAppTokens>): string {
  const filled = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, name: string) =>
    String((tokens as Record<string, unknown>)[name] ?? ""));
  return Array.from(filled.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim()).slice(0, 4096).join("");
}
