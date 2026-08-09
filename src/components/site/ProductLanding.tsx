import { useState } from "react";
import { Link } from "react-router-dom";
import { Star, Check, MessageCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageZoom } from "@/components/site/ImageZoom";
import { AddToCartButton } from "@/components/site/AddToCartButton";
import { ProductReviews } from "@/components/site/ProductReviews";
import { ProductCard } from "@/components/site/ProductCard";
import { AutoCarousel } from "@/components/site/AutoCarousel";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useEcommerceGates } from "@/lib/db";
import type { LandingAssets } from "@/lib/landingThemes";
import type { Product } from "@/lib/db";
import type { BrandMeta } from "@/lib/brands";

interface Props {
  product: Product;
  meta: BrandMeta;
  images: string[];
  priceHidden: boolean;
  related: Product[];
  /** Section images uploaded for this product, already resolved and capped. */
  assets: LandingAssets;
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

const LANDING_FONT = "'Cairo', system-ui, sans-serif";

export function ProductLanding({
  product,
  meta,
  images,
  priceHidden,
  related,
  assets,
}: Props) {
  const { t, lang } = useI18n();
  const [activeImg, setActiveImg] = useState(0);
  const rootRef = useScrollReveal<HTMLDivElement>(true);
  // The nav button only scrolls to the buy block, so it has to carry the same
  // label as the button waiting there — otherwise a ministry hold leaves an
  // "Add to cart" prompt above a page that cannot add anything to a cart.
  const { canAddToCart } = useEcommerceGates();

  const isAr = lang === "ar";
  const name = isAr && product.nameAr ? product.nameAr : product.name;
  const category = isAr && product.categoryAr ? product.categoryAr : product.category;
  const shortDesc = isAr && product.shortDescriptionAr ? product.shortDescriptionAr : product.shortDescription;
  const usage = isAr && product.usageAr ? product.usageAr : product.usage;
  const benefits = (
    isAr && product.benefitsAr && product.benefitsAr.length ? product.benefitsAr : product.benefits
  ).filter(Boolean);
  const ingredients = (
    isAr && product.ingredientsAr && product.ingredientsAr.length ? product.ingredientsAr : product.ingredients
  ).filter(Boolean);

  const highlightBanner = assets.highlights?.[0] ?? "";
  const ingredientBanner = assets.ingredients?.[0] ?? "";
  const benefitImages = assets.benefits ?? [];
  const stepImages = assets.howToUse ?? [];
  const reviewImages = assets.reviews ?? [];

  // Benefit cards are captioned by the product's own benefits list. Any benefit
  // past the last uploaded image still has to reach the shopper, so it falls
  // through to the plain list underneath instead of being dropped.
  const listedBenefits = benefits.slice(benefitImages.length);

  const showBenefits = benefitImages.length > 0 || benefits.length > 0;
  const showIngredients = ingredientBanner !== "" || ingredients.length > 0;
  const showSteps = stepImages.length > 0 || usage.trim() !== "";
  const showReviewImages = reviewImages.length > 0;

  const stock = STOCK_BADGE[product.stockStatus];
  const soldOut = product.stockStatus === "out_of_stock";

  const hasDiscount = !priceHidden &&
    !!product.originalPrice &&
    product.originalPrice > product.price &&
    product.price > 0;
  const pct = hasDiscount
    ? Math.round((1 - product.price / (product.originalPrice as number)) * 100)
    : 0;

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
            <a href="#overview" className="hover:text-brand transition-colors">{t("landing.nav.overview")}</a>
            {showBenefits && (
              <a href="#benefits" className="hover:text-brand transition-colors">{t("landing.nav.benefits")}</a>
            )}
            {showIngredients && (
              <a href="#ingredients" className="hover:text-brand transition-colors">{t("landing.nav.ingredients")}</a>
            )}
            <a href="#reviews" className="hover:text-brand transition-colors">{t("landing.nav.reviews")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {!priceHidden && !soldOut && (
              <span className="hidden sm:inline text-sm font-bold text-brand-secondary">
                KD {product.price.toFixed(2)}
              </span>
            )}
            {!priceHidden && !soldOut && (
              <Button
                asChild
                size="sm"
                className="bg-brand-secondary hover:bg-brand-secondary/90 text-white shadow-sm"
              >
                <a href="#buy">{canAddToCart ? t("cart.addToCart") : t("price.contactUs")}</a>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ============ HERO ============ */}
      <section id="overview" className="relative overflow-hidden bg-brand-soft">
        {/* decorative halo */}
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
              {product.featured && (
                <span className="absolute top-4 ltr:left-4 rtl:right-4 inline-flex items-center gap-1.5 rounded-full bg-brand-secondary px-3 py-1 text-xs font-bold text-white shadow-md">
                  <Star className="h-3.5 w-3.5 fill-current" /> {t("common.featured")}
                </span>
              )}
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
              {meta.name}{category ? ` · ${category}` : ""}
            </p>
            <h1
              className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold leading-[1.1] tracking-tight"
              style={{ fontFamily: LANDING_FONT }}
            >
              {name}
            </h1>
            {shortDesc && (
              <p className="mt-4 text-base sm:text-lg text-foreground/75 max-w-prose" style={{ fontFamily: LANDING_FONT }}>
                {shortDesc}
              </p>
            )}

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
          </div>
        </div>
      </section>

      {/* ============ HIGHLIGHT BANNER ============ */}
      {highlightBanner && (
        <section className="relative overflow-hidden bg-brand text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 ltr:left-[-15%] rtl:right-[-15%] h-72 w-72 -translate-y-1/2 rounded-full opacity-25 blur-3xl animate-blob-drift"
            style={{ background: "hsl(var(--brand-secondary))" }}
          />
          <div className="container relative py-16 md:py-24">
            <div className="reveal max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
                {t("landing.highlights.eyebrow")}
              </p>
              <h2
                className="mt-3 text-2xl sm:text-3xl md:text-4xl font-bold leading-tight"
                style={{ fontFamily: LANDING_FONT }}
              >
                {t("landing.highlights.title")}
              </h2>
            </div>
            <div className="reveal mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl shadow-black/20">
              <img
                src={highlightBanner}
                alt={t("landing.highlights.title")}
                className="aspect-video w-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </section>
      )}

      {/* ============ BENEFITS ============ */}
      {showBenefits && (
        <section id="benefits" className="bg-brand-soft scroll-mt-16">
          <div className="container py-16 md:py-24">
            <div className="reveal max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
                {t("landing.benefits.eyebrow")}
              </p>
              <h2
                className="mt-3 text-2xl sm:text-3xl md:text-4xl font-bold leading-tight text-brand"
                style={{ fontFamily: LANDING_FONT }}
              >
                {t("landing.benefits.title")}
              </h2>
            </div>
            {benefitImages.length > 0 && (
              <div className="reveal mt-12">
                <AutoCarousel itemBasis="basis-[84%] sm:basis-1/2 lg:basis-1/3" intervalMs={3200}>
                  {benefitImages.map((src, i) => (
                    <div
                      key={src}
                      className="group h-full overflow-hidden rounded-2xl border border-border bg-background shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                    >
                      <div className="relative aspect-square overflow-hidden bg-brand-soft">
                        <img
                          src={src}
                          alt={benefits[i] ?? ""}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-brand/75 to-transparent" />
                      </div>
                      {benefits[i] && (
                        <div className="p-5">
                          <h3 className="font-semibold text-brand">{benefits[i]}</h3>
                        </div>
                      )}
                    </div>
                  ))}
                </AutoCarousel>
              </div>
            )}

            {listedBenefits.length > 0 && (
              <ul className="reveal mt-8 grid gap-2.5 sm:grid-cols-2">
                {listedBenefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                    <Check className="h-4 w-4 text-brand-secondary mt-0.5 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ============ INGREDIENTS ============ */}
      {showIngredients && (
        <section id="ingredients" className="scroll-mt-16">
          <div className="container py-16 md:py-20">
            <div className="reveal max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
                {t("landing.ingredients.eyebrow")}
              </p>
              <h2
                className="mt-3 text-2xl sm:text-3xl font-bold text-brand"
                style={{ fontFamily: LANDING_FONT }}
              >
                {t("product.ingredients")}
              </h2>
            </div>
            {ingredientBanner && (
              <div className="reveal mt-8 overflow-hidden rounded-[2rem] border border-border bg-brand-soft shadow-xl">
                <img
                  src={ingredientBanner}
                  alt={t("product.ingredients")}
                  className="aspect-video w-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            {ingredients.length > 0 && (
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
            )}
          </div>
        </section>
      )}

      {/* ============ HOW TO USE ============ */}
      {showSteps && (
        <section className="bg-brand-soft">
          <div className="container py-16 md:py-20">
            <div className="reveal max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
                {t("landing.howto.eyebrow")}
              </p>
              <h2
                className="mt-3 text-2xl sm:text-3xl font-bold text-brand"
                style={{ fontFamily: LANDING_FONT }}
              >
                {t("product.usage")}
              </h2>
              {usage && (
                <p className="mt-4 text-base text-foreground/75 leading-relaxed whitespace-pre-line">
                  {usage}
                </p>
              )}
            </div>
            {stepImages.length > 0 && (
              <div className="mt-10 grid gap-6 sm:grid-cols-3">
                {stepImages.map((src, i) => (
                  <div
                    key={src}
                    className="reveal overflow-hidden rounded-2xl border border-border bg-background shadow-sm"
                    style={{ transitionDelay: `${i * 70}ms` }}
                  >
                    <div className="relative aspect-square overflow-hidden bg-brand-soft">
                      <img
                        src={src}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute top-4 ltr:left-4 rtl:right-4 flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white font-bold text-sm shadow-md">
                        {i + 1}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ============ REVIEWS ============ */}
      <section id="reviews" className="scroll-mt-16">
        <div className="container py-16 md:py-20">
          <div className="reveal max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-secondary">
              {t("landing.reviews.eyebrow")}
            </p>
            <h2
              className="mt-3 text-2xl sm:text-3xl font-bold text-brand"
              style={{ fontFamily: LANDING_FONT }}
            >
              {t("landing.nav.reviews")}
            </h2>
          </div>
          {showReviewImages && (
            <div className="reveal mt-10">
              <AutoCarousel itemBasis="basis-[86%] sm:basis-1/2 lg:basis-1/3" intervalMs={3800}>
                {reviewImages.map((src) => (
                  <div
                    key={src}
                    className="h-full overflow-hidden rounded-2xl border border-border bg-background shadow-sm"
                  >
                    <img
                      src={src}
                      alt=""
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </AutoCarousel>
            </div>
          )}
          <div className="reveal mt-8">
            <ProductReviews productId={product.id} />
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
                {t("landing.cta.title")}
              </h2>
              <p className="mt-3 text-white/80">{t("landing.cta.subtitle")}</p>
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
