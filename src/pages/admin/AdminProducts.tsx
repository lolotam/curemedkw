import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, Star, Trash2, Pencil, Loader2, ExternalLink, ChevronDown, Check } from "lucide-react";
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
  const list = useMemo(() => {
    let items = allProducts;
    if (brandFilter !== "all") items = items.filter((p) => p.brand === brandFilter);
    const query = q.trim().toLowerCase();
    if (query) items = items.filter((p) => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query) || p.category.toLowerCase().includes(query));
    return [...items].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [q, brandFilter, allProducts]);

  const remove = (id: string, name: string) => { if (confirm(`Delete "${name}"?`)) { del.mutate(id, { onSuccess: () => toast.success("Product deleted") }); } };
  const setBrand = (b: string) => { const next = new URLSearchParams(searchParams); if (b === "all") next.delete("brand"); else next.set("brand", b); setSearchParams(next); };

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

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div><h1 className="text-3xl font-bold">Products</h1><p className="text-muted-foreground mt-1">Manage products across all four brands</p></div>
        <Button asChild className="bg-brand hover:bg-brand/90 text-white gap-2"><Link to="/admin/products/new"><Plus className="h-4 w-4" /> Add product</Link></Button>
      </div>
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, SKU, category…" className="pl-9" /></div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={brandFilter === "all"} onClick={() => setBrand("all")}>All brands</Chip>
            {BRAND_LIST.map((b) => <Chip key={b.key} active={brandFilter === b.key} onClick={() => setBrand(b.key)}>{b.name}</Chip>)}
          </div>
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={bulkRemove} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size}
            </Button>
          )}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-4 py-3 w-10"><Checkbox checked={allChecked} onCheckedChange={toggleAll} /></th>
              <th className="px-4 py-3 w-12 text-left">#</th>
              <th className="text-left px-4 py-3">Product</th><th className="text-left px-4 py-3">Brand</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Price</th>
              <th className="text-left px-4 py-3">Original price</th>
              <th className="text-left px-4 py-3">Stock</th><th className="text-left px-4 py-3">Featured</th>
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