import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Zap,
  Flame,
  HeartPulse,
  Shield,
  Dumbbell,
  Sparkles,
  Star,
  Check,
  MessageCircle,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ImageZoom } from "@/components/site/ImageZoom";
import { AddToCartButton } from "@/components/site/AddToCartButton";
import { ProductReviews } from "@/components/site/ProductReviews";
import { ProductCard } from "@/components/site/ProductCard";
import { AutoCarousel } from "@/components/site/AutoCarousel";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/db";
import type { BrandMeta } from "@/lib/brands";

interface Props {
  product: Product;
  meta: BrandMeta;
  images: string[];
  priceHidden: boolean;
  related: Product[];
}

const STOCK_BADGE: Record<
  Product["stockStatus"],
  { key: string; cls: string }
> = {
  in_stock: {
    key: "common.inStock",
    cls: "bg-green-500/10 text-green-700 dark:text-green-400",
  },
  low_stock: {
    key: "common.lowStock",
    cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  out_of_stock: {
    key: "common.outOfStock",
    cls: "bg-red-500/10 text-red-700 dark:text-red-400",
  },
};

const SHOWCASE = [
  { icon: Sparkles, tKey: "sg.showcase.shilajit.t", dKey: "sg.showcase.shilajit.d" },
  { icon: Star, tKey: "sg.showcase.gold.t", dKey: "sg.showcase.gold.d" },
  { icon: HeartPulse, tKey: "sg.showcase.kesar.t", dKey: "sg.showcase.kesar.d" },
] as const;

const ASSET_BASE = "/landing/kapiva-shilajit-gold";
const LANDING_FONT = "'Cairo', system-ui, sans-serif";

const BENEFITS = [
  {
    id: "recovery",
    icon: HeartPulse,
    tKey: "sg.benefits.recovery.t",
    dKey: "sg.benefits.recovery.d",
    image: `${ASSET_BASE}/benefit-faster-recovery.png`,
  },
  {
    id: "immunity",
    icon: Shield,
    tKey: "sg.benefits.immunity.t",
    dKey: "sg.benefits.immunity.d",
    image: `${ASSET_BASE}/benefit-immune-support.png`,
  },
  {
    id: "vitality",
    icon: Flame,
    tKey: "sg.benefits.vitality.t",
    dKey: "sg.benefits.vitality.d",
    image: `${ASSET_BASE}/benefit-vitality-drive.png`,
  },
  {
    id: "stamina-run",
    icon: Dumbbell,
    tKey: "sg.benefits.stamina.t",
    dKey: "sg.benefits.stamina.d",
    image: `${ASSET_BASE}/benefit-stamina-endurance-run.png`,
  },
  {
    id: "stamina-gym",
    icon: Dumbbell,
    tKey: "sg.benefits.stamina.t",
    dKey: "sg.benefits.stamina.d",
    image: `${ASSET_BASE}/benefit-stamina-endurance-gym.png`,
  },
  {
    id: "energy",
    icon: Zap,
    tKey: "sg.benefits.energy.t",
    dKey: "sg.benefits.energy.d",
    image: `${ASSET_BASE}/benefit-sustained-energy.png`,
  },
] as const;

const USER_SHOWCASES = [
  {
    image: `${ASSET_BASE}/showcase-drinking-water.png`,
    titleKey: "sg.reviewShowcase.water.t",
    quoteKey: "sg.reviewShowcase.water.q",
  },
  {
    image: `${ASSET_BASE}/showcase-recommending.png`,
    titleKey: "sg.reviewShowcase.recommend.t",
    quoteKey: "sg.reviewShowcase.recommend.q",
  },
  {
    image: `${ASSET_BASE}/showcase-gym-bag.png`,
    titleKey: "sg.reviewShowcase.gym.t",
    quoteKey: "sg.reviewShowcase.gym.q",
  },
  {
    image: `${ASSET_BASE}/showcase-office-routine.png`,
    titleKey: "sg.reviewShowcase.office.t",
    quoteKey: "sg.reviewShowcase.office.q",
  },
  {
    image: `${ASSET_BASE}/showcase-family-breakfast.png`,
    titleKey: "sg.reviewShowcase.family.t",
    quoteKey: "sg.reviewShowcase.family.q",
  },
  {
    image: `${ASSET_BASE}/showcase-majlis-couple.png`,
    titleKey: "sg.reviewShowcase.majlis.t",
    quoteKey: "sg.reviewShowcase.majlis.q",
  },
] as const;

const FAQS = [
  { q: "sg.faq.q1", a: "sg.faq.a1" },
  { q: "sg.faq.q2", a: "sg.faq.a2" },
  { q: "sg.faq.q3", a: "sg.faq.a3" },
  { q: "sg.faq.q4", a: "sg.faq.a4" },
  { q: "sg.faq.q5", a: "sg.faq.a5" },
  { q: "sg.faq.q6", a: "sg.faq.a6" },
] as const;

const STEPS = [
  { t: "sg.howto.s1.t", d: "sg.howto.s1.d", image: `${ASSET_BASE}/howto-take-one-capsule.png` },
  { t: "sg.howto.s2.t", d: "sg.howto.s2.d", image: `${ASSET_BASE}/howto-with-milk-or-water.png` },
  { t: "sg.howto.s3.t", d: "sg.howto.s3.d", image: `${ASSET_BASE}/howto-after-meal.png` },
] as const;

const TRUST = ["sg.trust.pure", "sg.trust.labTested", "sg.trust.ayurvedic", "sg.trust.kuwait"] as const;

export function ProductLanding({ product, meta, images, priceHidden, related }: Props) {
  const { t, lang } = useI18n();
  const [activeImg, setActiveImg] = useState(0);
  const rootRef = useScrollReveal<HTMLDivElement>(true);

  const isAr = lang === "ar";
  const name = isAr && product.nameAr ? product.nameAr : product.name;
  const shortDesc = isAr && product.shortDescriptionAr ? product.shortDescriptionAr : product.shortDescription;
  const benefits = (
    isAr && product.benefitsAr && product.benefitsAr.length ? product.benefitsAr : product.benefits
  ).filter(Boolean);
  const ingredients = (
    isAr && product.ingredientsAr && product.ingredientsAr.length ? product.ingredientsAr : product.ingredients
  ).filter(Boolean);

  const stock = STOCK_BADGE[product.stockStatus];
  const soldOut = product.stockStatus === "out_of_stock";

  const hasDiscount = !priceHidden &&
    !!product.originalPrice &&
    product.originalPrice > product.price &&
    product.price > 0;
  const pct = hasDiscount
    ? Math.round((1 - product.price / (product.originalPrice as number)) * 100)
    : 0;

  const NavCta = (
    <Button
      asChild
      size="sm"
      className="bg-brand-secondary hover:bg-brand-secondary/90 text-white shadow-sm"
    >
      <a href="#buy">{t("cart.addToCart")}</a>
    </Button>
  );

  return (
    <div ref={rootRef} style={{ fontFamily: LANDING_FONT }}>
      {/* ============ STICKY MINI-NAV ============ */}
      <div className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="container flex h-14 items-center gap-4">
          <Link to={`/${meta.slug}`} className="flex items-center gap-2 shrink-0">
            <img
              src={meta.logo}
              alt={meta.name}
              className="h-7 w-auto object-contain"
              loading="eager"
            />
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-muted-foreground">
            <a href="#overview" className="hover:text-brand transition-colors">{t("sg.nav.overview")}</a>
            <a href="#benefits" className="hover:text-brand transition-colors">{t("sg.nav.benefits")}</a>
            <a href="#ingredients" className="hover:text-brand transition-colors">{t("sg.nav.ingredients")}</a>
            <a href="#reviews" className="hover:text-brand transition-colors">{t("sg.nav.reviews")}</a>
            <a href="#faq" className="hover:text-brand transition-colors">{t("sg.nav.faq")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {!priceHidden && !soldOut && (
              <span className="hidden sm:inline text-sm font-bold text-brand-secondary">
                KD {product.price.toFixed(2)}
              </span>
            )}
            {!priceHidden && !soldOut && NavCta}
          </div>
        </div>
      </div>

      {/* ============ HERO ============ */}
      <section id="overview" className="relative overflow-hidden bg-brand-soft">
        {/* decorative gold halo */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 ltr:right-[-10%] rtl:left-[-10%] h-[28rem] w-[28rem] rounded-full opacity-40 blur-3xl animate-glow-pulse"
          style={{ background: "hsl(var(--brand-secondary) / 0.35)" }}
        />
        <div className="container relative grid lg:grid-cols-2 gap-10 lg:gap-16 items-center py-10 md:py-16 lg:py-20">
          {/* image */}
          <div className="reveal reveal-left order-2 lg:order-1">
            <div className="relative">
              <div
                aria-hidden
                className="absolute inset-0 rounded-[2rem] blur-2xl opacity-50"
                style={{ background: "hsl(var(--brand-secondary) / 0.18)" }}
              />
              <div className="relative aspect-square rounded-[1.75rem] overflow-hidden bg-background border border-border shadow-xl">
                <ImageZoom src={images[activeImg]} alt={name} />
              </div>
              <span className="absolute top-4 ltr:left-4 rtl:right-4 inline-flex items-center gap-1.5 rounded-full bg-brand-secondary px-3 py-1 text-xs font-bold text-white shadow-md">
                <Sparkles className="h-3.5 w-3.5" /> {t("sg.goldTier")}
              </span>
            </div>
            {images.length > 1 && (
              <div className="mt-4 flex gap-2.5 overflow-x-auto no-scrollbar">
                {images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    aria-label={`View image ${i + 1}`}
                    className={cn(
                      "shrink-0 h-20 w-20 rounded-xl overflow-hidden border-2 transition-all bg-background",
                      activeImg === i ? "border-brand-secondary" : "border-border hover:border-brand/40",
                    )}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* copy */}
          <div className="reveal reveal-right order-1 lg:order-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
              {t("sg.hero.eyebrow")}
            </p>
            <h1
              className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold leading-[1.1] tracking-tight"
              style={{ fontFamily: LANDING_FONT }}
            >
              {t("sg.hero.title")}
            </h1>
            <p className="mt-4 text-base sm:text-lg text-foreground/75 max-w-prose" style={{ fontFamily: LANDING_FONT }}>
              {t("sg.hero.subtitle")}
            </p>

            {/* rating row (uses product reviews) */}
            <div className="mt-5 flex items-center gap-3">
              <div className="flex items-center gap-0.5" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-brand-secondary text-brand-secondary" />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">4.8 · {t("sg.nav.reviews")}</span>
            </div>

            {/* price + CTA */}
            <div id="buy" className="mt-7 scroll-mt-24">
              {priceHidden ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <Button asChild size="lg" className="bg-brand hover:bg-brand/90 text-white">
                    <Link to="/contact">
                      <MessageCircle className="h-4 w-4 ltr:mr-2 rtl:ml-2" /> {t("price.contactForPrice")}
                    </Link>
                  </Button>
                  <span className={cn("text-xs font-semibold rounded-full px-2.5 py-1", stock.cls)}>
                    {t(stock.key)}
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-4xl font-bold text-brand" style={{ fontVariantNumeric: "tabular-nums" }}>
                      KD {product.price.toFixed(2)}
                    </span>
                    {hasDiscount && (
                      <>
                        <span className="text-lg line-through text-muted-foreground">
                          KD {(product.originalPrice as number).toFixed(2)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-brand-secondary px-2.5 py-0.5 text-xs font-bold text-white">
                          -{pct}% {t("discount.off")}
                        </span>
                      </>
                    )}
                  </div>
                  {!soldOut && (
                    <div className="max-w-sm">
                      <AddToCartButton product={product} size="lg" fullWidth />
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-xs font-semibold rounded-full px-2.5 py-1", stock.cls)}>
                      {t(stock.key)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* trust strip */}
            <ul className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {TRUST.map((k) => (
                <li key={k} className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                  <Check className="h-3.5 w-3.5 text-brand-secondary shrink-0" />
                  {t(k)}
                </li>
              ))}
            </ul>
            {shortDesc && (
              <p className="mt-6 text-sm text-foreground/70 leading-relaxed">{shortDesc}</p>
            )}
          </div>
        </div>
      </section>

      {/* ============ SHOWCASE — "What makes it Gold" ============ */}
      <section className="relative overflow-hidden bg-brand text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 ltr:left-[-15%] rtl:right-[-15%] h-72 w-72 -translate-y-1/2 rounded-full opacity-25 blur-3xl animate-blob-drift"
          style={{ background: "hsl(var(--brand-secondary))" }}
        />
        <div className="container relative py-16 md:py-24">
          <div className="reveal max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
              {t("sg.showcase.eyebrow")}
            </p>
            <h2
              className="mt-3 text-2xl sm:text-3xl md:text-4xl font-bold leading-tight"
              style={{ fontFamily: LANDING_FONT }}
            >
              {t("sg.showcase.title")}
            </h2>
          </div>
          <div className="mt-12 grid gap-8 md:gap-10 md:grid-cols-3">
            {SHOWCASE.map((item, i) => (
              <div
                key={item.tKey}
                className="reveal group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-colors hover:bg-white/10"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-secondary text-white shadow-md transition-transform group-hover:scale-105">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3
                  className="mt-4 text-lg font-semibold"
                  style={{ fontFamily: LANDING_FONT }}
                >
                  {t(item.tKey)}
                </h3>
                <p className="mt-2 text-sm text-white/75 leading-relaxed">{t(item.dKey)}</p>
              </div>
            ))}
          </div>
          <div className="reveal mt-12 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl shadow-black/20">
            <img
              src={`${ASSET_BASE}/ingredients-banner-clean.png`}
              alt={t("sg.showcase.title")}
              className="aspect-video w-full object-cover"
              loading="lazy"
              width={2688}
              height={1520}
            />
          </div>
        </div>
      </section>

      {/* ============ BENEFITS GRID ============ */}
      <section id="benefits" className="bg-brand-soft scroll-mt-16">
        <div className="container py-16 md:py-24">
          <div className="reveal max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
              {t("sg.benefits.eyebrow")}
            </p>
            <h2
              className="mt-3 text-2xl sm:text-3xl md:text-4xl font-bold leading-tight text-brand"
              style={{ fontFamily: LANDING_FONT }}
            >
              {t("sg.benefits.title")}
            </h2>
          </div>
          <div className="reveal mt-12">
            <AutoCarousel itemBasis="basis-[84%] sm:basis-1/2 lg:basis-1/3" intervalMs={3200}>
              {BENEFITS.map((b) => (
                <div
                  key={b.id}
                  className="group h-full overflow-hidden rounded-2xl border border-border bg-background shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="relative aspect-square overflow-hidden bg-brand-soft">
                    <img
                      src={b.image}
                      alt={t(b.tKey)}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      width={2048}
                      height={2048}
                    />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-brand/75 to-transparent" />
                    <div className="absolute bottom-4 ltr:left-4 rtl:right-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/90 text-brand-secondary shadow-md backdrop-blur">
                      <b.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="font-semibold text-brand">{t(b.tKey)}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{t(b.dKey)}</p>
                  </div>
                </div>
              ))}
            </AutoCarousel>
          </div>

          {/* inline product benefits (from DB) */}
          {benefits.length > 0 && (
            <ul className="reveal mt-8 grid gap-2.5 sm:grid-cols-2">
              {benefits.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-brand-secondary mt-0.5 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ============ INGREDIENTS ============ */}
      {ingredients.length > 0 && (
        <section id="ingredients" className="scroll-mt-16">
          <div className="container py-16 md:py-20">
            <div className="reveal max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
                {t("product.ingredients")}
              </p>
              <h2
                className="mt-3 text-2xl sm:text-3xl font-bold text-brand"
                style={{ fontFamily: LANDING_FONT }}
              >
                {t("sg.showcase.title")}
              </h2>
            </div>
            <div className="reveal mt-8 overflow-hidden rounded-[2rem] border border-border bg-brand-soft shadow-xl">
              <img
                src={`${ASSET_BASE}/ingredients-banner-text.png`}
                alt={t("sg.showcase.title")}
                className="aspect-video w-full object-cover"
                loading="lazy"
                width={2688}
                height={1520}
              />
            </div>
            <div className="reveal mt-6 flex flex-wrap gap-2.5">
              {ingredients.map((ing, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-3.5 py-1.5 text-sm font-medium text-brand"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary" />
                  {ing}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ HOW TO USE ============ */}
      <section className="bg-brand-soft">
        <div className="container py-16 md:py-20">
          <div className="reveal max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
              {t("sg.howto.eyebrow")}
            </p>
            <h2
              className="mt-3 text-2xl sm:text-3xl font-bold text-brand"
              style={{ fontFamily: LANDING_FONT }}
            >
              {t("sg.howto.title")}
            </h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.t}
                className="reveal overflow-hidden rounded-2xl border border-border bg-background shadow-sm"
                style={{ transitionDelay: `${i * 70}ms` }}
              >
                <div className="relative aspect-square overflow-hidden bg-brand-soft">
                  <img
                    src={s.image}
                    alt={t(s.t)}
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                    loading="lazy"
                    width={2048}
                    height={2048}
                  />
                  <div className="absolute top-4 ltr:left-4 rtl:right-4 flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white font-bold text-sm shadow-md">
                    {i + 1}
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-brand">{t(s.t)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(s.d)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ REVIEWS ============ */}
      <section id="reviews" className="scroll-mt-16">
        <div className="container py-16 md:py-20">
          <div className="reveal max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
              {t("sg.reviewShowcase.eyebrow")}
            </p>
            <h2
              className="mt-3 text-2xl sm:text-3xl font-bold text-brand"
              style={{ fontFamily: LANDING_FONT }}
            >
              {t("sg.nav.reviews")}
            </h2>
          </div>
          <div className="reveal mt-10">
            <AutoCarousel itemBasis="basis-[86%] sm:basis-1/2 lg:basis-1/3" intervalMs={3800}>
              {USER_SHOWCASES.map((item) => (
                <article
                  key={item.image}
                  className="h-full overflow-hidden rounded-2xl border border-border bg-background shadow-sm"
                >
                  <img
                    src={item.image}
                    alt={t(item.titleKey)}
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                    width={2336}
                    height={1744}
                  />
                  <div className="p-5">
                    <div className="flex items-center gap-0.5 text-brand-secondary" aria-hidden>
                      {[0, 1, 2, 3, 4].map((star) => (
                        <Star key={star} className="h-3.5 w-3.5 fill-current" />
                      ))}
                    </div>
                    <h3 className="mt-3 font-semibold text-brand">
                      {t(item.titleKey)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground" dir="rtl" lang="ar">
                      {t(item.quoteKey)}
                    </p>
                  </div>
                </article>
              ))}
            </AutoCarousel>
          </div>
          <div className="reveal mt-8">
            <ProductReviews productId={product.id} />
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="faq" className="bg-brand-soft scroll-mt-16">
        <div className="container py-16 md:py-24">
          <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-16">
            <div className="reveal">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
                {t("sg.faq.eyebrow")}
              </p>
              <h2
                className="mt-3 text-2xl sm:text-3xl md:text-4xl font-bold text-brand leading-tight"
                style={{ fontFamily: LANDING_FONT }}
              >
                {t("sg.faq.title")}
              </h2>
            </div>
            <div className="reveal reveal-right">
              <Accordion type="single" collapsible className="rounded-2xl border border-border bg-background px-5">
                {FAQS.map((f, i) => (
                  <AccordionItem key={f.q} value={`item-${i}`} className={cn(i === FAQS.length - 1 && "border-b-0")}>
                    <AccordionTrigger className="text-left font-semibold text-brand hover:no-underline">
                      {t(f.q)}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed">
                      {t(f.a)}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA BAND ============ */}
      {!soldOut && (
        <section className="relative overflow-hidden bg-brand text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                "linear-gradient(120deg, hsl(var(--brand-primary)) 0%, hsl(var(--brand-primary)) 45%, hsl(var(--brand-secondary) / 0.85) 100%)",
            }}
          />
          <div className="container relative py-14 md:py-20 text-center">
            <div className="reveal reveal-scale mx-auto max-w-2xl">
              <h2
                className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight"
                style={{ fontFamily: LANDING_FONT }}
              >
                {t("sg.cta.title")}
              </h2>
              <p className="mt-3 text-white/80">{t("sg.cta.subtitle")}</p>
              <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
                {!priceHidden && (
                  <span className="text-2xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                    KD {product.price.toFixed(2)}
                  </span>
                )}
                {priceHidden ? (
                  <Button asChild size="lg" className="bg-white text-brand hover:bg-white/90">
                    <Link to="/contact">
                      <MessageCircle className="h-4 w-4 ltr:mr-2 rtl:ml-2" /> {t("price.contactForPrice")}
                    </Link>
                  </Button>
                ) : (
                  <AddToCartButton
                    product={product}
                    size="lg"
                    className="bg-white text-brand hover:bg-white/90"
                  />
                )}
                <span className={cn("text-xs font-semibold rounded-full px-2.5 py-1", stock.cls)}>
                  {t(stock.key)}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============ RELATED ============ */}
      {related.length > 0 && (
        <section className="container py-14 md:py-16">
          <div className="reveal mb-8 flex items-center justify-between gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-brand">{t("common.relatedProducts")}</h2>
            <Link
              to={`/${meta.slug}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-secondary hover:underline"
            >
              {t("common.shopAll")} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} compact />
            ))}
          </div>
        </section>
      )}

      {/* ============ STICKY MOBILE BUY BAR ============ */}
      {!soldOut && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] flex items-center gap-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          {priceHidden ? (
            <Button asChild className="w-full bg-brand hover:bg-brand/90 text-white">
              <Link to="/contact">
                <MessageCircle className="h-4 w-4 ltr:mr-2 rtl:ml-2" /> {t("price.contactForPrice")}
              </Link>
            </Button>
          ) : (
            <>
              <div className="flex flex-col leading-tight shrink-0">
                {product.originalPrice && product.originalPrice > product.price && (
                  <span className="text-[10px] line-through text-muted-foreground">
                    KD {product.originalPrice.toFixed(2)}
                  </span>
                )}
                <span className={cn("text-base font-bold text-brand-secondary")}>
                  KD {product.price.toFixed(2)}
                </span>
              </div>
              <div className="flex-1">
                <AddToCartButton product={product} fullWidth />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
