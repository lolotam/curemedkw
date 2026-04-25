import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Pill, HeartPulse, Sparkles, Stethoscope } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProductCard } from "@/components/site/ProductCard";
import { AutoCarousel } from "@/components/site/AutoCarousel";
import { Testimonials } from "@/components/site/Testimonials";
import { FAQ } from "@/components/site/FAQ";
import { ContactSection } from "@/components/site/ContactSection";
import { Newsletter } from "@/components/site/Newsletter";
import { useI18n } from "@/lib/i18n";
import { BRAND_LIST } from "@/lib/brands";
import { products, useDbVersion } from "@/lib/db";
import { getBrandLogo } from "@/lib/placeholder";

export default function CuremedHome() {
  const { t, lang } = useI18n();
  useDbVersion();
  const featured = products.featured().slice(0, 8);

  return (
    <SiteLayout brand="curemed">
      <section className="relative overflow-hidden bg-brand-soft">
        <div className="container py-16 md:py-28 grid lg:grid-cols-2 gap-10 items-center">
          <div className="animate-fade-in-up">
            <span className="inline-block px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-semibold tracking-wider uppercase">Curemed · Kuwait</span>
            <h1 className="mt-4 text-4xl md:text-6xl font-bold leading-tight tracking-tight">{t("hero.title")}</h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl">{t("hero.subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-brand hover:bg-brand/90 text-white">
                <a href="#brands">{t("hero.exploreBrands")} <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" /></a>
              </Button>
              <Button asChild size="lg" variant="outline"><a href="#contact">{t("nav.contact")}</a></Button>
            </div>
          </div>
          <div className="relative grid grid-cols-2 gap-3 animate-fade-in-up">
            {BRAND_LIST.map((b) => {
              const l = getBrandLogo(b.themeAttr, b.name);
              return (
                <Link key={b.key} to={`/${b.slug}`} data-brand={b.themeAttr} className="aspect-square rounded-2xl bg-brand-soft border border-brand/10 p-4 flex flex-col justify-between hover:-translate-y-1 transition-transform">
                  <img src={l.src} alt={b.name} className="h-8 w-auto object-contain" />
                  <div>
                    <p className="text-xs text-brand font-semibold">{b.name}</p>
                    <p className="text-sm font-medium mt-1 line-clamp-2">{b.tagline[lang]}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

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
                  <div className="bg-white rounded-xl px-4 py-2 flex items-center justify-center">
                    <img src={l.src} alt={b.name} className="h-10 w-auto object-contain" />
                  </div>
                ) : (
                  <img src={l.src} alt={b.name} className="h-12 w-auto drop-shadow object-contain" />
                )}
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-brand">{b.name}</h3>
                <p className="mt-2 text-sm text-foreground/80 line-clamp-3">{b.tagline[lang]}</p>
                <p className="mt-4 text-sm font-semibold text-brand inline-flex items-center gap-1">{t("common.discover")} <ArrowRight className="h-4 w-4 rtl:rotate-180 transition-transform group-hover:translate-x-1" /></p>
              </div>
            </Link>
            );
          })}
        </div>
      </section>

      <section className="bg-muted/40 py-16 md:py-24">
        <div className="container">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">{t("pillars.title")}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[{ icon: Pill, key: "pharma" }, { icon: Sparkles, key: "skincare" }, { icon: HeartPulse, key: "wellness" }, { icon: Stethoscope, key: "medical" }].map(({ icon: Icon, key }) => (
              <Card key={key} className="p-6 bg-background">
                <div className="h-12 w-12 rounded-xl bg-brand/10 flex items-center justify-center text-brand"><Icon className="h-6 w-6" /></div>
                <h3 className="mt-4 font-semibold">{t(`pillars.${key}.title`)}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{t(`pillars.${key}.body`)}</p>
              </Card>
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