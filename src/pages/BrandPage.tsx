import { useParams, Navigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { CheckCircle2, ShieldCheck, Leaf, Award } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProductCard } from "@/components/site/ProductCard";
import { AutoCarousel } from "@/components/site/AutoCarousel";
import { Testimonials } from "@/components/site/Testimonials";
import { FAQ } from "@/components/site/FAQ";
import { ContactSection } from "@/components/site/ContactSection";
import { Newsletter } from "@/components/site/Newsletter";
import { HeroSlider } from "@/components/site/HeroSlider";
import { CategoryCarousel } from "@/components/site/CategoryCarousel";
import { BRANDS, slugToBrand } from "@/lib/brands";
import { useI18n } from "@/lib/i18n";
import { useProductsByBrand, useCategories } from "@/lib/db";
import type { HeroPageKey } from "@/lib/heroSlides";

export default function BrandPage() {
  const { brand: brandSlug } = useParams<{ brand: string }>();
  const { t, lang } = useI18n();
  const brandKey = brandSlug ? slugToBrand(brandSlug) : null;
  if (!brandKey) return <Navigate to="/curemed" replace />;
  const meta = BRANDS[brandKey];
  const { data: brandProducts = [] } = useProductsByBrand(brandKey);
  const { data: categories = [] } = useCategories();
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());

  // Build category list with counts (only categories that have products in this brand)
  const brandCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of brandProducts) {
      if (p.categoryId) counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    }
    return categories
      .filter((c) => counts.has(c.id))
      .map((c) => ({ ...c, count: counts.get(c.id) || 0 }));
  }, [categories, brandProducts]);

  const filteredProducts = useMemo(() => {
    if (selectedCats.size === 0) return brandProducts;
    return brandProducts.filter((p) => p.categoryId && selectedCats.has(p.categoryId));
  }, [brandProducts, selectedCats]);

  const toggleCat = (id: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <SiteLayout brand={meta.themeAttr}>
      <HeroSlider pageKey={brandKey as HeroPageKey} />

      <CategoryCarousel />

      <section id="products" className="container py-16 md:py-24">
        <div className="mb-10">
          <h2 className="text-3xl md:text-4xl font-bold">{meta.name}</h2>
          <p className="mt-2 text-muted-foreground">{t("brands.subtitle")}</p>
        </div>
        {brandProducts.length > 0 && (
          <div className="grid lg:grid-cols-[240px_1fr] gap-8">
            {brandCategories.length > 0 ? (
              <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                <div>
                  <h3 className="text-lg font-bold text-brand">{t("filter.title")}</h3>
                  <div className="border-t border-border mt-2 pt-3">
                    <h4 className="text-sm font-semibold text-brand mb-3">{t("filter.areas")}</h4>
                    <div className="space-y-2.5">
                      {brandCategories.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2.5 text-sm cursor-pointer hover:text-brand"
                        >
                          <Checkbox
                            checked={selectedCats.has(c.id)}
                            onCheckedChange={() => toggleCat(c.id)}
                          />
                          <span>
                            {lang === "ar" && c.nameAr ? c.nameAr : c.nameEn}{" "}
                            <span className="text-muted-foreground">({c.count})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                {selectedCats.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCats(new Set())}>
                    {t("filter.clear")}
                  </Button>
                )}
              </aside>
            ) : <div className="hidden lg:block" />}
            <div className="min-w-0">
              {selectedCats.size === 0 && brandCategories.length === 0 ? (
                <AutoCarousel intervalMs={4500}>
                  {brandProducts.map((p) => <ProductCard key={p.id} product={p} />)}
                </AutoCarousel>
              ) : filteredProducts.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">{t("category.noProducts")}</p>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredProducts.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              )}
            </div>
          </div>
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