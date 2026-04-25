import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowRight, Pill, HeartPulse, Sparkles, Stethoscope } from "lucide-react";
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