import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowRight, Pill, Leaf, Sparkles, Stethoscope, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProductCard } from "@/components/site/ProductCard";
import { Testimonials } from "@/components/site/Testimonials";
import { FAQ } from "@/components/site/FAQ";
import { Newsletter } from "@/components/site/Newsletter";
import { HeroSlider } from "@/components/site/HeroSlider";
import { CategoryCarousel } from "@/components/site/CategoryCarousel";
import { AutoScrollMarquee } from "@/components/site/AutoScrollMarquee";
import { useI18n } from "@/lib/i18n";
import { BRAND_LIST, BRANDS } from "@/lib/brands";
import { Seo } from "@/components/site/Seo";
import { useFeaturedProducts, useBrandingBrandCardLogo, useFeaturedGlassOpacity, useSiteSetting, useProductCardHover, DEFAULT_PRODUCT_CARD_HOVER, type Product } from "@/lib/db";
import { useEffect, useMemo, useRef, useState } from "react";

type HomeCarouselAutoscroll = { brands: boolean; categories: boolean };
const AUTOSCROLL_DEFAULT: HomeCarouselAutoscroll = { brands: true, categories: true };
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import { getBrandLogo } from "@/lib/placeholder";
import type { BrandMeta } from "@/lib/brands";

export default function CuremedHome() {
  const { t, lang } = useI18n();
  const { data: featuredAll = [] } = useFeaturedProducts();
  const featured = featuredAll.slice(0, 8);
  const { data: autoscroll = AUTOSCROLL_DEFAULT } = useSiteSetting<HomeCarouselAutoscroll>(
    "home_carousel_autoscroll",
    AUTOSCROLL_DEFAULT,
  );
  const brandsAutoscroll = autoscroll.brands !== false;

  return (
    <SiteLayout brand="curemed">
      <Seo
        title="Curemed — Pharmaceuticals & Medical Supplies in Kuwait"
        description="Shop trusted pharmaceutical and medical supplies in Kuwait. Featured brands include Flexitol, Kapiva, Nada, Australian Bodycare, La Fe's, Hartington and Phytophar."
        path="/curemed"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Curemed",
            url: "https://curemedkw.lovable.app/",
            logo: "https://curemedkw.lovable.app/favicon.png",
            areaServed: "KW",
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Curemed",
            url: "https://curemedkw.lovable.app/",
          },
        ]}
      />
      <div id="hero">
        <HeroSlider pageKey="curemed" />
      </div>

      <CategoryCarousel />

      <section id="brands" className="py-16 md:py-24">
        <div className="w-full px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">{t("brands.title")}</h2>
            <p className="mt-3 text-muted-foreground">{t("brands.subtitle")}</p>
          </div>
        </div>
        <div
          className="group relative"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
          }}
        >
          <AutoScrollMarquee autoScroll={brandsAutoscroll} speed={50}>
            {[...BRAND_LIST, ...BRAND_LIST].map((b, idx) => (
              <BrandTile
                key={`${b.key}-${idx}`}
                brand={b}
                isClone={idx >= BRAND_LIST.length}
              />
            ))}
          </AutoScrollMarquee>
        </div>
      </section>

      <section className="relative overflow-hidden py-20 md:py-28 bg-gradient-to-b from-background via-muted/30 to-background">
        {/* Decorative background blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl animate-blob-drift" />
          <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-pink-400/20 blur-3xl animate-blob-drift animation-delay-300" />
          <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl animate-blob-drift animation-delay-200" />
        </div>

        <div className="w-full px-4 md:px-8 relative">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
              {t("pillars.eyebrow")}
            </span>
            <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-sky-600 via-violet-600 to-pink-600 bg-clip-text text-transparent">
              {t("pillars.title")}
            </h2>
            <p className="mt-4 text-base text-muted-foreground">{t("pillars.subtitle")}</p>
          </div>

          {/* Pillar cards */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Pill,
                key: "pharma",
                grad: "from-sky-500 to-cyan-400",
                ring: "group-hover:shadow-sky-400/40",
                blob: "bg-sky-400/30",
                title: "group-hover:text-sky-600",
                arrow: "text-sky-600",
              },
              {
                icon: Sparkles,
                key: "skincare",
                grad: "from-pink-500 to-rose-400",
                ring: "group-hover:shadow-pink-400/40",
                blob: "bg-pink-400/30",
                title: "group-hover:text-pink-600",
                arrow: "text-pink-600",
              },
              {
                icon: Leaf,
                key: "wellness",
                grad: "from-emerald-500 to-teal-400",
                ring: "group-hover:shadow-emerald-400/40",
                blob: "bg-emerald-400/30",
                title: "group-hover:text-emerald-600",
                arrow: "text-emerald-600",
              },
              {
                icon: Stethoscope,
                key: "medical",
                grad: "from-violet-500 to-indigo-400",
                ring: "group-hover:shadow-violet-400/40",
                blob: "bg-violet-400/30",
                title: "group-hover:text-violet-600",
                arrow: "text-violet-600",
              },
            ].map(({ icon: Icon, key, grad, ring, blob, title, arrow }, i) => (
              <a
                key={key}
                href="#hero"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("hero")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cn(
                  "group relative animate-fade-in-up block",
                  i === 0 && "animation-delay-100",
                  i === 1 && "animation-delay-200",
                  i === 2 && "animation-delay-300",
                  i === 3 && "animation-delay-400",
                )}
              >
                {/* Gradient halo behind card on hover */}
                <div
                  aria-hidden
                  className={cn(
                    "absolute -inset-0.5 rounded-3xl bg-gradient-to-br opacity-0 blur transition-opacity duration-500 group-hover:opacity-60",
                    grad,
                  )}
                />
                <Card
                  className={cn(
                    "relative h-full overflow-hidden rounded-3xl border border-border bg-card/80 p-6 backdrop-blur-sm transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl flex flex-col items-center text-center",
                    ring,
                  )}
                >
                  {/* Decorative colored blob inside card */}
                  <div
                    aria-hidden
                    className={cn(
                      "absolute -top-10 -right-10 h-28 w-28 rounded-full blur-2xl animate-glow-pulse",
                      blob,
                    )}
                  />

                  {/* Editorial number */}
                  <span className="absolute top-4 right-5 rtl:right-auto rtl:left-5 text-3xl font-black text-foreground/5 select-none">
                    0{i + 1}
                  </span>

                  {/* Animated icon badge */}
                  <div className="relative mx-auto">
                    <div
                      className={cn(
                        "h-14 w-14 rounded-2xl bg-gradient-to-br shadow-lg flex items-center justify-center text-white animate-float transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6",
                        grad,
                        i === 1 && "animation-delay-200",
                        i === 2 && "animation-delay-300",
                        i === 3 && "animation-delay-400",
                      )}
                    >
                      <Icon className="h-7 w-7" />
                    </div>
                    <div
                      aria-hidden
                      className={cn(
                        "absolute inset-0 h-14 w-14 rounded-2xl bg-gradient-to-br opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-70",
                        grad,
                      )}
                    />
                  </div>

                  <h3
                    className={cn(
                      "relative mt-5 text-lg font-semibold transition-colors duration-300",
                      title,
                    )}
                  >
                    {t(`pillars.${key}.title`)}
                  </h3>
                  <p className="relative mt-2 text-sm text-muted-foreground leading-relaxed">
                    {t(`pillars.${key}.body`)}
                  </p>

                  {/* Animated arrow CTA */}
                  <div
                    className={cn(
                      "relative mt-5 inline-flex items-center justify-center gap-1.5 text-sm font-semibold opacity-0 translate-y-1 transition-all duration-500 group-hover:opacity-100 group-hover:translate-y-0",
                      arrow,
                    )}
                  >
                    {t("common.discover")}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </div>
                </Card>
              </a>
            ))}
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section id="featured" className="py-16 md:py-24">
          <div className="w-full px-4 md:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl md:text-4xl font-bold">{t("spotlight.title")}</h2>
            </div>
          </div>
          <div
            className="group relative overflow-hidden"
            style={{
              maskImage:
                "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
            }}
          >
            <div className="marquee flex w-max group-hover:[animation-play-state:paused]">
              {[...featured, ...featured].map((p, idx) => {
                const brand = BRANDS[p.brand];
                const isClone = idx >= featured.length;
                return (
                  <FeaturedGlassCard
                    key={`${p.id}-${idx}`}
                    product={p}
                    brand={brand}
                    isClone={isClone}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      <Testimonials />
      <FAQ />
      <Newsletter />
    </SiteLayout>
  );
}

function BrandTile({ brand: b, isClone }: { brand: BrandMeta; isClone: boolean }) {
  const { t, lang } = useI18n();
  const { data: cardLogo } = useBrandingBrandCardLogo(b.key);
  const fallback = getBrandLogo(b.themeAttr, b.name);
  const src = cardLogo && cardLogo.trim() ? cardLogo.trim() : fallback.src;
  const useImageTile = !!(cardLogo && cardLogo.trim()) || fallback.isImage;
  return (
    <Link
      to={`/${b.slug}`}
      data-brand={b.themeAttr}
      aria-hidden={isClone ? "true" : undefined}
      tabIndex={isClone ? -1 : undefined}
      className="group/card shrink-0 w-72 md:w-80 mr-5 rounded-3xl border border-border bg-brand-soft overflow-hidden transition-all hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="p-6 bg-brand-deep flex items-center justify-center min-h-[140px]">
        {useImageTile ? (
          <div className="bg-white rounded-xl p-3 w-full h-full min-h-[120px] flex items-center justify-center">
            <img
              src={src}
              alt={b.name}
              width={200}
              height={120}
              className="max-h-full max-w-full w-auto h-auto object-contain"
              loading="lazy"
            />
          </div>
        ) : (
          <img
            src={src}
            alt={b.name}
            width={160}
            height={48}
            className="h-12 w-auto drop-shadow object-contain"
            loading="lazy"
          />
        )}
      </div>
      <div className="p-6 flex flex-col items-center text-center">
        <h3 className="text-xl font-bold text-brand">{b.name}</h3>
        <p className="mt-2 text-sm text-foreground/80 line-clamp-3">
          {b.tagline[lang]}
        </p>
        <p className="mt-4 text-sm font-semibold text-brand inline-flex items-center gap-1">
          {t("common.discover")}{" "}
          <ArrowRight className="h-4 w-4 rtl:rotate-180 transition-transform group-hover/card:translate-x-1" />
        </p>
      </div>
    </Link>
  );
}

function FeaturedGlassCard({
  product,
  brand,
  isClone,
}: {
  product: Product;
  brand: BrandMeta;
  isClone: boolean;
}) {
  const { lang, t } = useI18n();
  const { add } = useCart();
  const { data: glassOpacity = 70 } = useFeaturedGlassOpacity();
  const { data: hoverCfg = DEFAULT_PRODUCT_CARD_HOVER } = useProductCardHover();
  const opacity = Math.max(0, Math.min(100, Number(glassOpacity) || 0)) / 100;
  const name = lang === "ar" && product.nameAr ? product.nameAr : product.name;
  const price = Number(product.price) || 0;
  const original = product.originalPrice ? Number(product.originalPrice) : null;
  const hasDiscount = original !== null && original > price;

  const images = useMemo(() => {
    const all = [product.mainImage, ...(product.gallery || [])].filter(Boolean) as string[];
    return Array.from(new Set(all));
  }, [product.mainImage, product.gallery]);

  const [hovered, setHovered] = useState(false);
  const [loopIdx, setLoopIdx] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (hoverCfg.mode === "loop" && hovered && images.length > 1) {
      const ms = Math.max(300, (hoverCfg.intervalSec || 1) * 1000);
      timerRef.current = window.setInterval(() => {
        setLoopIdx((i) => (i + 1) % images.length);
      }, ms);
    } else if (!hovered) {
      setLoopIdx(0);
    }
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [hovered, hoverCfg.mode, hoverCfg.intervalSec, images.length]);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    add(product, 1);
    toast.success(lang === "ar" ? "تمت الإضافة إلى السلة" : "Added to cart");
  };

  const secondImage = images[1];

  return (
    <Link
      to={`/${brand.slug}/product/${product.slug}`}
      data-brand={brand.themeAttr}
      aria-hidden={isClone ? "true" : undefined}
      tabIndex={isClone ? -1 : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="group/card relative shrink-0 w-72 md:w-80 h-96 mr-5 rounded-3xl overflow-hidden bg-brand-soft border border-border transition-all hover:-translate-y-1 hover:shadow-2xl"
    >
      {/* Full-bleed image(s) */}
      {hoverCfg.mode === "loop" && images.length > 1 ? (
        images.map((src, i) => (
          <img
            key={src + i}
            src={src}
            alt={name}
            width={800}
            height={800}
            loading="lazy"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 group-hover/card:scale-105 ${i === (hovered ? loopIdx : 0) ? "opacity-100" : "opacity-0"}`}
          />
        ))
      ) : (
        <>
          <img
            src={images[0] || product.mainImage}
            alt={name}
            width={800}
            height={800}
            loading="lazy"
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 group-hover/card:scale-105 ${secondImage ? "group-hover/card:opacity-0" : ""}`}
          />
          {secondImage && (
            <img
              src={secondImage}
              alt={name}
              width={800}
              height={800}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover opacity-0 transition-all duration-700 group-hover/card:opacity-100 group-hover/card:scale-105"
            />
          )}
        </>
      )}

      {/* Top gradient for legibility of the discount badge */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/30 to-transparent pointer-events-none" />

      {/* Discount badge */}
      {hasDiscount && (
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-brand text-brand-foreground text-xs font-semibold shadow-md">
          -{Math.round(((original! - price) / original!) * 100)}%
        </div>
      )}

      {/* Frosted glass info strip — bg layer is opacity-controlled, text stays fully opaque */}
      <div className="absolute inset-x-3 bottom-3 rounded-2xl overflow-hidden border border-white/40 dark:border-white/10 shadow-lg transition-all duration-300">
        <div
          aria-hidden="true"
          className="absolute inset-0 backdrop-blur-md bg-white dark:bg-black transition-opacity duration-300"
          style={{ opacity }}
        />
        <div className="relative p-4">
          <h3 className="text-base font-bold text-foreground line-clamp-2 leading-snug">{name}</h3>

          <div className="mt-1.5 flex items-end justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-lg font-bold text-brand tabular-nums">
                {price.toFixed(3)} <span className="text-xs font-medium opacity-80">KD</span>
              </span>
              {hasDiscount && (
                <span className="text-xs text-muted-foreground line-through tabular-nums">
                  {original!.toFixed(3)}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleAdd}
              aria-label={t("common.addToCart") || "Add to cart"}
              className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full bg-brand text-brand-foreground shadow-md hover:scale-110 active:scale-95 transition-transform"
            >
              <ShoppingBag className="h-4 w-4" />
            </button>
          </div>

          {/* Reveal-on-hover discover link */}
          <div className="mt-0 max-h-0 opacity-0 overflow-hidden group-hover/card:max-h-10 group-hover/card:opacity-100 group-hover/card:mt-2 transition-all duration-300">
            <p className="text-xs font-semibold text-brand inline-flex items-center gap-1">
              {t("common.discover")}
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

