// E-commerce availability flags — the "ministry hold" switch.
//
// Curemed sells regulated products, so trading may have to stop until a
// ministry permit is granted. These flags let an admin close the buying path
// without unpublishing the catalogue: the site stays a browsable brochure.
//
// This module is deliberately free of React and Supabase imports so the
// resolution rules can be unit-tested directly and reused anywhere.

export const ECOMMERCE_MODE_KEY = "ecommerce_mode";

export interface EcommerceMode {
  /** Master switch. When off, every buying affordance is closed at once. */
  shoppingEnabled: boolean;
  /** Show "Add to cart" buttons across the storefront. */
  addToCartEnabled: boolean;
  /** Allow an order to be placed and paid for. */
  checkoutEnabled: boolean;
  /** Shopper-facing explanation, shown while any part of buying is closed. */
  noticeEn: string;
  noticeAr: string;
}

// Everything defaults ON, so a site with no `ecommerce_mode` row behaves
// exactly as it did before this feature existed. The same default is encoded
// in the RLS policy (see migration 20260809210000).
export const DEFAULT_ECOMMERCE_MODE: EcommerceMode = {
  shoppingEnabled: true,
  addToCartEnabled: true,
  checkoutEnabled: true,
  noticeEn: "",
  noticeAr: "",
};

export const DEFAULT_HOLD_NOTICE = {
  en: "Online ordering is temporarily unavailable while we complete Ministry of Health approval. Browse our products and contact us to order.",
  ar: "الطلب عبر الموقع متوقف مؤقتاً لحين استكمال موافقة وزارة الصحة. يمكنك تصفح منتجاتنا والتواصل معنا للطلب.",
};

export interface EcommerceGates {
  /** The stored settings with defaults filled in. */
  mode: EcommerceMode;
  /** Render "Add to cart" affordances. */
  canAddToCart: boolean;
  /** Render the cart icon and allow the checkout page to load. */
  showCart: boolean;
  /** Allow an order to be created and sent for payment. */
  canCheckout: boolean;
  /** True when any part of the buying path is closed — drives the notice banner. */
  isOnHold: boolean;
}

function boolOr(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

function textOr(raw: unknown, fallback: string): string {
  return typeof raw === "string" ? raw : fallback;
}

/**
 * Merges a stored `site_settings.ecommerce_mode` value with the defaults and
 * derives the gates. A missing row, a null, or a partially-saved object all
 * resolve to "trading normally" — the storefront must never break itself
 * because a setting has not been written yet.
 */
export function resolveEcommerceMode(raw: unknown): EcommerceGates {
  const s = (raw ?? {}) as Partial<Record<keyof EcommerceMode, unknown>>;
  const mode: EcommerceMode = {
    shoppingEnabled: boolOr(s.shoppingEnabled, DEFAULT_ECOMMERCE_MODE.shoppingEnabled),
    addToCartEnabled: boolOr(s.addToCartEnabled, DEFAULT_ECOMMERCE_MODE.addToCartEnabled),
    checkoutEnabled: boolOr(s.checkoutEnabled, DEFAULT_ECOMMERCE_MODE.checkoutEnabled),
    noticeEn: textOr(s.noticeEn, DEFAULT_ECOMMERCE_MODE.noticeEn),
    noticeAr: textOr(s.noticeAr, DEFAULT_ECOMMERCE_MODE.noticeAr),
  };

  const canAddToCart = mode.shoppingEnabled && mode.addToCartEnabled;
  const canCheckout = mode.shoppingEnabled && mode.checkoutEnabled;

  return {
    mode,
    canAddToCart,
    showCart: mode.shoppingEnabled,
    canCheckout,
    isOnHold: !canAddToCart || !canCheckout,
  };
}

/** The notice to show shoppers, falling back to a written default. */
export function holdNotice(mode: EcommerceMode, lang: "en" | "ar"): string {
  const custom = lang === "ar" ? mode.noticeAr : mode.noticeEn;
  return custom.trim() || (lang === "ar" ? DEFAULT_HOLD_NOTICE.ar : DEFAULT_HOLD_NOTICE.en);
}
