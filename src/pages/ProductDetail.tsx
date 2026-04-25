import { useParams, Link, Navigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, Star, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProductCard } from "@/components/site/ProductCard";
import { products, useDbVersion } from "@/lib/db";
import { BRANDS, slugToBrand } from "@/lib/brands";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function ProductDetail() {
  const { brand: brandSlug, id } = useParams<{ brand: string; id: string }>();
  const { t } = useI18n();
  useDbVersion();
  const [activeImg, setActiveImg] = useState(0);
  const brandKey = brandSlug ? slugToBrand(brandSlug) : null;
  if (!brandKey) return <Navigate to="/curemed" replace />;
  const product = id ? products.get(id) : null;
  if (!product || product.brand !== brandKey) return <Navigate to={`/${brandSlug}`} replace />;
  const meta = BRANDS[brandKey];
  const related = products.byBrand(brandKey).filter((p) => p.id !== product.id).slice(0, 4);
  const images = [product.mainImage, ...product.gallery.filter((g) => g !== product.mainImage)];
  const stockBadge = {
    in_stock: { label: t("common.inStock"), cls: "bg-green-500/10 text-green-700 dark:text-green-400" },
    low_stock: { label: t("common.lowStock"), cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    out_of_stock: { label: t("common.outOfStock"), cls: "bg-red-500/10 text-red-700 dark:text-red-400" },
  }[product.stockStatus];

  return (
    <SiteLayout brand={meta.themeAttr}>
      <div className="bg-brand-soft border-b border-border/40">
        <div className="container py-3 text-sm text-muted-foreground flex items-center gap-2">
          <Link to={`/${meta.slug}`} className="inline-flex items-center gap-1 hover:text-brand"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {meta.name}</Link>
          <span>/</span><span className="text-foreground line-clamp-1">{product.name}</span>
        </div>
      </div>
      <section className="container py-10 md:py-16 grid lg:grid-cols-2 gap-10 lg:gap-16">
        <div>
          <div className="aspect-square rounded-3xl overflow-hidden bg-brand-soft border border-border">
            <img src={images[activeImg]} alt={product.name} className="h-full w-full object-cover" />
          </div>
          {images.length > 1 && (
            <div className="mt-4 grid grid-cols-4 gap-3">
              {images.map((src, i) => (
                <button key={i} onClick={() => setActiveImg(i)} className={cn("aspect-square rounded-xl overflow-hidden border-2 transition-all bg-brand-soft", activeImg === i ? "border-brand" : "border-border hover:border-brand/40")}>
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">{meta.name} · {product.category}</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-bold">{product.name}</h1>
          {product.featured && (
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand text-white px-2.5 py-1 text-xs font-semibold"><Star className="h-3 w-3 fill-current" /> {t("common.featured")}</span>
          )}
          <p className="mt-4 text-base text-foreground/80">{product.shortDescription}</p>
          <div className="mt-6 flex items-baseline gap-4">
            <span className="text-4xl font-bold">KD {product.price.toFixed(2)}</span>
            <span className={cn("text-xs font-semibold rounded-full px-2.5 py-1", stockBadge.cls)}>{stockBadge.label}</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground text-xs">{t("product.size")}</p><p className="font-semibold mt-0.5">{product.size}</p></div>
            <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground text-xs">{t("product.sku")}</p><p className="font-semibold mt-0.5">{product.sku}</p></div>
          </div>
          <div className="mt-8 space-y-6">
            <div><h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">{t("product.benefits")}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">{product.benefits.map((b, i) => <li key={i} className="flex items-start gap-2 text-sm"><Check className="h-4 w-4 text-brand mt-0.5 shrink-0" /> <span>{b}</span></li>)}</ul></div>
            <div><h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">Description</h3><p className="text-sm leading-relaxed text-foreground/80">{product.longDescription}</p></div>
            <div><h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">{t("product.ingredients")}</h3>
              <div className="flex flex-wrap gap-2">{product.ingredients.map((i, idx) => <span key={idx} className="text-xs px-2.5 py-1 rounded-full bg-muted">{i}</span>)}</div></div>
            <div><h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">{t("product.usage")}</h3><p className="text-sm leading-relaxed text-foreground/80">{product.usage}</p></div>
          </div>
          <Button asChild size="lg" className="mt-8 bg-brand hover:bg-brand/90 text-white"><a href={`/${meta.slug}#contact`}>Inquire about this product</a></Button>
        </div>
      </section>
      {related.length > 0 && (
        <section className="container py-12 md:py-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">{t("common.relatedProducts")}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{related.map((p) => <ProductCard key={p.id} product={p} compact />)}</div>
        </section>
      )}
    </SiteLayout>
  );
}