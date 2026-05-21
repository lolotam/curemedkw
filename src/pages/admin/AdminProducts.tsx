import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Package, Search, Star, Trash2, Pencil, Loader2, ExternalLink, ChevronDown, Check, ArrowUp, ArrowDown, ArrowUpDown, X } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProducts, useDeleteProduct, useBulkDeleteProducts, useUpdateProduct, useCategories, type Category, type Product, type BrandKey } from "@/lib/db";
import { BRAND_LIST, BRANDS } from "@/lib/brands";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SortKey = "name" | "brand" | "category" | "price" | "originalPrice" | "stock" | "featured";
type SortDir = "asc" | "desc";
type FeaturedFilter = "all" | "yes" | "no";
type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

const STOCK_ORDER: Record<string, number> = { in_stock: 0, low_stock: 1, out_of_stock: 2 };

export default function AdminProducts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const { data: allProducts = [] } = useProducts();
  const { data: categories = [] } = useCategories();
  const del = useDeleteProduct();
  const bulkDel = useBulkDeleteProducts();
  const updateProduct = useUpdateProduct();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const brandFilter = searchParams.get("brand") || "all";

  const [catFilter, setCatFilter] = useState<Set<string>>(new Set());
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [featuredFilter, setFeaturedFilter] = useState<FeaturedFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  // Products narrowed by brand only — used to compute category counts
  const brandScoped = useMemo(
    () => (brandFilter === "all" ? allProducts : allProducts.filter((p) => p.brand === brandFilter)),
    [allProducts, brandFilter],
  );

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of brandScoped) {
      const ids = p.categoryIds.length ? p.categoryIds : (p.categoryId ? [p.categoryId] : []);
      for (const id of ids) m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  }, [brandScoped]);

  const list = useMemo(() => {
    let items = brandScoped;
    const query = q.trim().toLowerCase();
    if (query) items = items.filter((p) => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query) || p.category.toLowerCase().includes(query));
    if (catFilter.size > 0) {
      items = items.filter((p) => {
        const ids = p.categoryIds.length ? p.categoryIds : (p.categoryId ? [p.categoryId] : []);
        return ids.some((id) => catFilter.has(id));
      });
    }
    const minN = priceMin.trim() === "" ? null : Number(priceMin);
    const maxN = priceMax.trim() === "" ? null : Number(priceMax);
    if (minN !== null && !Number.isNaN(minN)) items = items.filter((p) => p.price >= minN);
    if (maxN !== null && !Number.isNaN(maxN)) items = items.filter((p) => p.price <= maxN);
    if (featuredFilter !== "all") items = items.filter((p) => (featuredFilter === "yes" ? p.featured : !p.featured));
    if (stockFilter !== "all") items = items.filter((p) => p.stockStatus === stockFilter);

    const sorted = [...items];
    if (!sort) {
      sorted.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    } else {
      const dir = sort.dir === "asc" ? 1 : -1;
      const catName = (p: Product) => {
        const ids = p.categoryIds.length ? p.categoryIds : (p.categoryId ? [p.categoryId] : []);
        const c = ids.length ? categories.find((x) => x.id === ids[0]) : null;
        return (c?.nameEn || p.category || "").toLowerCase();
      };
      const brandName = (p: Product) => (BRANDS[p.brand]?.name || p.brand).toLowerCase();
      sorted.sort((a, b) => {
        let av: any, bv: any;
        switch (sort.key) {
          case "name": av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
          case "brand": av = brandName(a); bv = brandName(b); break;
          case "category": av = catName(a); bv = catName(b); break;
          case "price": av = a.price; bv = b.price; break;
          case "originalPrice":
            // Nulls last regardless of direction
            if (a.originalPrice == null && b.originalPrice == null) return 0;
            if (a.originalPrice == null) return 1;
            if (b.originalPrice == null) return -1;
            av = a.originalPrice; bv = b.originalPrice; break;
          case "stock": av = STOCK_ORDER[a.stockStatus] ?? 99; bv = STOCK_ORDER[b.stockStatus] ?? 99; break;
          case "featured": av = a.featured ? 1 : 0; bv = b.featured ? 1 : 0; break;
        }
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    return sorted;
  }, [brandScoped, q, catFilter, priceMin, priceMax, featuredFilter, stockFilter, sort, categories]);

  const remove = (id: string, name: string) => { if (confirm(`Delete "${name}"?`)) { del.mutate(id, { onSuccess: () => toast.success("Product deleted") }); } };
  const setBrand = (b: string) => { const next = new URLSearchParams(searchParams); if (b === "all") next.delete("brand"); else next.set("brand", b); setSearchParams(next); };

  const cycleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  const allChecked = list.length > 0 && list.every((p) => selected.has(p.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) list.forEach((p) => next.delete(p.id));
      else list.forEach((p) => next.add(p.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const bulkRemove = () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} product${ids.length === 1 ? "" : "s"}?`)) return;
    bulkDel.mutate(ids, {
      onSuccess: () => { toast.success(`Deleted ${ids.length}`); setSelected(new Set()); },
      onError: (e: any) => toast.error(e.message),
    });
  };

  const hasExtraFilters =
    catFilter.size > 0 ||
    priceMin.trim() !== "" ||
    priceMax.trim() !== "" ||
    featuredFilter !== "all" ||
    stockFilter !== "all";

  const clearAllFilters = () => {
    setCatFilter(new Set());
    setPriceMin("");
    setPriceMax("");
    setFeaturedFilter("all");
    setStockFilter("all");
  };

  const selectedCatNames = categories.filter((c) => catFilter.has(c.id)).map((c) => c.nameEn);

  return (
    <div className="p-6 md:p-10 w-full max-w-none">
      <AdminPageHeader
        eyebrow="Catalog"
        eyebrowIcon={Package}
        title={
          <span className="inline-flex items-center gap-3">
            Products
            <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2.5 rounded-full bg-brand/10 text-brand text-base font-semibold tabular-nums align-middle">
              {allProducts.length}
            </span>
          </span>
        }
        subtitle="Manage products across all four brands"
        gradient="sky-violet-pink"
        actions={
          <Button asChild className="bg-brand hover:bg-brand/90 text-white gap-2"><Link to="/admin/products/new"><Plus className="h-4 w-4" /> Add product</Link></Button>
        }
      />

      <Card className="p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, SKU, category…" className="pl-9" /></div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={brandFilter === "all"} onClick={() => setBrand("all")}>
              All brands
              <CountBadge active={brandFilter === "all"} count={allProducts.length} />
            </Chip>
            {BRAND_LIST.map((b) => {
              const count = allProducts.filter((p) => p.brand === b.key).length;
              return (
                <Chip key={b.key} active={brandFilter === b.key} onClick={() => setBrand(b.key)}>
                  {b.name}
                  <CountBadge active={brandFilter === b.key} count={count} />
                </Chip>
              );
            })}
          </div>
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={bulkRemove} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center pt-1 border-t">
          <CategoryFilterPopover
            categories={categories}
            counts={categoryCounts}
            selected={catFilter}
            onChange={setCatFilter}
          />
          <PriceFilterPopover
            min={priceMin}
            max={priceMax}
            onChange={(mn, mx) => { setPriceMin(mn); setPriceMax(mx); }}
          />
          <Segmented
            label="Featured"
            value={featuredFilter}
            options={[
              { v: "all", label: "All" },
              { v: "yes", label: "Featured" },
              { v: "no", label: "Not featured" },
            ]}
            onChange={(v) => setFeaturedFilter(v as FeaturedFilter)}
          />
          <Segmented
            label="Stock"
            value={stockFilter}
            options={[
              { v: "all", label: "All" },
              { v: "in_stock", label: "In stock" },
              { v: "low_stock", label: "Low" },
              { v: "out_of_stock", label: "Out" },
            ]}
            onChange={(v) => setStockFilter(v as StockFilter)}
          />
          {hasExtraFilters && (
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={clearAllFilters}>
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          )}
        </div>

        {hasExtraFilters && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {selectedCatNames.map((n, i) => {
              const id = Array.from(catFilter)[i];
              return (
                <ActiveChip key={id} onRemove={() => setCatFilter((prev) => { const n = new Set(prev); n.delete(id); return n; })}>
                  Category: {n}
                </ActiveChip>
              );
            })}
            {(priceMin.trim() !== "" || priceMax.trim() !== "") && (
              <ActiveChip onRemove={() => { setPriceMin(""); setPriceMax(""); }}>
                Price: {priceMin || "0"}–{priceMax || "∞"} KD
              </ActiveChip>
            )}
            {featuredFilter !== "all" && (
              <ActiveChip onRemove={() => setFeaturedFilter("all")}>
                {featuredFilter === "yes" ? "Featured" : "Not featured"}
              </ActiveChip>
            )}
            {stockFilter !== "all" && (
              <ActiveChip onRemove={() => setStockFilter("all")}>
                Stock: {stockFilter === "in_stock" ? "In stock" : stockFilter === "low_stock" ? "Low" : "Out"}
              </ActiveChip>
            )}
          </div>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-4 py-3 w-10"><Checkbox checked={allChecked} onCheckedChange={toggleAll} /></th>
              <th className="px-4 py-3 w-12 text-left">#</th>
              <SortTH label="Product" sortKey="name" sort={sort} onClick={cycleSort} />
              <SortTH label="Brand" sortKey="brand" sort={sort} onClick={cycleSort} />
              <SortTH label="Category" sortKey="category" sort={sort} onClick={cycleSort} />
              <SortTH label="Price" sortKey="price" sort={sort} onClick={cycleSort} />
              <SortTH label="Original price" sortKey="originalPrice" sort={sort} onClick={cycleSort} />
              <SortTH label="Stock" sortKey="stock" sort={sort} onClick={cycleSort} />
              <SortTH label="Featured" sortKey="featured" sort={sort} onClick={cycleSort} />
              <th className="text-right px-4 py-3">Actions</th></tr></thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3"><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3"><Link to={`/admin/products/${p.id}`} className="flex items-center gap-3 min-w-0">
                    <img src={p.mainImage} alt="" className="h-10 w-10 rounded-md object-cover shrink-0" />
                    <div className="min-w-0"><p className="font-medium truncate">{p.name}</p><p className="text-xs text-muted-foreground">{p.sku}</p></div></Link></td>
                  <td className="px-4 py-3"><InlineBrandCell product={p} /></td>
                  <td className="px-4 py-3"><InlineCategoriesCell product={p} categories={categories} /></td>
                  <td className="px-4 py-3">
                    <InlinePriceCell
                      value={p.price}
                      saving={updateProduct.isPending}
                      onSave={(v) =>
                        updateProduct.mutateAsync({ id: p.id, patch: { price: v ?? 0 } })
                          .then(() => toast.success("Price updated"))
                          .catch((e) => toast.error(e.message))
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InlinePriceCell
                      value={p.originalPrice}
                      allowEmpty
                      saving={updateProduct.isPending}
                      onSave={(v) =>
                        updateProduct.mutateAsync({ id: p.id, patch: { originalPrice: v } })
                          .then(() => toast.success("Original price updated"))
                          .catch((e) => toast.error(e.message))
                      }
                    />
                  </td>
                  <td className="px-4 py-3"><StockPill status={p.stockStatus} /></td>
                  <td className="px-4 py-3"><FeaturedToggleCell id={p.id} featured={p.featured} /></td>
                  <td className="px-4 py-3 text-right"><div className="inline-flex gap-1">
                    <Button asChild variant="ghost" size="sm" title="View product page">
                      <Link to={`/${BRANDS[p.brand].slug}/product/${p.id}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm" title="Edit product"><Link to={`/admin/products/${p.id}`}><Pencil className="h-3.5 w-3.5" /></Link></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(p.id, p.name)} className="text-destructive hover:text-destructive" title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">No products found.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SortTH({ label, sortKey, sort, onClick }: { label: string; sortKey: SortKey; sort: { key: SortKey; dir: SortDir } | null; onClick: (k: SortKey) => void }) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="text-left px-4 py-3">
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wider text-xs font-medium hover:text-foreground transition-colors",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className={cn("h-3 w-3", !active && "opacity-50")} />
      </button>
    </th>
  );
}

function Segmented({ label, value, options, onChange }: { label: string; value: string; options: { v: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      <div className="inline-flex rounded-md border border-input overflow-hidden">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "px-2.5 h-8 text-xs font-medium transition-colors",
              value === o.v ? "bg-brand text-white" : "bg-background hover:bg-muted/60",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveChip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brand/10 text-brand text-xs font-medium">
      {children}
      <button type="button" onClick={onRemove} className="hover:bg-brand/20 rounded-full p-0.5" title="Remove">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function PriceFilterPopover({ min, max, onChange }: { min: string; max: string; onChange: (mn: string, mx: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mn, setMn] = useState(min);
  const [mx, setMx] = useState(max);
  useEffect(() => { if (open) { setMn(min); setMx(max); } }, [open, min, max]);
  const active = min.trim() !== "" || max.trim() !== "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-input text-xs font-medium hover:bg-muted/60 transition-colors",
            active ? "bg-brand/10 text-brand border-brand/30" : "bg-background",
          )}
        >
          Price{active ? `: ${min || "0"}–${max || "∞"}` : ""}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <p className="text-xs font-medium mb-2">Price range (KD)</p>
        <div className="flex items-center gap-2">
          <Input type="number" placeholder="Min" value={mn} onChange={(e) => setMn(e.target.value)} className="h-8 text-sm" />
          <span className="text-muted-foreground">–</span>
          <Input type="number" placeholder="Max" value={mx} onChange={(e) => setMx(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="flex justify-between gap-2 mt-3">
          <Button variant="ghost" size="sm" className="h-7" onClick={() => { setMn(""); setMx(""); onChange("", ""); setOpen(false); }}>Clear</Button>
          <Button size="sm" className="h-7" onClick={() => { onChange(mn, mx); setOpen(false); }}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CategoryFilterPopover({ categories, counts, selected, onChange }: { categories: Category[]; counts: Map<string, number>; selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Set<string>>(selected);
  useEffect(() => { if (open) setDraft(selected); }, [open, selected]);
  const visible = useMemo(() => {
    const list = categories.filter((c) => c.isActive !== false);
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((c) => c.nameEn.toLowerCase().includes(q) || c.nameAr.toLowerCase().includes(q)) : list;
    return filtered.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn));
  }, [categories, search]);
  const toggle = (id: string) => setDraft((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const apply = () => { onChange(new Set(draft)); setOpen(false); };
  const active = selected.size > 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-input text-xs font-medium hover:bg-muted/60 transition-colors",
            active ? "bg-brand/10 text-brand border-brand/30" : "bg-background",
          )}
        >
          Category{active ? ` (${selected.size})` : ""}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-2 border-b">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories…" className="h-8 text-sm" autoFocus />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {visible.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground text-center">No categories</p>}
          {visible.map((c) => {
            const checked = draft.has(c.id);
            const count = counts.get(c.id) || 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60 text-left"
              >
                <span className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                  checked ? "bg-primary border-primary text-primary-foreground" : "border-input",
                )}>
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate flex-1">{c.nameEn}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 p-2 border-t">
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setDraft(new Set())}>Clear</Button>
          <Button size="sm" className="h-7" onClick={apply}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}


function InlinePriceCell({
  value,
  onSave,
  allowEmpty = false,
  saving = false,
}: {
  value: number | null;
  onSave: (v: number | null) => Promise<unknown>;
  allowEmpty?: boolean;
  saving?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value === null ? "" : value.toFixed(2));
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value === null ? "" : value.toFixed(2));
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = async () => {
    const trimmed = draft.trim();
    let next: number | null;
    if (trimmed === "") {
      if (!allowEmpty) {
        setDraft(value === null ? "" : value.toFixed(2));
        setEditing(false);
        return;
      }
      next = null;
    } else {
      const n = Number(trimmed);
      if (Number.isNaN(n) || n < 0) {
        toast.error("Enter a valid price");
        setDraft(value === null ? "" : value.toFixed(2));
        setEditing(false);
        return;
      }
      next = n;
    }
    if (next === value) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(next);
    } finally {
      setBusy(false);
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-muted/60 transition-colors"
        title="Click to edit"
      >
        <span className={cn("font-medium tabular-nums", value === null && "text-muted-foreground")}>
          {value === null ? "—" : `KD ${value.toFixed(2)}`}
        </span>
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Input
        ref={inputRef}
        type="number"
        step="0.01"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value === null ? "" : value.toFixed(2));
            setEditing(false);
          }
        }}
        disabled={busy || saving}
        className="h-8 w-24 text-sm tabular-nums"
        autoFocus
      />
      {(busy || saving) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}

function CountBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span className={cn(
      "ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full text-[10px] font-semibold tabular-nums",
      active ? "bg-white/25 text-white" : "bg-foreground/10 text-foreground/70",
    )}>
      {count}
    </span>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition-colors", active ? "bg-brand text-white" : "bg-muted hover:bg-muted/70")}>{children}</button>;
}

function FeaturedToggleCell({ id, featured }: { id: string; featured: boolean }) {
  const updateProduct = useUpdateProduct();
  const [busy, setBusy] = useState(false);
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await updateProduct.mutateAsync({ id, patch: { featured: !featured } });
      toast.success(!featured ? "Added to featured" : "Removed from featured");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={featured ? "Click to remove from featured" : "Click to feature on home page"}
      className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted/60 transition-colors disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Star
          className={cn(
            "h-4 w-4 transition-colors",
            featured ? "fill-amber-400 text-amber-400" : "text-muted-foreground hover:text-amber-400",
          )}
        />
      )}
    </button>
  );
}

function StockPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    in_stock: { label: "In stock", cls: "bg-green-500/10 text-green-700 dark:text-green-400" },
    low_stock: { label: "Low", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    out_of_stock: { label: "Out", cls: "bg-red-500/10 text-red-700 dark:text-red-400" },
  };
  const m = map[status] || map.in_stock;
  return <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", m.cls)}>{m.label}</span>;
}

function InlineBrandCell({ product }: { product: Product }) {
  const updateProduct = useUpdateProduct();
  const [busy, setBusy] = useState(false);
  const onChange = async (next: string) => {
    if (next === product.brand) return;
    setBusy(true);
    try {
      await updateProduct.mutateAsync({ id: product.id, patch: { brand: next as BrandKey } });
      toast.success("Brand updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update brand");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Select value={product.brand} onValueChange={onChange} disabled={busy}>
        <SelectTrigger className="h-8 w-[140px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BRAND_LIST.map((b) => (
            <SelectItem key={b.key} value={b.key}>{b.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}

function InlineCategoriesCell({ product, categories }: { product: Product; categories: Category[] }) {
  const updateProduct = useUpdateProduct();
  const initial = useMemo(() => {
    const ids = product.categoryIds && product.categoryIds.length > 0
      ? product.categoryIds
      : (product.categoryId ? [product.categoryId] : []);
    return new Set(ids);
  }, [product.categoryIds, product.categoryId]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(initial);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setDraft(initial);
  }, [open, initial]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.nameEn.toLowerCase().includes(q) || c.nameAr.toLowerCase().includes(q));
  }, [categories, search]);

  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const commit = async () => {
    const before = Array.from(initial).sort().join(",");
    const after = Array.from(draft).sort().join(",");
    setOpen(false);
    if (before === after) return;
    setBusy(true);
    try {
      await updateProduct.mutateAsync({ id: product.id, patch: { categoryIds: Array.from(draft) } });
      toast.success("Categories updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update categories");
    } finally {
      setBusy(false);
    }
  };

  const selectedCats = categories.filter((c) => initial.has(c.id));
  const summary = selectedCats.length === 0
    ? (product.category || "—")
    : selectedCats.length === 1
      ? selectedCats[0].nameEn
      : `${selectedCats[0].nameEn} +${selectedCats.length - 1}`;

  return (
    <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Popover open={open} onOpenChange={(o) => { if (!o) commit(); else setOpen(true); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-input bg-background text-sm text-left hover:bg-muted/60 transition-colors min-w-[140px] max-w-[220px]"
            title="Click to edit categories"
          >
            <span className={cn("truncate flex-1", selectedCats.length === 0 && "text-muted-foreground")}>{summary}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-2 border-b">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories…"
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">No categories</p>
            )}
            {filtered.map((c) => {
              const checked = draft.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60 text-left"
                >
                  <span className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                    checked ? "bg-primary border-primary text-primary-foreground" : "border-input",
                  )}>
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{c.nameEn}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 p-2 border-t">
            <span className="text-xs text-muted-foreground">{draft.size} selected</span>
            <Button size="sm" className="h-7" onClick={commit}>Done</Button>
          </div>
        </PopoverContent>
      </Popover>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}