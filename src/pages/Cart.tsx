import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { BRANDS } from "@/lib/brands";
import type { BrandKey } from "@/lib/db";
import { CouponInput, type AppliedCoupon } from "@/components/site/CouponInput";

const COUPON_KEY = "curemed.appliedCoupon";

function loadCoupon(): AppliedCoupon | null {
  try {
    const raw = sessionStorage.getItem(COUPON_KEY);
    return raw ? (JSON.parse(raw) as AppliedCoupon) : null;
  } catch { return null; }
}
function saveCoupon(c: AppliedCoupon | null) {
  if (c) sessionStorage.setItem(COUPON_KEY, JSON.stringify(c));
  else sessionStorage.removeItem(COUPON_KEY);
}

export default function Cart() {
  const { items, subtotal, setQuantity, remove, clear } = useCart();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);

  useEffect(() => { setApplied(loadCoupon()); }, []);
  // If subtotal drops below the coupon's min, drop the coupon automatically.
  useEffect(() => {
    if (applied && subtotal < applied.coupon.minOrderAmount) {
      setApplied(null);
      saveCoupon(null);
    }
  }, [subtotal, applied]);

  const discount = applied ? Math.min(applied.discount, subtotal) : 0;
  const total = Math.max(0, subtotal - discount);

  if (items.length === 0) {
    return (
      <SiteLayout>
        <section className="container py-16 md:py-24">
          <div className="max-w-md mx-auto text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand mb-4">
              <ShoppingBag className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold">{t("cart.empty.title")}</h1>
            <p className="text-muted-foreground mt-2">{t("cart.empty.body")}</p>
            <Button asChild className="mt-6 bg-brand hover:bg-brand/90 text-white">
              <Link to="/curemed">{t("cart.empty.cta")}</Link>
            </Button>
          </div>
        </section>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <section className="container py-10 md:py-14">
        <h1 className="text-3xl font-bold mb-2">{t("cart.title")}</h1>
        <p className="text-muted-foreground mb-8">
          {items.length} {items.length === 1 ? t("cart.itemSingular") : t("cart.itemPlural")}
        </p>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-3">
            {items.map((item) => {
              const brand = BRANDS[item.brand as BrandKey];
              const name = lang === "ar" && item.nameAr ? item.nameAr : item.name;
              return (
                <div
                  key={item.productId}
                  className="flex gap-4 rounded-2xl border border-border bg-card p-4"
                >
                  <Link
                    to={brand ? `/${brand.slug}/product/${item.productId}` : "#"}
                    className="h-24 w-24 shrink-0 rounded-xl overflow-hidden bg-brand-soft"
                  >
                    <img src={item.image} alt={name} className="h-full w-full object-cover" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    {brand && (
                      <p className="text-[11px] uppercase font-semibold text-brand">{brand.name}</p>
                    )}
                    <Link
                      to={brand ? `/${brand.slug}/product/${item.productId}` : "#"}
                      className="font-semibold line-clamp-2 hover:text-brand"
                    >
                      {name}
                    </Link>
                    <p className="text-sm font-bold mt-1">KD {item.price.toFixed(2)}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="inline-flex items-center rounded-full border border-border">
                        <button
                          type="button"
                          onClick={() => setQuantity(item.productId, item.quantity - 1)}
                          className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded-l-full"
                          aria-label={t("cart.decrease")}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-10 text-center text-sm font-semibold">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.productId, item.quantity + 1)}
                          className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded-r-full"
                          aria-label={t("cart.increase")}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold">
                          KD {(item.price * item.quantity).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(item.productId)}
                          className="text-destructive hover:opacity-80"
                          aria-label={t("cart.remove")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="pt-2">
              <Button variant="ghost" size="sm" onClick={clear}>
                {t("cart.clear")}
              </Button>
            </div>
          </div>

          <aside className="rounded-2xl border border-border bg-card p-6 h-fit lg:sticky lg:top-28">
            <h2 className="font-bold text-lg mb-4">{t("cart.summary")}</h2>
            <div className="mb-4">
              <CouponInput
                subtotal={subtotal}
                applied={applied}
                onApply={(a) => { setApplied(a); saveCoupon(a); }}
                onRemove={() => { setApplied(null); saveCoupon(null); }}
              />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                <span className="font-semibold">KD {subtotal.toFixed(2)}</span>
              </div>
              {applied && (
                <div className="flex justify-between text-brand">
                  <span>{t("coupon.discount")} ({applied.coupon.code})</span>
                  <span className="font-semibold">−KD {discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("cart.shipping")}</span>
                <span className="text-xs text-muted-foreground">{t("cart.shippingNote")}</span>
              </div>
              <div className="border-t border-border pt-3 mt-3 flex justify-between text-base">
                <span className="font-semibold">{t("cart.total")}</span>
                <span className="font-bold">KD {total.toFixed(2)}</span>
              </div>
            </div>
            <Button
              className="mt-5 w-full bg-brand hover:bg-brand/90 text-white"
              onClick={() => navigate("/checkout")}
            >
              {t("cart.checkout")} <ArrowRight className="h-4 w-4 ml-2 rtl:rotate-180" />
            </Button>
          </aside>
        </div>
      </section>
    </SiteLayout>
  );
}