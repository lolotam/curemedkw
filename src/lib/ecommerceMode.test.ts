import {
  DEFAULT_HOLD_NOTICE,
  holdNotice,
  resolveEcommerceMode,
  type EcommerceMode,
} from "@/lib/ecommerceMode";

describe("resolveEcommerceMode", () => {
  // A missing row, an explicit null, and a half-saved object must all leave the
  // storefront trading. Getting this wrong closes the shop for a setting that
  // was simply never written.
  it.each([
    ["absent setting", undefined],
    ["null value", null],
    ["empty object", {}],
    ["partial object", { noticeEn: "hello" }],
  ])("keeps the shop open for %s", (_label, raw) => {
    const gates = resolveEcommerceMode(raw);
    expect(gates.canAddToCart).toBe(true);
    expect(gates.showCart).toBe(true);
    expect(gates.canCheckout).toBe(true);
    expect(gates.isOnHold).toBe(false);
  });

  it.each([
    {
      scenario: "master switch off closes every path",
      stored: { shoppingEnabled: false, addToCartEnabled: true, checkoutEnabled: true },
      canAddToCart: false,
      showCart: false,
      canCheckout: false,
    },
    {
      scenario: "catalogue-only keeps the cart usable for existing items",
      stored: { shoppingEnabled: true, addToCartEnabled: false, checkoutEnabled: true },
      canAddToCart: false,
      showCart: true,
      canCheckout: true,
    },
    {
      scenario: "checkout frozen still allows browsing and adding",
      stored: { shoppingEnabled: true, addToCartEnabled: true, checkoutEnabled: false },
      canAddToCart: true,
      showCart: true,
      canCheckout: false,
    },
  ])("$scenario", ({ stored, canAddToCart, showCart, canCheckout }) => {
    const gates = resolveEcommerceMode(stored);
    expect(gates.canAddToCart).toBe(canAddToCart);
    expect(gates.showCart).toBe(showCart);
    expect(gates.canCheckout).toBe(canCheckout);
    expect(gates.isOnHold).toBe(true);
  });
});

describe("holdNotice", () => {
  const base: EcommerceMode = {
    shoppingEnabled: false,
    addToCartEnabled: false,
    checkoutEnabled: false,
    noticeEn: "",
    noticeAr: "   ",
  };

  it.each([
    ["en" as const, DEFAULT_HOLD_NOTICE.en],
    ["ar" as const, DEFAULT_HOLD_NOTICE.ar],
  ])("falls back to the written default when %s notice is blank", (lang, expected) => {
    expect(holdNotice(base, lang)).toBe(expected);
  });

  it("prefers the admin's own wording", () => {
    expect(holdNotice({ ...base, noticeEn: "Back on 1 September." }, "en")).toBe(
      "Back on 1 September.",
    );
  });
});
