// Order-confirmation email templates, tokens and renderer.
//
// IMPORTANT: this module must stay dependency-free (no `npm:` / `https:`
// specifiers). It is mirrored verbatim into `src/lib/orderEmailTemplate.ts` so
// the admin dashboard can render an identical preview, and the parity test
// `src/lib/orderEmailTemplate.test.ts` fails if the two copies drift.
//
// ESCAPING CONTRACT
// Every token is HTML-escaped when the token map is *built* (`buildOrderTokens`).
// `items_rows` and `address_block` are the only exceptions: they are HTML
// fragments assembled here from already-escaped parts. `renderTemplate` is a
// dumb string replace and never escapes — so a template author can rely on
// tokens being safe, and we never double-escape.

export type EmailLang = "ar" | "en";
export type EmailAudience = "customer" | "admin";
export type TemplateKey = `${EmailAudience}_${EmailLang}`;

export const TEMPLATE_KEYS: TemplateKey[] = [
  "customer_en",
  "customer_ar",
  "admin_en",
  "admin_ar",
];

/** Every placeholder a template may use. Surfaced in the admin UI as chips. */
export const ORDER_EMAIL_TOKENS = [
  "order_number",
  "order_date",
  "customer_name",
  "customer_email",
  "customer_phone",
  "payment_method",
  "subtotal",
  "discount_amount",
  "coupon_code",
  "total",
  "currency",
  "items_rows",
  "items_summary",
  "address_block",
  "notes",
  "invoice_url",
  "storefront_url",
  "store_name",
  "year",
] as const;

export type OrderEmailToken = (typeof ORDER_EMAIL_TOKENS)[number];
export type TokenMap = Record<string, string>;

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function money(n: unknown): string {
  const num = Number(n ?? 0);
  return Number.isFinite(num) ? num.toFixed(3) : "0.000";
}

/**
 * Replace `{{token}}` placeholders. Unknown tokens are replaced with "" rather
 * than left in place — a customer must never receive a raw `{{token}}`.
 */
export function renderTemplate(template: string, tokens: TokenMap): string {
  return String(template ?? "").replace(
    /\{\{(\w+)\}\}/g,
    (_m, name: string) => tokens[name] ?? "",
  );
}

const LABELS: Record<EmailLang, Record<string, string>> = {
  en: {
    product: "Product",
    qty: "Qty",
    price: "Price",
    lineTotal: "Total",
    delivery: "Delivery address",
    notes: "Notes",
  },
  ar: {
    product: "المنتج",
    qty: "الكمية",
    price: "السعر",
    lineTotal: "الإجمالي",
    delivery: "عنوان التوصيل",
    notes: "ملاحظات",
  },
};

const CELL = "padding:10px 12px;border-bottom:1px solid #eeeeee;font-size:13px;";

function buildItemsRows(items: OrderItemLike[], lang: EmailLang): string {
  const align = lang === "ar" ? "right" : "left";
  return items
    .map(
      (it) => `<tr>
<td style="${CELL}text-align:${align};">${esc(it.product_name_snapshot)}</td>
<td style="${CELL}text-align:center;">${esc(it.quantity)}</td>
<td style="${CELL}text-align:right;">${money(it.unit_price)}</td>
<td style="${CELL}text-align:right;font-weight:600;">${money(it.line_total)}</td>
</tr>`,
    )
    .join("\n");
}

function buildAddressBlock(order: OrderLike, lang: EmailLang): string {
  const parts = [
    order.governorate,
    order.area,
    order.block ? `Block ${order.block}` : "",
    order.street,
    order.building,
    order.address_line,
  ].filter((p) => String(p ?? "").trim().length > 0);

  if (parts.length === 0) return "";

  const l = LABELS[lang];
  const dir = lang === "ar" ? "right" : "left";
  const notes = String(order.notes ?? "").trim();

  return `<div style="margin-top:18px;padding:14px 16px;background:#f6f7fb;border-radius:10px;font-size:13px;color:#444444;text-align:${dir};">
<strong>${esc(l.delivery)}</strong><br/>
${esc(parts.join(", "))}
${notes ? `<br/><em>${esc(l.notes)}: ${esc(notes)}</em>` : ""}
</div>`;
}

export interface OrderItemLike {
  product_name_snapshot?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
}

export interface OrderLike {
  order_number?: string | null;
  created_at?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  payment_method?: string | null;
  payment_online_method?: string | null;
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  coupon_code?: string | null;
  total?: number | string | null;
  governorate?: string | null;
  area?: string | null;
  block?: string | null;
  street?: string | null;
  building?: string | null;
  address_line?: string | null;
  notes?: string | null;
}

export interface BuildTokenOptions {
  lang: EmailLang;
  storefrontUrl?: string;
  storeName?: string;
  currency?: string;
}

export function buildOrderTokens(
  order: OrderLike,
  items: OrderItemLike[],
  opts: BuildTokenOptions,
): TokenMap {
  const lang = opts.lang;
  const storefront = String(opts.storefrontUrl ?? "").replace(/\/+$/, "");
  const orderNumber = String(order.order_number ?? "");
  const currency = opts.currency ?? "KD";

  const orderDate = order.created_at
    ? new Date(order.created_at).toISOString().slice(0, 10)
    : "";

  const itemsSummary = items
    .map((it) => `• ${it.product_name_snapshot} x${it.quantity}`)
    .join("\n");

  return {
    order_number: esc(orderNumber),
    order_date: esc(orderDate),
    customer_name: esc(order.customer_name),
    customer_email: esc(order.customer_email),
    customer_phone: esc(order.customer_phone),
    payment_method: esc(order.payment_online_method || order.payment_method || "—"),
    subtotal: esc(money(order.subtotal)),
    discount_amount: esc(money(order.discount_amount)),
    coupon_code: esc(order.coupon_code ?? ""),
    total: esc(money(order.total)),
    currency: esc(currency),
    // Pre-escaped HTML fragments — see the escaping contract at the top.
    items_rows: buildItemsRows(items, lang),
    address_block: buildAddressBlock(order, lang),
    items_summary: esc(itemsSummary),
    notes: esc(order.notes ?? ""),
    invoice_url: esc(storefront && orderNumber ? `${storefront}/order/${orderNumber}` : ""),
    storefront_url: esc(storefront),
    store_name: esc(opts.storeName ?? "Curemed"),
    year: esc(String(new Date().getFullYear())),
  };
}

/**
 * Plain-text alternative part. We build this explicitly rather than relying on
 * denomailer's `content: "auto"` so the text/plain body is predictable, and so
 * spam filters see a real multipart alternative.
 */
export function buildPlainText(tokens: TokenMap, lang: EmailLang): string {
  const isAr = lang === "ar";
  // Tokens arrive HTML-escaped (see the escaping contract). text/plain must
  // carry the raw characters, so EVERY interpolated token is unescaped here —
  // otherwise a customer named "Ali & Sons" reads as "Ali &amp; Sons".
  const t = (name: string) => unescapeForText(tokens[name] ?? "");
  const lines = [
    isAr ? `طلب رقم ${t("order_number")}` : `Order #${t("order_number")}`,
    "",
    isAr ? `العميل: ${t("customer_name")}` : `Customer: ${t("customer_name")}`,
    isAr ? `الهاتف: ${t("customer_phone")}` : `Phone: ${t("customer_phone")}`,
    "",
    t("items_summary"),
    "",
    isAr
      ? `الإجمالي: ${t("currency")} ${t("total")}`
      : `Total: ${t("currency")} ${t("total")}`,
  ];
  if (tokens.invoice_url) lines.push("", t("invoice_url"));
  return lines.join("\n");
}

/** Reverse `esc()` for the text/plain part, where entities must not appear. */
function unescapeForText(v: string): string {
  return String(v ?? "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

export const DEFAULT_SUBJECTS: Record<TemplateKey, string> = {
  customer_en: "Your {{store_name}} order #{{order_number}} is confirmed",
  customer_ar: "تم تأكيد طلبك رقم #{{order_number}} من {{store_name}}",
  admin_en: "New paid order #{{order_number}} — {{currency}} {{total}}",
  admin_ar: "طلب جديد مدفوع #{{order_number}} — {{currency}} {{total}}",
};

/** Shared shell so all four documents stay visually consistent. */
function shell(opts: {
  lang: EmailLang;
  heading: string;
  intro: string;
  showCustomerBlock: boolean;
  footer: string;
}): string {
  const { lang, heading, intro, showCustomerBlock, footer } = opts;
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const align = isAr ? "right" : "left";
  const l = LABELS[lang];

  const customerRows = showCustomerBlock
    ? `<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;margin-bottom:18px;">
<tr><td style="padding:4px 0;color:#666666;">${isAr ? "العميل" : "Customer"}</td><td style="padding:4px 0;text-align:${isAr ? "left" : "right"};font-weight:600;">{{customer_name}}</td></tr>
<tr><td style="padding:4px 0;color:#666666;">${isAr ? "البريد" : "Email"}</td><td style="padding:4px 0;text-align:${isAr ? "left" : "right"};">{{customer_email}}</td></tr>
<tr><td style="padding:4px 0;color:#666666;">${isAr ? "الهاتف" : "Phone"}</td><td style="padding:4px 0;text-align:${isAr ? "left" : "right"};">{{customer_phone}}</td></tr>
<tr><td style="padding:4px 0;color:#666666;">${isAr ? "الدفع" : "Payment"}</td><td style="padding:4px 0;text-align:${isAr ? "left" : "right"};">{{payment_method}}</td></tr>
</table>`
    : "";

  return `<!doctype html>
<html dir="${dir}" lang="${lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{{store_name}} — {{order_number}}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;direction:${dir};">
<div style="max-width:620px;margin:0 auto;padding:24px;">
<div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #eaeaea;">

<div style="background:linear-gradient(135deg,#0ea5e9,#8b5cf6,#ec4899);padding:24px 28px;color:#ffffff;text-align:${align};">
<h1 style="margin:0;font-size:22px;">${heading}</h1>
<p style="margin:6px 0 0;opacity:.9;font-size:13px;">${isAr ? "طلب رقم" : "Order"} #{{order_number}} · {{order_date}}</p>
</div>

<div style="padding:24px 28px;text-align:${align};">
<p style="margin:0 0 18px;font-size:14px;line-height:1.6;">${intro}</p>

${customerRows}

<table role="presentation" width="100%" style="border-collapse:collapse;">
<thead>
<tr style="background:#f6f7fb;">
<th style="padding:10px 12px;text-align:${align};font-size:12px;color:#555555;">${esc(l.product)}</th>
<th style="padding:10px 12px;text-align:center;font-size:12px;color:#555555;">${esc(l.qty)}</th>
<th style="padding:10px 12px;text-align:right;font-size:12px;color:#555555;">${esc(l.price)}</th>
<th style="padding:10px 12px;text-align:right;font-size:12px;color:#555555;">${esc(l.lineTotal)}</th>
</tr>
</thead>
<tbody>
{{items_rows}}
</tbody>
</table>

<table role="presentation" width="100%" style="border-collapse:collapse;margin-top:14px;font-size:14px;">
<tr><td style="padding:3px 0;color:#666666;">${isAr ? "المجموع الفرعي" : "Subtotal"}</td><td style="padding:3px 0;text-align:${isAr ? "left" : "right"};">{{currency}} {{subtotal}}</td></tr>
<tr><td style="padding:3px 0;color:#666666;">${isAr ? "الخصم" : "Discount"}</td><td style="padding:3px 0;text-align:${isAr ? "left" : "right"};">- {{currency}} {{discount_amount}}</td></tr>
<tr><td style="padding:10px 0 0;font-size:16px;font-weight:700;">${isAr ? "الإجمالي" : "Total"}</td><td style="padding:10px 0 0;text-align:${isAr ? "left" : "right"};font-size:16px;font-weight:700;">{{currency}} {{total}}</td></tr>
</table>

{{address_block}}
</div>
</div>

<p style="text-align:center;color:#999999;font-size:11px;margin-top:16px;line-height:1.6;">
${footer}<br/>© {{year}} {{store_name}}
</p>
</div>
</body>
</html>`;
}

/**
 * Representative order used by the admin live preview and by `mode:"test"`
 * sends that do not name a real order. Lives here so the preview and the test
 * email are rendered from identical data.
 */
export const SAMPLE_ORDER: OrderLike = {
  order_number: "CM-10432",
  created_at: "2026-08-09T10:24:00.000Z",
  customer_name: "Sara Al-Ali",
  customer_email: "sara@example.com",
  customer_phone: "+96550123456",
  payment_method: "pay_by_link",
  payment_online_method: "KNET",
  subtotal: 24.5,
  discount_amount: 2.5,
  coupon_code: "WELCOME10",
  total: 22,
  governorate: "Hawalli",
  area: "Salmiya",
  block: "12",
  street: "Amman St",
  building: "7",
  address_line: "Apt 3",
  notes: "Please call on arrival",
};

export const SAMPLE_ITEMS: OrderItemLike[] = [
  {
    product_name_snapshot: "Kapiva Shilajit Gold — 30 Capsules",
    quantity: 1,
    unit_price: 14.5,
    line_total: 14.5,
  },
  {
    product_name_snapshot: "Vitamin D3 5000 IU — 60 Softgels",
    quantity: 2,
    unit_price: 5,
    line_total: 10,
  },
];

/** Token map built from the sample order, in the requested language. */
export function sampleTokens(lang: EmailLang, storefrontUrl = ""): TokenMap {
  return buildOrderTokens(SAMPLE_ORDER, SAMPLE_ITEMS, { lang, storefrontUrl });
}

export const DEFAULT_TEMPLATES: Record<TemplateKey, string> = {
  customer_en: shell({
    lang: "en",
    heading: "Thank you for your order",
    intro:
      "Hi {{customer_name}}, we&#39;ve received your payment and your order is confirmed. Here is a summary of what you ordered.",
    showCustomerBlock: false,
    footer: "Questions? Just reply to this email.",
  }),
  customer_ar: shell({
    lang: "ar",
    heading: "شكراً لطلبك",
    intro:
      "مرحباً {{customer_name}}، لقد استلمنا دفعتك وتم تأكيد طلبك. فيما يلي ملخص لطلبك.",
    showCustomerBlock: false,
    footer: "لأي استفسار، يرجى الرد على هذا البريد.",
  }),
  admin_en: shell({
    lang: "en",
    heading: "New paid order",
    intro: "A new order has been paid and confirmed.",
    showCustomerBlock: true,
    footer: "Sent automatically on payment confirmation.",
  }),
  admin_ar: shell({
    lang: "ar",
    heading: "طلب جديد مدفوع",
    intro: "تم دفع وتأكيد طلب جديد.",
    showCustomerBlock: true,
    footer: "تم الإرسال تلقائياً عند تأكيد الدفع.",
  }),
};
