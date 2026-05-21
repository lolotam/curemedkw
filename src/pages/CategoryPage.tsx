import { useMemo, useState } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import { ArrowLeft, Search, X, SlidersHorizontal } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Seo } from "@/components/site/Seo";
import { ProductCard } from "@/components/site/ProductCard";
import { SubcategoryCarousel } from "@/components/site/SubcategoryCarousel";
import { useCategories, useCategoryBySlug, useProductsByCategory } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { BRAND_LIST } from "@/lib/brands";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, lang } = useI18n();
  const { data: category, isLoading } = useCategoryBySlug(slug);
  const { data: products = [] } = useProductsByCategory(category?.id);
  const { data: allCategories = [] } = useCategories();

  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"newest" | "price_asc" | "price_desc" | "name_asc" | "name_desc">("newest");
  const [searchQuery, setSearchQuery] = useState("");

  const subcategories = useMemo(
    () =>
      allCategories
        .filter((c) => c.parentId === category?.id && c.isActive !== false)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn)),
    [allCategories, category?.id],
  );

  // Brands that have ≥1 product in this category, with counts
  const categoryBrands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
    return BRAND_LIST.filter((b) => (counts.get(b.key) ?? 0) > 0).map((b) => ({
      ...b,
      count: counts.get(b.key) ?? 0,
    }));
  }, [products]);

  const toggleBrand = (key: string) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const filteredProducts = useMemo(() => {
    let out = products;
    if (selectedBrands.size > 0) out = out.filter((p) => selectedBrands.has(p.brand));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      out = out.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.shortDescription ?? "").toLowerCase().includes(q),
      );
    }
    return [...out].sort((a, b) => {
      if (sortBy === "price_asc") return a.price - b.price;
      if (sortBy === "price_desc") return b.price - a.price;
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      return 0;
    });
  }, [products, selectedBrands, searchQuery, sortBy]);

  const hasFilters = selectedBrands.size > 0 || searchQuery.trim().length > 0;
  const showSidebar = categoryBrands.length > 1;

  if (isLoading) return null;
  if (!category) return <Navigate to="/curemed" replace />;

  const name = lang === "ar" && category.nameAr ? category.nameAr : category.nameEn;

  return (
    <SiteLayout brand="curemed">
      <Seo
        title={`${name} — Curemed Kuwait`}
        description={`Browse ${products.length} ${name} products at Curemed Kuwait. Trusted pharmaceutical and medical supplies delivered across Kuwait.`.slice(0, 160)}
        path={`/categories/${category.slug}`}
      />
      {category.bannerUrl ? (
        <div className="relative w-full overflow-hidden hidden md:block">
          <div className="aspect-[19/6] w-full">
            <img
              src={category.bannerUrl}
              alt={name}
              width={1900}
              height={600}
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
            {filteredProducts.length}
            {hasFilters && products.length !== filteredProducts.length && (
              <span className="ml-1 opacity-70">/ {products.length}</span>
            )}
          </span>
        </div>
      </div>

      {subcategories.length > 0 && <SubcategoryCarousel categories={subcategories} />}

      <section className="container py-6 md:py-14">
        <div className={showSidebar ? "flex gap-8 items-start" : ""}>
          {/* Left sidebar: brand filters (desktop only) */}
          {showSidebar && (
            <aside className="hidden lg:block w-56 shrink-0 space-y-4 sticky top-24 self-start">
              <BrandFilterSidebar
                categoryBrands={categoryBrands}
                selectedBrands={selectedBrands}
                toggleBrand={toggleBrand}
                onClear={() => setSelectedBrands(new Set())}
                t={t}
              />
            </aside>
          )}

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Toolbar */}
            <div className="grid grid-cols-1 md:flex md:flex-wrap md:items-center gap-3">
              <div className="relative md:flex-1 md:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={t("category.searchPh")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="flex-1 md:w-44">
                    <SelectValue placeholder={t("category.sortBy")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">{t("category.sort.newest")}</SelectItem>
                    <SelectItem value="price_asc">{t("category.sort.priceAsc")}</SelectItem>
                    <SelectItem value="price_desc">{t("category.sort.priceDesc")}</SelectItem>
                    <SelectItem value="name_asc">{t("category.sort.nameAsc")}</SelectItem>
                    <SelectItem value="name_desc">{t("category.sort.nameDesc")}</SelectItem>
                  </SelectContent>
                </Select>
                {showSidebar && (
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" className="lg:hidden gap-2 shrink-0">
                        <SlidersHorizontal className="h-4 w-4" />
                        <span>{t("filter.title")}</span>
                        {selectedBrands.size > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-white text-[10px] font-bold">
                            {selectedBrands.size}
                          </span>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-[85vw] sm:w-[400px] overflow-y-auto">
                      <SheetHeader className="text-left">
                        <SheetTitle>{t("filter.title")}</SheetTitle>
                      </SheetHeader>
                      <div className="mt-4">
                        <BrandFilterSidebar
                          categoryBrands={categoryBrands}
                          selectedBrands={selectedBrands}
                          toggleBrand={toggleBrand}
                          onClear={() => setSelectedBrands(new Set())}
                          t={t}
                        />
                      </div>
                    </SheetContent>
                  </Sheet>
                )}
              </div>
            </div>

            {/* Product grid */}
            {filteredProducts.length === 0 ? (
              <p className="text-center text-muted-foreground py-16">
                {hasFilters ? t("category.noMatches") : t("category.noProducts")}
              </p>
            ) : (
              <div className="grid gap-3 sm:gap-5 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProducts.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}

function BrandFilterSidebar({
  categoryBrands,
  selectedBrands,
  toggleBrand,
  onClear,
  t,
}: {
  categoryBrands: Array<{ key: string; name: string; count: number }>;
  selectedBrands: Set<string>;
  toggleBrand: (key: string) => void;
  onClear: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-brand">{t("filter.title")}</h3>
      <div className="border-t border-border pt-3">
        <h4 className="text-sm font-semibold text-brand mb-3">{t("nav.brands")}</h4>
        <div className="space-y-2.5">
          {categoryBrands.map((b) => (
            <label
              key={b.key}
              className="flex items-center justify-between gap-2.5 text-sm cursor-pointer hover:text-brand transition-colors"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Checkbox
                  checked={selectedBrands.has(b.key)}
                  onCheckedChange={() => toggleBrand(b.key)}
                />
                <span className="truncate">{b.name}</span>
              </span>
              <span className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[11px] font-medium tabular-nums bg-brand/10 text-brand">
                {b.count}
              </span>
            </label>
          ))}
        </div>
      </div>
      {selectedBrands.size > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t("filter.clear")}
        </Button>
      )}
    </div>
  );
}
