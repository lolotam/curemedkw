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
import { Seo } from "@/components/site/Seo";
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
  const [discountMin, setDiscountMin] = useState<number>(0); // 0 = any, otherwise min %

  // Build category list with counts. Only show active categories that contain
  // products for this brand, so newly assigned categories appear with a badge.
  const brandCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of brandProducts) {
      const ids = p.categoryIds.length ? p.categoryIds : (p.categoryId ? [p.categoryId] : []);
      for (const cid of ids) {
        counts.set(cid, (counts.get(cid) || 0) + 1);
      }
    }
    return categories
      .filter((c) => c.isActive !== false)
      .filter((c) => (counts.get(c.id) || 0) > 0)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn))
      .map((c) => ({ ...c, count: counts.get(c.id) || 0 }));
  }, [categories, brandProducts]);

  const discountPct = (p: typeof brandProducts[number]) =>
    p.originalPrice && p.originalPrice > p.price && p.price > 0
      ? (1 - p.price / p.originalPrice) * 100
      : 0;

  const filteredProducts = useMemo(() => {
    return brandProducts.filter((p) => {
      if (selectedCats.size > 0) {
        const ids = p.categoryIds.length ? p.categoryIds : (p.categoryId ? [p.categoryId] : []);
        if (!ids.some((cid) => selectedCats.has(cid))) return false;
      }
      if (discountMin > 0 && discountPct(p) < discountMin) return false;
      return true;
    });
  }, [brandProducts, selectedCats, discountMin]);

  const toggleCat = (id: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <SiteLayout brand={meta.themeAttr}>
      <Seo
        title={`${meta.name} — Curemed Kuwait`}
        description={`${meta.name} products available at Curemed in Kuwait. ${meta.tagline?.en ?? "Shop the full range online."}`.slice(0, 160)}
        path={`/${meta.slug}`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Brand",
          name: meta.name,
          url: `https://curemedkw.lovable.app/${meta.slug}`,
          logo: meta.logo,
        }}
      />
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
                      {brandCategories.map((c) => {
                        return (
                          <label
                            key={c.id}
                            className="flex items-center justify-between gap-2.5 text-sm transition-colors cursor-pointer hover:text-brand"
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <Checkbox
                                checked={selectedCats.has(c.id)}
                                onCheckedChange={() => toggleCat(c.id)}
                              />
                              <span className="truncate">
                                {lang === "ar" && c.nameAr ? c.nameAr : c.nameEn}
                              </span>
                            </span>
                            <span className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-brand/10 text-[11px] font-medium tabular-nums text-brand">
                              {c.count}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="border-t border-border mt-4 pt-3">
                    <h4 className="text-sm font-semibold text-brand mb-3">{t("filter.discount")}</h4>
                    <div className="space-y-2">
                      {[
                        { v: 0, key: "filter.discount.any" },
                        { v: 0.01, key: "filter.discount.onSale" },
                        { v: 10, key: "filter.discount.10" },
                        { v: 20, key: "filter.discount.20" },
                        { v: 30, key: "filter.discount.30" },
                        { v: 50, key: "filter.discount.50" },
                      ].map((opt) => (
                        <label key={opt.v} className="flex items-center gap-2.5 text-sm cursor-pointer hover:text-brand">
                          <input
                            type="radio"
                            name="discount-filter"
                            className="accent-brand"
                            checked={discountMin === opt.v}
                            onChange={() => setDiscountMin(opt.v)}
                          />
                          <span>{t(opt.key)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                {(selectedCats.size > 0 || discountMin > 0) && (
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedCats(new Set()); setDiscountMin(0); }}>
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
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            {t("brand.why.title").replace("{brand}", meta.name)}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: ShieldCheck, key: "brand.why.clinical" },
              { icon: CheckCircle2, key: "brand.why.trusted" },
              { icon: Leaf, key: "brand.why.skinFriendly" },
              { icon: Award, key: "brand.why.awardWinning" },
            ].map((b, i) => (
              <Card key={i} className="p-6 bg-background border-brand/10">
                <div className="h-12 w-12 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
                  <b.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-semibold">{t(b.key)}</h3>
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