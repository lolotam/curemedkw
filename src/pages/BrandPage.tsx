import { useParams, Link, Navigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, ShieldCheck, Leaf, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProductCard } from "@/components/site/ProductCard";
import { AutoCarousel } from "@/components/site/AutoCarousel";
import { Testimonials } from "@/components/site/Testimonials";
import { FAQ } from "@/components/site/FAQ";
import { ContactSection } from "@/components/site/ContactSection";
import { Newsletter } from "@/components/site/Newsletter";
import { HeroSlider } from "@/components/site/HeroSlider";
import { BRANDS, slugToBrand } from "@/lib/brands";
import { useI18n } from "@/lib/i18n";
import { useProductsByBrand } from "@/lib/db";
import { getBrandLogo } from "@/lib/placeholder";
import type { HeroPageKey } from "@/lib/heroSlides";

export default function BrandPage() {
  const { brand: brandSlug } = useParams<{ brand: string }>();
  const { t, lang } = useI18n();
  const brandKey = brandSlug ? slugToBrand(brandSlug) : null;
  if (!brandKey) return <Navigate to="/curemed" replace />;
  const meta = BRANDS[brandKey];
  const { data: brandProducts = [] } = useProductsByBrand(brandKey);
  const logo = getBrandLogo(meta.themeAttr, meta.name);

  return (
    <SiteLayout brand={meta.themeAttr}>
      <HeroSlider pageKey={brandKey as HeroPageKey} fallback={
      <section className="relative overflow-hidden bg-brand-soft">
        <div className="container py-20 md:py-28 grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-in-up">
            <img src={logo.src} alt={meta.name} className="h-12 mb-6 object-contain" />
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-brand">{meta.tagline[lang]}</h1>
            <p className="mt-5 text-lg text-foreground/80 max-w-xl">{meta.about[lang]}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-brand hover:bg-brand/90 text-white">
                <a href="#products">{t("common.shopAll")} <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" /></a>
              </Button>
              <Button asChild size="lg" variant="outline"><Link to="/curemed">{t("common.backToBrand")}</Link></Button>
            </div>
          </div>
          <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-brand-deep flex items-center justify-center p-8">
            {brandProducts[0] && <img src={brandProducts[0].mainImage} alt={brandProducts[0].name} className="max-h-full object-contain animate-fade-in-up" />}
          </div>
        </div>
      </section>
      } />

      <section id="products" className="container py-16 md:py-24">
        <div className="mb-10">
          <h2 className="text-3xl md:text-4xl font-bold">{meta.name}</h2>
          <p className="mt-2 text-muted-foreground">{t("brands.subtitle")}</p>
        </div>
        {brandProducts.length > 0 && (
          <AutoCarousel intervalMs={4500}>
            {brandProducts.map((p) => <ProductCard key={p.id} product={p} />)}
          </AutoCarousel>
        )}
      </section>

      <section className="bg-brand-soft py-16 md:py-24">
        <div className="container">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Why {meta.name}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[{ icon: ShieldCheck, en: "Clinically tested", ar: "مختبر سريرياً" }, { icon: CheckCircle2, en: "Trusted quality", ar: "جودة موثوقة" }, { icon: Leaf, en: "Skin-friendly", ar: "لطيف على البشرة" }, { icon: Award, en: "Award-winning", ar: "حائز على جوائز" }].map((b, i) => (
              <Card key={i} className="p-6 bg-background border-brand/10">
                <div className="h-12 w-12 rounded-xl bg-brand/10 flex items-center justify-center text-brand"><b.icon className="h-6 w-6" /></div>
                <h3 className="mt-4 font-semibold">{lang === "ar" ? b.ar : b.en}</h3>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Testimonials />
      <FAQ />
      <ContactSection brand={brandKey} />
      <Newsletter />
    </SiteLayout>
  );
}