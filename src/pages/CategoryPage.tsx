import { useMemo } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProductCard } from "@/components/site/ProductCard";
import { SubcategoryCarousel } from "@/components/site/SubcategoryCarousel";
import { useCategories, useCategoryBySlug, useProductsByCategory } from "@/lib/db";
import { useI18n } from "@/lib/i18n";

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, lang } = useI18n();
  const { data: category, isLoading } = useCategoryBySlug(slug);
  const { data: products = [] } = useProductsByCategory(category?.id);
  const { data: allCategories = [] } = useCategories();

  const subcategories = useMemo(
    () =>
      allCategories
        .filter((c) => c.parentId === category?.id && c.isActive !== false)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn)),
    [allCategories, category?.id],
  );

  if (isLoading) return null;
  if (!category) return <Navigate to="/curemed" replace />;

  const name = lang === "ar" && category.nameAr ? category.nameAr : category.nameEn;

  return (
    <SiteLayout brand="curemed">
      {category.bannerUrl ? (
        <div className="relative w-full overflow-hidden">
          <div className="aspect-[19/6] w-full">
            <img
              src={category.bannerUrl}
              alt={name}
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0">
            <div className="container py-4 md:py-6">
              <h1 className="text-white text-2xl md:text-4xl font-bold drop-shadow-lg">{name}</h1>
            </div>
          </div>
        </div>
      ) : null}

      <div className="bg-brand-soft border-b border-border/40">
        <div className="container py-3 text-sm text-muted-foreground">
          <Link to="/curemed" className="inline-flex items-center gap-1 hover:text-brand">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("nav.home")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{name}</span>
          <span className="ml-2 inline-flex items-center justify-center rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white">
            {products.length}
          </span>
        </div>
      </div>

      {subcategories.length > 0 && <SubcategoryCarousel categories={subcategories} />}

      <section className="container py-10 md:py-14">
        {products.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">{t("category.noProducts")}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>
    </SiteLayout>
  );
}