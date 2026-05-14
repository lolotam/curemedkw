import { Link } from "react-router-dom";
import type { Product } from "@/lib/db";
import { BRANDS } from "@/lib/brands";
import { useI18n } from "@/lib/i18n";
import { Star, MessageCircle } from "lucide-react";
import { usePriceVisibility } from "@/lib/db";
import { AddToCartButton } from "@/components/site/AddToCartButton";

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { t, lang } = useI18n();
  const brand = BRANDS[product.brand];
  const { data: visibility } = usePriceVisibility();
  const priceHidden = !!visibility && (visibility.global || visibility.brands[product.brand]);
  const hasDiscount = !!product.originalPrice && product.originalPrice > product.price && product.price > 0;
  const pct = hasDiscount ? Math.round((1 - product.price / (product.originalPrice as number)) * 100) : 0;
  const name = lang === "ar" && product.nameAr ? product.nameAr : product.name;
  const category = lang === "ar" && product.categoryAr ? product.categoryAr : product.category;
  const shortDesc =
    lang === "ar" && product.shortDescriptionAr
      ? product.shortDescriptionAr
      : product.shortDescription;
  return (
    <Link
      to={`/${brand.slug}/product/${product.id}`}
      data-brand={brand.themeAttr}
      className="group relative block rounded-2xl border border-border bg-card overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="relative aspect-square bg-brand-soft overflow-hidden">
        {(() => {
          const secondImage = product.gallery?.find((u) => u && u !== product.mainImage);
          return (
            <>
              <img
                src={product.mainImage}
                alt={name}
                width={800}
                height={800}
                className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${secondImage ? "group-hover:opacity-0" : ""}`}
                loading="lazy"
              />
              {secondImage && (
                <img
                  src={secondImage}
                  alt={name}
                  width={800}
                  height={800}
                  className="absolute inset-0 h-full w-full object-cover opacity-0 transition-all duration-500 group-hover:opacity-100 group-hover:scale-105"
                  loading="lazy"
                />
              )}
            </>
          );
        })()}
        {product.featured && (
          <span className="absolute top-3 left-3 rtl:left-auto rtl:right-3 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold text-white">
            <Star className="h-3 w-3 fill-current" /> {t("common.featured")}
          </span>
        )}
        {hasDiscount && !priceHidden && (
          <span className="absolute top-3 right-3 rtl:right-auto rtl:left-3 inline-flex items-center rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white shadow">
            -{pct}%
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
          {brand.name} · {category}
        </p>
        <h3 className="mt-1 font-semibold text-foreground line-clamp-2">{name}</h3>
        {!compact && (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{shortDesc}</p>
        )}
        <div className="mt-3 flex items-center justify-between">
          {priceHidden ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand text-white px-3 py-1.5 text-xs font-semibold">
              <MessageCircle className="h-3.5 w-3.5" /> {t("price.contactUs")}
            </span>
          ) : hasDiscount ? (
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">{t("discount.was")}</span>
              <span className="text-xs line-through text-muted-foreground">KD {(product.originalPrice as number).toFixed(2)}</span>
              <span className="text-base font-bold text-red-600">KD {product.price.toFixed(2)}</span>
            </div>
          ) : (
            <span className="text-base font-bold text-foreground">KD {product.price.toFixed(2)}</span>
          )}
          {!priceHidden && product.stockStatus !== "out_of_stock" && (
            <AddToCartButton product={product} iconOnly />
          )}
        </div>
      </div>
    </Link>
  );
}