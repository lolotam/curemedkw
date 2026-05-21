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

      <section className="container py-10 md:py-14">
        <div className={showSidebar ? "flex gap-8 items-start" : ""}>
          {/* Left sidebar: brand filters */}
          {showSidebar && (
            <aside className="hidden lg:block w-56 shrink-0 space-y-4 sticky top-24 self-start">
              <div>
                <h3 className="text-lg font-bold text-brand">Filter</h3>
                <div className="border-t border-border mt-2 pt-3">
                  <h4 className="text-sm font-semibold text-brand mb-3">Brands</h4>
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
              </div>
              {selectedBrands.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedBrands(new Set())}
                >
                  Clear filters
                </Button>
              )}
            </aside>
          )}

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Toolbar: search + sort */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search products…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="price_asc">Price: Low → High</SelectItem>
                  <SelectItem value="price_desc">Price: High → Low</SelectItem>
                  <SelectItem value="name_asc">Name: A → Z</SelectItem>
                  <SelectItem value="name_desc">Name: Z → A</SelectItem>
                </SelectContent>
              </Select>
              {/* Mobile brand filter chips */}
              {showSidebar && categoryBrands.length > 0 && (
                <div className="lg:hidden flex flex-wrap gap-2">
                  {categoryBrands.map((b) => (
                    <button
                      key={b.key}
                      onClick={() => toggleBrand(b.key)}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        selectedBrands.has(b.key)
                          ? "border-brand bg-brand text-white"
                          : "border-border bg-card hover:border-brand hover:text-brand"
                      }`}
                    >
                      {b.name}
                      <span className="opacity-70">{b.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product grid */}
            {filteredProducts.length === 0 ? (
              <p className="text-center text-muted-foreground py-16">
                {hasFilters ? "No products match your filters." : t("category.noProducts")}
              </p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
