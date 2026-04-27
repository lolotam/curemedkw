import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  ArrowRight,
  Sparkles,
  ReceiptText,
  Tag,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { BRANDS } from "@/lib/brands";
import type { BrandKey } from "@/lib/db";
import { CouponInput, type AppliedCoupon } from "@/components/site/CouponInput";
import {
  ColorfulHeroBg,
  GlowCard,
  Icon3D,
  Reveal,
} from "@/components/site/ColorfulFx";
import { cn } from "@/lib/utils";

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
        <section className="relative overflow-hidden py-24 md:py-32">
          <ColorfulHeroBg />
          <div className="container max-w-xl text-center">
            <Reveal>
              <div className="flex justify-center">
                <Icon3D icon={ShoppingBag} variant="violet" size="lg" />
              </div>
              <h1 className="mt-6 text-4xl md:text-5xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
                  {t("cart.empty.title")}
                </span>
              </h1>
              <p className="mt-4 text-base md:text-lg text-muted-foreground">
                {t("cart.empty.body")}
              </p>
              <Button
                asChild
                size="lg"
                className="mt-8 rounded-full bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105 transition-all"
              >
                <Link to="/curemed">
                  <Sparkles className="h-4 w-4 mr-2" />
                  {t("cart.empty.cta")}
                </Link>
              </Button>
            </Reveal>
          </div>
        </section>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden py-16 md:py-20">
        <ColorfulHeroBg />
        <div className="container">
          <div className="animate-fade-in flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand backdrop-blur-md shadow-sm">
              <ShoppingBag className="h-3.5 w-3.5" />
              {t("cart.title")}
            </span>
          </div>
          <h1 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight animate-fade-in [animation-delay:120ms]">
            <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
              {t("cart.title")}
            </span>
          </h1>
          <p className="mt-3 text-base md:text-lg text-muted-foreground animate-fade-in [animation-delay:200ms]">
            {items.length} {items.length === 1 ? t("cart.itemSingular") : t("cart.itemPlural")}
          </p>
        </div>
      </section>

      {/* ===================== ITEMS + SUMMARY ===================== */}
      <section className="container pb-20 md:pb-24">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {items.map((item, i) => {
              const brand = BRANDS[item.brand as BrandKey];
              const name = lang === "ar" && item.nameAr ? item.nameAr : item.name;
              const variants = ["sky", "violet", "emerald", "amber", "rose", "indigo", "cyan"] as const;
              const v = variants[i % variants.length];
              return (
                <Reveal key={item.productId} delay={i * 60}>
                  <GlowCard variant={v} className="p-4 md:p-5 transition-transform duration-500 group-hover:-translate-y-1">
                    <div className="flex gap-4">
                      <Link
                        to={brand ? `/${brand.slug}/product/${item.productId}` : "#"}
                        className="relative h-24 w-24 md:h-28 md:w-28 shrink-0 rounded-2xl overflow-hidden bg-brand-soft ring-1 ring-border/60"
                      >
                        <img
                          src={item.image}
                          alt={name}
                          className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
                        />
                      </Link>
                      <div className="flex-1 min-w-0">
                        {brand && (
                          <p className="text-[11px] uppercase font-semibold tracking-wider bg-gradient-to-r from-sky-500 to-violet-500 bg-clip-text text-transparent">
                            {brand.name}
                          </p>
                        )}
                        <Link
                          to={brand ? `/${brand.slug}/product/${item.productId}` : "#"}
                          className="block font-semibold line-clamp-2 hover:text-brand transition-colors"
                        >
                          {name}
                        </Link>
                        <p className="text-sm font-bold mt-1 text-foreground/80">
                          KD {item.price.toFixed(2)}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                          <div className="inline-flex items-center rounded-full border border-border bg-background/80 backdrop-blur shadow-sm overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setQuantity(item.productId, item.quantity - 1)}
                              className="h-9 w-9 inline-flex items-center justify-center hover:bg-gradient-to-br hover:from-sky-500 hover:to-violet-500 hover:text-white transition-all"
                              aria-label={t("cart.decrease")}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-10 text-center text-sm font-bold">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => setQuantity(item.productId, item.quantity + 1)}
                              className="h-9 w-9 inline-flex items-center justify-center hover:bg-gradient-to-br hover:from-violet-500 hover:to-pink-500 hover:text-white transition-all"
                              aria-label={t("cart.increase")}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-base font-extrabold bg-gradient-to-r from-sky-500 to-violet-500 bg-clip-text text-transparent">
                              KD {(item.price * item.quantity).toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() => remove(item.productId)}
                              className="h-9 w-9 inline-flex items-center justify-center rounded-full text-destructive hover:bg-destructive/10 transition-colors"
                              aria-label={t("cart.remove")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </GlowCard>
                </Reveal>
              );
            })}

            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={clear}
                className="rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                {t("cart.clear")}
              </Button>
            </div>
          </div>

          {/* Summary */}
          <aside className="h-fit lg:sticky lg:top-28">
            <Reveal delay={150}>
              <GlowCard variant="violet" className="p-6 md:p-7">
                <div className="flex items-center gap-3 mb-5">
                  <Icon3D icon={ReceiptText} variant="violet" size="sm" />
                  <h2 className="font-bold text-lg">
                    <span className="bg-gradient-to-r from-violet-500 to-pink-500 bg-clip-text text-transparent">
                      {t("cart.summary")}
                    </span>
                  </h2>
                </div>

                <div className="mb-5">
                  <CouponInput
                    subtotal={subtotal}
                    applied={applied}
                    onApply={(a) => { setApplied(a); saveCoupon(a); }}
                    onRemove={() => { setApplied(null); saveCoupon(null); }}
                  />
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                    <span className="font-semibold">KD {subtotal.toFixed(2)}</span>
                  </div>
                  {applied && (
                    <div className="flex justify-between items-center rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 px-3 py-2 border border-emerald-500/20">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        <Tag className="h-3.5 w-3.5" />
                        {applied.coupon.code}
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        −KD {discount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Truck className="h-3.5 w-3.5" />
                      {t("cart.shipping")}
                    </span>
                    <span className="text-xs text-muted-foreground">{t("cart.shippingNote")}</span>
                  </div>
                  <div className="border-t border-border/60 pt-4 mt-2 flex justify-between items-baseline">
                    <span className="font-semibold text-base">{t("cart.total")}</span>
                    <span className="font-extrabold text-2xl bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
                      KD {total.toFixed(2)}
                    </span>
                  </div>
                </div>

                <Button
                  size="lg"
                  className={cn(
                    "mt-6 w-full rounded-full font-semibold text-white",
                    "bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500",
                    "shadow-lg shadow-violet-500/30 hover:shadow-violet-500/60",
                    "transition-all duration-300 hover:scale-[1.02]",
                  )}
                  onClick={() => navigate("/checkout")}
                >
                  {t("cart.checkout")}
                  <ArrowRight className="h-4 w-4 ml-2 rtl:rotate-180" />
                </Button>
              </GlowCard>
            </Reveal>
          </aside>
        </div>
      </section>
    </SiteLayout>
  );
}