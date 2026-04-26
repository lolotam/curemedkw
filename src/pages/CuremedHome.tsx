import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowRight, Pill, HeartPulse, Sparkles, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProductCard } from "@/components/site/ProductCard";
import { AutoCarousel } from "@/components/site/AutoCarousel";
import { Testimonials } from "@/components/site/Testimonials";
import { FAQ } from "@/components/site/FAQ";
import { ContactSection } from "@/components/site/ContactSection";
import { Newsletter } from "@/components/site/Newsletter";
import { HeroSlider } from "@/components/site/HeroSlider";
import { CategoryCarousel } from "@/components/site/CategoryCarousel";
import { useI18n } from "@/lib/i18n";
import { BRAND_LIST } from "@/lib/brands";
import { useFeaturedProducts } from "@/lib/db";
import { getBrandLogo } from "@/lib/placeholder";

export default function CuremedHome() {
  const { t, lang } = useI18n();
  const { data: featuredAll = [] } = useFeaturedProducts();
  const featured = featuredAll.slice(0, 8);

  return (
    <SiteLayout brand="curemed">
      <HeroSlider pageKey="curemed" />

      <CategoryCarousel />

      <section id="brands" className="container py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">{t("brands.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("brands.subtitle")}</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {BRAND_LIST.map((b) => {
            const l = getBrandLogo(b.themeAttr, b.name);
            return (
            <Link key={b.key} to={`/${b.slug}`} data-brand={b.themeAttr} className="group rounded-3xl border border-border bg-brand-soft overflow-hidden transition-all hover:-translate-y-1 hover:shadow-xl">
              <div className="p-6 bg-brand-deep flex items-center justify-center min-h-[140px]">
                {l.isImage ? (
                  <div className="bg-white rounded-xl p-3 w-full h-full min-h-[120px] flex items-center justify-center">
                    <img src={l.src} alt={b.name} className="max-h-full max-w-full w-auto h-auto object-contain" />
                  </div>
                ) : (
                  <img src={l.src} alt={b.name} className="h-12 w-auto drop-shadow object-contain" />
                )}
              </div>
              <div className="p-6 flex flex-col items-center text-center">
                <h3 className="text-xl font-bold text-brand">{b.name}</h3>
                <p className="mt-2 text-sm text-foreground/80 line-clamp-3">{b.tagline[lang]}</p>
                <p className="mt-4 text-sm font-semibold text-brand inline-flex items-center gap-1">{t("common.discover")} <ArrowRight className="h-4 w-4 rtl:rotate-180 transition-transform group-hover:translate-x-1" /></p>
              </div>
            </Link>
            );
          })}
        </div>
      </section>

      <section className="relative overflow-hidden py-20 md:py-28 bg-gradient-to-b from-background via-muted/30 to-background">
        {/* Decorative background blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl animate-blob-drift" />
          <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-pink-400/20 blur-3xl animate-blob-drift animation-delay-300" />
          <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl animate-blob-drift animation-delay-200" />
        </div>

        <div className="container relative">
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
                icon: HeartPulse,
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
              <div
                key={key}
                className={cn(
                  "group relative animate-fade-in-up",
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
              </div>
            ))}
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="container py-16 md:py-24">
          <h2 className="text-3xl md:text-4xl font-bold mb-10 text-center">{t("spotlight.title")}</h2>
          <AutoCarousel intervalMs={5000}>
            {featured.map((p) => <ProductCard key={p.id} product={p} />)}
          </AutoCarousel>
        </section>
      )}

      <Testimonials />
      <FAQ />
      <ContactSection brand="curemed" />
      <Newsletter />
    </SiteLayout>
  );
}