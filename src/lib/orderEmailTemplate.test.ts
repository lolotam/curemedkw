import {
  DEFAULT_SUBJECTS,
  DEFAULT_TEMPLATES,
  TEMPLATE_KEYS,
  buildOrderTokens,
  buildPlainText,
  renderTemplate,
  SAMPLE_ITEMS,
  SAMPLE_ORDER,
  sampleTokens,
  type TemplateKey,
} from "./orderEmailTemplate";

describe("order email templates", () => {
  it.each(TEMPLATE_KEYS)("%s renders with no unreplaced placeholders", (key) => {
    const lang = key.endsWith("_ar") ? "ar" : "en";
    const html = renderTemplate(DEFAULT_TEMPLATES[key], sampleTokens(lang));

    expect(html).not.toMatch(/\{\{\w+\}\}/);
  });

  it.each(TEMPLATE_KEYS)("%s subject renders with no unreplaced placeholders", (key) => {
    const lang = key.endsWith("_ar") ? "ar" : "en";
    const subject = renderTemplate(DEFAULT_SUBJECTS[key], sampleTokens(lang));

    expect(subject).not.toMatch(/\{\{\w+\}\}/);
    expect(subject.trim().length).toBeGreaterThan(0);
  });

  it("Arabic templates declare RTL in the document itself, not the wrapper", () => {
    // The email client only ever receives this HTML — if direction came from the
    // admin preview wrapper, Arabic would look right in the dashboard and wrong
    // in Gmail.
    for (const key of ["customer_ar", "admin_ar"] as TemplateKey[]) {
      expect(DEFAULT_TEMPLATES[key]).toContain('dir="rtl"');
      expect(DEFAULT_TEMPLATES[key]).toContain('lang="ar"');
    }
    for (const key of ["customer_en", "admin_en"] as TemplateKey[]) {
      expect(DEFAULT_TEMPLATES[key]).toContain('dir="ltr"');
    }
  });

  // REGRESSION (2026-08-09): send-order-email read `it.product_name`, but the
  // column is `product_name_snapshot`. Every emailed line item rendered a blank
  // product name. The same typo was live in _shared/apply-payment.ts, which is
  // why admin WhatsApp alerts read "• ×2" with no name.
  it("renders line item names from the snapshot column", () => {
    const html = renderTemplate(DEFAULT_TEMPLATES.customer_en, sampleTokens("en"));

    expect(html).toContain("Kapiva Shilajit Gold — 30 Capsules");
    expect(html).toContain("Vitamin D3 5000 IU — 60 Softgels");
  });

  // REGRESSION (2026-08-09): the old template recomputed the line total as
  // unit_price * quantity, silently discarding any line-level discount.
  it("uses the stored line_total instead of recomputing price times quantity", () => {
    const tokens = buildOrderTokens(
      SAMPLE_ORDER,
      [{ product_name_snapshot: "Discounted", quantity: 4, unit_price: 10, line_total: 25 }],
      { lang: "en" },
    );

    expect(tokens.items_rows).toContain("25.000");
    expect(tokens.items_rows).not.toContain("40.000");
  });

  it("escapes customer-controlled values", () => {
    const tokens = buildOrderTokens(
      { ...SAMPLE_ORDER, customer_name: '<script>alert("x")</script>' },
      SAMPLE_ITEMS,
      { lang: "en" },
    );

    expect(tokens.customer_name).not.toContain("<script>");
    expect(tokens.customer_name).toContain("&lt;script&gt;");
  });

  it("escapes product names coming from the items table", () => {
    const tokens = buildOrderTokens(
      SAMPLE_ORDER,
      [{ product_name_snapshot: "<img onerror=x>", quantity: 1, unit_price: 1, line_total: 1 }],
      { lang: "en" },
    );

    expect(tokens.items_rows).toContain("&lt;img onerror=x&gt;");
    expect(tokens.items_rows).not.toContain("<img onerror");
  });

  it("omits the address block entirely when there is no address", () => {
    const tokens = buildOrderTokens(
      { order_number: "X-1", customer_name: "A" },
      SAMPLE_ITEMS,
      { lang: "en" },
    );

    expect(tokens.address_block).toBe("");
  });

  it("builds invoice_url only when a storefront url is configured", () => {
    expect(buildOrderTokens(SAMPLE_ORDER, [], { lang: "en" }).invoice_url).toBe("");
    expect(
      buildOrderTokens(SAMPLE_ORDER, [], {
        lang: "en",
        storefrontUrl: "https://curemedkw.com/",
      }).invoice_url,
    ).toBe("https://curemedkw.com/order/CM-10432");
  });

  it("replaces unknown placeholders with empty string, never leaving raw tokens", () => {
    expect(renderTemplate("a{{nope}}b", {})).toBe("ab");
  });

  it("plain-text part carries the order details without HTML entities", () => {
    // This is the text/plain alternative every recipient's client may show
    // instead of the HTML, so entities like &amp; must not leak into it.
    const tokens = buildOrderTokens(
      { ...SAMPLE_ORDER, customer_name: "Ali & Sons" },
      SAMPLE_ITEMS,
      { lang: "en", storefrontUrl: "https://curemedkw.com" },
    );
    const text = buildPlainText(tokens, "en");

    expect(text).toContain("CM-10432");
    expect(text).toContain("Kapiva Shilajit Gold");
    expect(text).toContain("22.000");
    expect(text).toContain("https://curemedkw.com/order/CM-10432");
    expect(text).not.toContain("&amp;");
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it("admin templates show the customer contact block, customer templates do not", () => {
    const en = renderTemplate(DEFAULT_TEMPLATES.admin_en, sampleTokens("en"));
    const cust = renderTemplate(DEFAULT_TEMPLATES.customer_en, sampleTokens("en"));

    expect(en).toContain("sara@example.com");
    expect(cust).not.toContain("sara@example.com");
  });
});
