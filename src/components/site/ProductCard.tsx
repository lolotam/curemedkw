import { Link } from "react-router-dom";
import type { Product } from "@/lib/db";
import { BRANDS } from "@/lib/brands";
import { useI18n } from "@/lib/i18n";
import { Star } from "lucide-react";

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { t } = useI18n();
  const brand = BRANDS[product.brand];
  const hasDiscount = !!product.originalPrice && product.originalPrice > product.price && product.price > 0;
  const pct = hasDiscount ? Math.round((1 - product.price / (product.originalPrice as number)) * 100) : 0;
  return (
    <Link
      to={`/${brand.slug}/product/${product.id}`}
      data-brand={brand.themeAttr}
      className="group relative block rounded-2xl border border-border bg-card overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="aspect-square bg-brand-soft overflow-hidden">
        <img
          src={product.mainImage}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {product.featured && (
          <span className="absolute top-3 left-3 rtl:left-auto rtl:right-3 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold text-white">
            <Star className="h-3 w-3 fill-current" /> {t("common.featured")}
          </span>
        )}
        {hasDiscount && (
          <span className="absolute top-3 right-3 rtl:right-auto rtl:left-3 inline-flex items-center rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white shadow">
            -{pct}%
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
          {brand.name} · {product.category}
        </p>
        <h3 className="mt-1 font-semibold text-foreground line-clamp-2">{product.name}</h3>
        {!compact && (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{product.shortDescription}</p>
        )}
        <div className="mt-3 flex items-center justify-between">
          {hasDiscount ? (
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">{t("discount.was")}</span>
              <span className="text-xs line-through text-muted-foreground">KD {(product.originalPrice as number).toFixed(2)}</span>
              <span className="text-base font-bold text-red-600">KD {product.price.toFixed(2)}</span>
            </div>
          ) : (
            <span className="text-base font-bold text-foreground">KD {product.price.toFixed(2)}</span>
          )}
          <span className="text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
            {t("common.viewProduct")} →
          </span>
        </div>
      </div>
    </Link>
  );
}