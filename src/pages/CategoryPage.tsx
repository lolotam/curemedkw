import { useParams, Navigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProductCard } from "@/components/site/ProductCard";
import { useCategoryBySlug, useProductsByCategory } from "@/lib/db";
import { useI18n } from "@/lib/i18n";

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, lang } = useI18n();
  const { data: category, isLoading } = useCategoryBySlug(slug);
  const { data: products = [] } = useProductsByCategory(category?.id);

  if (isLoading) return null;
  if (!category) return <Navigate to="/curemed" replace />;

  const name = lang === "ar" && category.nameAr ? category.nameAr : category.nameEn;

  return (
    <SiteLayout brand="curemed">
      <div className="bg-brand-soft border-b border-border/40">
        <div className="container py-3 text-sm text-muted-foreground">
          <Link to="/curemed" className="inline-flex items-center gap-1 hover:text-brand">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("nav.home")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{name}</span>
        </div>
      </div>

      <section className="container py-10 md:py-14">
        <div className="grid md:grid-cols-[260px_1fr] gap-8 items-center mb-10">
          {category.imageUrl ? (
            <div className="aspect-square rounded-3xl overflow-hidden border border-border bg-brand-soft">
              <img src={category.imageUrl} alt={name} className="h-full w-full object-cover" loading="lazy" />
            </div>
          ) : (
            <div className="aspect-square rounded-3xl bg-brand/10 flex items-center justify-center text-brand text-5xl font-bold">
              {name.charAt(0)}
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-brand">{t("categories.title")}</p>
            <h1 className="mt-2 text-4xl md:text-5xl font-bold">{name}</h1>
            {category.nameAr && lang === "en" && (
              <p className="mt-2 text-lg text-muted-foreground" dir="rtl">{category.nameAr}</p>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              {products.length}{" "}
              {products.length === 1
                ? t("category.productSingular")
                : t("category.productPlural")}
            </p>
          </div>
        </div>

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