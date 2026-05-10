import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, X, Star, Trash2, Plus, Languages, Download, Eye, Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useProduct, useCreateProduct, useUpdateProduct, useDeleteProduct, uploadProductImage, useCategories, useCreateCategory, slugify, type Product, type BrandKey } from "@/lib/db";
import { BRAND_LIST, BRANDS } from "@/lib/brands";
import { placeholderImage } from "@/lib/placeholder";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ProductImportFromUrl } from "@/components/admin/ProductImportFromUrl";
import type { ExtractedFields } from "@/lib/aiImport";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePreviewDialog } from "@/components/admin/ImagePreviewDialog";
import { downloadImage, downloadImagesAsZip } from "@/lib/downloadImage";
import ImageUpscaleDialog from "@/components/admin/ImageUpscaleDialog";

const BLANK = (brand: BrandKey = "flexitol"): Omit<Product, "id" | "createdAt" | "updatedAt"> => ({
  brand,
  name: "",
  category: BRANDS[brand].categories[0],
  categoryId: null,
  categoryIds: [],
  price: 0,
  originalPrice: null,
  shortDescription: "",
  longDescription: "",
  mainImage: placeholderImage(brand, "?", 0),
  gallery: [],
  ingredients: [],
  benefits: [],
  usage: "",
  size: "",
  sku: "",
  stockStatus: "in_stock",
  featured: false,
  tags: [],
  sourceUrl: "",
  nameAr: "",
  categoryAr: "",
  shortDescriptionAr: "",
  longDescriptionAr: "",
  usageAr: "",
  benefitsAr: [],
  ingredientsAr: [],
});

export default function AdminProductEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const { data: existing, isLoading } = useProduct(isNew ? undefined : id);
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const deleteMut = useDeleteProduct();
  const qc = useQueryClient();
  const { data: categories = [] } = useCategories();
  const createCategoryMut = useCreateCategory();
  const [form, setForm] = useState(() => BLANK());
  const [hydrated, setHydrated] = useState(isNew);
  const [translating, setTranslating] = useState(false);

  const translate = async (productId: string, opts: { silent?: boolean; overwrite?: boolean } = {}) => {
    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke("translate-product", {
        body: { productId, persist: true, overwrite: opts.overwrite ?? false },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", productId] });
      if (!opts.silent) {
        if ((data as any)?.skipped) toast.info("Already translated. Click again to overwrite.");
        else toast.success("Translated to Arabic");
      }
      // Refresh local form so Arabic fields display
      const fresh = (data as any)?.translation;
      if (fresh) {
        setForm((f) => ({
          ...f,
          nameAr: fresh.name_ar ?? f.nameAr,
          categoryAr: fresh.category_ar ?? f.categoryAr,
          shortDescriptionAr: fresh.short_description_ar ?? f.shortDescriptionAr,
          longDescriptionAr: fresh.long_description_ar ?? f.longDescriptionAr,
          usageAr: fresh.usage_ar ?? f.usageAr,
          benefitsAr: fresh.benefits_ar ?? f.benefitsAr,
          ingredientsAr: fresh.ingredients_ar ?? f.ingredientsAr,
        }));
      }
    } catch (err: any) {
      if (!opts.silent) toast.error("Translate failed: " + (err.message || "unknown"));
    } finally {
      setTranslating(false);
    }
  };

  useEffect(() => {
    if (isNew || hydrated) return;
    if (!isLoading && !existing) {
      toast.error("Product not found");
      navigate("/admin/products");
      return;
    }
    if (existing) {
      const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = existing;
      setForm(rest);
      setHydrated(true);
    }
  }, [existing, isLoading, isNew, navigate, hydrated]);

  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const fileMain = useRef<HTMLInputElement>(null);
  const fileGallery = useRef<HTMLInputElement>(null);

  // Image preview + selection state
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [upscaleTarget, setUpscaleTarget] = useState<{ url: string; kind: "main" | "gallery"; index?: number } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const baseName = (form.sku || slugify(form.name) || "product").trim() || "product";

  const toggleSelected = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const allSelected = form.gallery.length > 0 && selected.size === form.gallery.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(form.gallery.map((_, i) => i)));
  };

  const downloadSelected = () => {
    const urls = Array.from(selected).sort((a, b) => a - b).map((i) => form.gallery[i]).filter(Boolean);
    if (!urls.length) return;
    downloadImagesAsZip(urls, `${baseName}-selected.zip`, baseName);
  };

  const downloadAll = () => {
    const urls = [form.mainImage, ...form.gallery].filter((u) => u && !u.startsWith("data:"));
    if (!urls.length) {
      toast.info("No downloadable images");
      return;
    }
    downloadImagesAsZip(urls, `${baseName}-all.zip`, baseName);
  };

  const uploadMain = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      const urls = await Promise.all(files.map(uploadProductImage));
      const mainIsPlaceholder = !form.mainImage || form.mainImage.startsWith("data:");
      if (mainIsPlaceholder) {
        const [first, ...rest] = urls;
        update("mainImage", first);
        update("gallery", [...form.gallery, ...rest]);
        toast.success(
          urls.length === 1
            ? "Image uploaded and set as main"
            : `${urls.length} images uploaded — first set as main`,
        );
      } else {
        update("gallery", [...form.gallery, ...urls]);
        toast.success(
          `${urls.length} image(s) added to gallery. Hover any image and click ★ to set as main.`,
        );
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    e.target.value = "";
  };

  const uploadGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    try {
      const urls = await Promise.all(files.map(uploadProductImage));
      update("gallery", [...form.gallery, ...urls]);
      toast.success(`${urls.length} image(s) added`);
    } catch (err: any) { toast.error(err.message); }
    e.target.value = "";
  };

  const removeGalleryAt = (idx: number) => {
    update("gallery", form.gallery.filter((_, i) => i !== idx));
    setSelected((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
  };

  const setAsMain = (src: string) => {
    const oldMain = form.mainImage;
    update("mainImage", src);
    update("gallery", [oldMain, ...form.gallery.filter((g) => g !== src)]);
  };

  const applyImported = (fields: ExtractedFields, images: string[], sourceUrl?: string) => {
    setForm((f) => {
      const next = { ...f };
      if (sourceUrl && sourceUrl.trim()) next.sourceUrl = sourceUrl.trim();
      if (fields.name) next.name = fields.name;
      if (fields.brand) next.brand = fields.brand;
      if (fields.category) {
        next.category = fields.category;
        // Auto-link to existing category if slug matches
        const wantedSlug = slugify(fields.category);
        const match = categories.find(
          (c) => c.slug === wantedSlug || c.nameEn.toLowerCase() === fields.category.toLowerCase(),
        );
        if (match && !next.categoryIds.includes(match.id)) {
          next.categoryIds = [match.id, ...next.categoryIds];
          next.categoryId = match.id;
        }
      }
      if (fields.tags?.length) {
        const merged = Array.from(new Set([...next.tags, ...fields.tags.map((t) => t.trim()).filter(Boolean)]));
        next.tags = merged;
      }
      if (typeof fields.price === "number" && fields.price > 0) next.price = fields.price;
      if (fields.shortDescription) next.shortDescription = fields.shortDescription;
      if (fields.longDescription) next.longDescription = fields.longDescription;
      if (fields.size) next.size = fields.size;
      if (fields.sku) next.sku = fields.sku;
      if (fields.ingredients?.length) next.ingredients = fields.ingredients;
      if (fields.benefits?.length) next.benefits = fields.benefits;
      if (fields.usage) next.usage = fields.usage;

      if (images.length) {
        const isPlaceholder = next.mainImage.startsWith("data:");
        const [first, ...rest] = images;
        if (isPlaceholder) {
          next.mainImage = first;
          const merged = [...rest, ...next.gallery].filter(
            (u, i, a) => a.indexOf(u) === i && u !== next.mainImage,
          );
          next.gallery = merged;
        } else {
          const merged = [...images, ...next.gallery].filter(
            (u, i, a) => a.indexOf(u) === i && u !== next.mainImage,
          );
          next.gallery = merged;
        }
      }
      return next;
    });
  };

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.nameEn.localeCompare(b.nameEn)),
    [categories],
  );

  const [catSearch, setCatSearch] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const filteredCategories = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter(
      (c) =>
        c.nameEn.toLowerCase().includes(q) ||
        c.nameAr.includes(q) ||
        c.slug.toLowerCase().includes(q),
    );
  }, [sortedCategories, catSearch]);

  const setCategoryIds = (ids: string[]) => {
    setForm((f) => {
      const primary = ids[0] ?? null;
      const primaryCat = primary ? categories.find((c) => c.id === primary) : null;
      return {
        ...f,
        categoryIds: ids,
        categoryId: primary,
        category: primaryCat ? primaryCat.nameEn : (primary ? f.category : ""),
      };
    });
  };

  const toggleCategory = (catId: string) => {
    const has = form.categoryIds.includes(catId);
    const next = has
      ? form.categoryIds.filter((id) => id !== catId)
      : [...form.categoryIds, catId];
    setCategoryIds(next);
  };

  const removeCategory = (catId: string) => {
    setCategoryIds(form.categoryIds.filter((id) => id !== catId));
  };

  const createNewCategoryFromInput = async () => {
    const name = catSearch.trim();
    if (!name) return;
    const nameAr = window.prompt(`Arabic name for "${name}" (optional):`)?.trim() || "";
    const slug = slugify(name);
    try {
      const created = await createCategoryMut.mutateAsync({
        slug, nameEn: name, nameAr, imageUrl: "", sortOrder: 0, isActive: true,
        parentId: null, visiblePages: ["curemed"],
      });
      setCategoryIds([...form.categoryIds, created.id]);
      setCatSearch("");
      toast.success(`Category "${name}" created and added`);
    } catch (err: any) {
      toast.error("Create category failed: " + (err.message || "unknown"));
    }
  };

  const priceError =
    form.originalPrice != null && form.originalPrice > 0 && form.originalPrice <= form.price
      ? "Original price must be higher than the discounted price."
      : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.sku.trim()) {
      toast.error("Name and SKU are required");
      return;
    }
    if (priceError) {
      toast.error(priceError);
      return;
    }
    try {
      if (isNew) {
        const created = await createMut.mutateAsync(form);
        toast.success("Product created");
        // Auto-translate new product in background
        translate(created.id, { silent: true });
        navigate(`/admin/products/${created.id}`);
      } else if (id) {
        await updateMut.mutateAsync({ id, patch: form });
        toast.success("Product updated");
        // Auto-translate after edit, only if Arabic name still missing
        if (!form.nameAr || !form.nameAr.trim()) {
          translate(id, { silent: true });
        }
      }
    } catch (err: any) {
      toast.error("Save failed: " + (err.message || "unknown error"));
    }
  };

  const remove = async () => {
    if (!id || isNew) return;
    if (confirm(`Delete "${form.name}"?`)) {
      try {
        await deleteMut.mutateAsync(id);
        toast.success("Deleted");
        navigate("/admin/products");
      } catch (err: any) { toast.error(err.message); }
    }
  };

  return (
    <form onSubmit={save} className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/admin/products")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{isNew ? "Add product" : "Edit product"}</h1>
        </div>
        {!isNew && (
          <Button type="button" variant="outline" onClick={remove} className="gap-1.5 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
        {!isNew && id && (
          <Button
            type="button"
            variant="outline"
            disabled={translating}
            onClick={() => translate(id, { overwrite: true })}
            className="gap-1.5"
          >
            <Languages className="h-4 w-4" />
            {translating ? "Translating…" : "Translate to Arabic"}
          </Button>
        )}
        <Button type="submit" disabled={!!priceError} className="bg-brand hover:bg-brand/90 text-white">Save</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <ProductImportFromUrl onImported={applyImported} />

          {/* Core */}
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Core</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name *">
                <Input value={form.name} onChange={(e) => update("name", e.target.value)} required />
              </Field>
              <Field label="Brand *">
                <Select value={form.brand} onValueChange={(v) => update("brand", v as BrandKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BRAND_LIST.map((b) => <SelectItem key={b.key} value={b.key}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Categories">
                <div className="space-y-2">
                  {form.categoryIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {form.categoryIds.map((cid, i) => {
                        const c = categories.find((x) => x.id === cid);
                        if (!c) return null;
                        return (
                          <Badge
                            key={cid}
                            variant="secondary"
                            className={cn(
                              "gap-1 pr-1",
                              i === 0 && "bg-brand/10 text-brand border-brand/30",
                            )}
                          >
                            {i === 0 && <Star className="h-3 w-3 fill-current" />}
                            <span>{c.nameEn}</span>
                            <button
                              type="button"
                              onClick={() => removeCategory(cid)}
                              className="ml-0.5 rounded hover:bg-foreground/10 p-0.5"
                              aria-label={`Remove ${c.nameEn}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <Popover open={catOpen} onOpenChange={setCatOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={catOpen}
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate text-muted-foreground">
                          {form.categoryIds.length === 0
                            ? "Select one or more categories"
                            : `${form.categoryIds.length} selected — add or remove`}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <div className="p-2 border-b border-border">
                        <Input
                          autoFocus
                          value={catSearch}
                          onChange={(e) => setCatSearch(e.target.value)}
                          placeholder="Search or create…"
                          className="h-8"
                        />
                      </div>
                      <div className="max-h-64 overflow-y-auto py-1">
                        {filteredCategories.length === 0 && !catSearch.trim() && (
                          <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                            No categories yet.
                          </p>
                        )}
                        {filteredCategories.map((c) => {
                          const checked = form.categoryIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleCategory(c.id)}
                              className={cn(
                                "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left",
                                checked && "bg-accent/50",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-4 w-4 items-center justify-center rounded border",
                                  checked
                                    ? "bg-brand border-brand text-white"
                                    : "border-input",
                                )}
                              >
                                {checked && <Check className="h-3 w-3" />}
                              </span>
                              <span className="flex-1 truncate">
                                {c.nameEn}
                                {c.nameAr ? (
                                  <span className="text-muted-foreground"> · {c.nameAr}</span>
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                        {catSearch.trim() &&
                          !filteredCategories.some(
                            (c) => c.nameEn.toLowerCase() === catSearch.trim().toLowerCase(),
                          ) && (
                            <button
                              type="button"
                              onClick={createNewCategoryFromInput}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm border-t border-border text-brand font-medium hover:bg-accent"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Create "{catSearch.trim()}"
                            </button>
                          )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <p className="text-[10px] text-muted-foreground">
                    The first selected category (★) is used as the primary category for breadcrumbs and SEO.
                  </p>
                  {form.category && form.categoryIds.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">Free-text: {form.category}</p>
                  )}
                </div>
              </Field>
              <Field label="Price (KD)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.price}
                  onChange={(e) => update("price", parseFloat(e.target.value) || 0)}
                  className={priceError ? "border-destructive focus-visible:ring-destructive" : undefined}
                />
              </Field>
              <Field label="Original price (KD) — optional, for sale display">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.originalPrice ?? ""}
                  placeholder="Leave empty if no discount"
                  onChange={(e) => {
                    const v = e.target.value;
                    update("originalPrice", v === "" ? null : (parseFloat(v) || 0));
                  }}
                  className={priceError ? "border-destructive focus-visible:ring-destructive" : undefined}
                />
                {priceError ? (
                  <p className="text-[11px] text-destructive mt-1">{priceError}</p>
                ) : form.originalPrice && form.originalPrice > form.price && form.price > 0 ? (
                  <p className="text-[11px] text-emerald-600 mt-1">
                    Discount: -{Math.round((1 - form.price / form.originalPrice) * 100)}% (was KD {form.originalPrice.toFixed(2)} → KD {form.price.toFixed(2)})
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1">Must be higher than price to show as discounted.</p>
                )}
              </Field>
              <Field label="Short description" full>
                <Textarea rows={2} value={form.shortDescription} onChange={(e) => update("shortDescription", e.target.value)} />
              </Field>
              <Field label="Long description" full>
                <Textarea rows={5} value={form.longDescription} onChange={(e) => update("longDescription", e.target.value)} />
              </Field>
            </div>
          </Card>

          {/* Media */}
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Media</h2>
            <div className="flex items-start gap-4">
              <div className="relative h-32 w-32 rounded-lg overflow-hidden border border-border bg-muted shrink-0 group">
                <button
                  type="button"
                  onClick={() => setPreviewSrc(form.mainImage)}
                  className="block h-full w-full focus:outline-none focus:ring-2 focus:ring-ring"
                  title="Preview"
                >
                  <img src={form.mainImage} alt="" className="h-full w-full object-cover" />
                </button>
                <span className="absolute top-1 left-1 bg-brand text-white text-[10px] font-bold px-1.5 py-0.5 rounded pointer-events-none">MAIN</span>
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 pointer-events-none">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7 pointer-events-auto"
                    onClick={() => setPreviewSrc(form.mainImage)}
                    title="Preview"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7 pointer-events-auto"
                    onClick={() => downloadImage(form.mainImage, `${baseName}-main`)}
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Main image</p>
                <p className="text-xs text-muted-foreground">Uploads are added to the gallery. Hover any gallery image and click ★ to make it the main image.</p>
                <input type="file" ref={fileMain} accept="image/*" multiple onChange={uploadMain} className="hidden" />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileMain.current?.click()} className="gap-1.5">
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => downloadImage(form.mainImage, `${baseName}-main`)}
                    className="gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Gallery ({form.gallery.length})</p>
                  {form.gallery.length > 0 && (
                    <>
                      <Button type="button" variant="ghost" size="sm" onClick={toggleSelectAll} className="h-7 text-xs">
                        {allSelected ? "Clear" : "Select all"}
                      </Button>
                      {selected.size > 0 && (
                        <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                      )}
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={selected.size === 0}
                    onClick={downloadSelected}
                    className="gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" /> Download selected
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={form.gallery.length === 0 && form.mainImage.startsWith("data:")}
                    onClick={downloadAll}
                    className="gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" /> Download all
                  </Button>
                  <input type="file" ref={fileGallery} accept="image/*" multiple onChange={uploadGallery} className="hidden" />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileGallery.current?.click()} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add images
                  </Button>
                </div>
              </div>
              {form.gallery.length === 0 ? (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-6 text-center">No gallery images yet.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {form.gallery.map((src, i) => (
                    <div
                      key={i}
                      className={cn(
                        "relative group aspect-square rounded-lg overflow-hidden border border-border",
                        selected.has(i) && "ring-2 ring-brand ring-offset-1",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewSrc(src)}
                        className="block h-full w-full focus:outline-none"
                        title="Preview"
                      >
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </button>
                      <div
                        className={cn(
                          "absolute top-1.5 left-1.5 z-10 rounded bg-background/80 backdrop-blur-sm p-0.5 transition-opacity",
                          selected.has(i) ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selected.has(i)}
                          onCheckedChange={() => toggleSelected(i)}
                          aria-label="Select image"
                        />
                      </div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 pointer-events-none">
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7 pointer-events-auto"
                          onClick={() => setPreviewSrc(src)}
                          title="Preview"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7 pointer-events-auto"
                          onClick={() => downloadImage(src, `${baseName}-${i + 1}`)}
                          title="Download"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7 pointer-events-auto"
                          onClick={() => setAsMain(src)}
                          title="Set as main"
                        >
                          <Star className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          className="h-7 w-7 pointer-events-auto"
                          onClick={() => removeGalleryAt(i)}
                          title="Remove"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Details */}
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Size / Variant">
                <Input value={form.size} onChange={(e) => update("size", e.target.value)} placeholder="e.g. 250ml" />
              </Field>
              <Field label="SKU *">
                <Input value={form.sku} onChange={(e) => update("sku", e.target.value)} required />
              </Field>
              <Field label="Ingredients (one per line)" full>
                <Textarea rows={4} value={form.ingredients.join("\n")} onChange={(e) => update("ingredients", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
              </Field>
              <Field label="Benefits (one per line)" full>
                <Textarea rows={4} value={form.benefits.join("\n")} onChange={(e) => update("benefits", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
              </Field>
              <Field label="How to use" full>
                <Textarea rows={3} value={form.usage} onChange={(e) => update("usage", e.target.value)} />
              </Field>
            </div>
          </Card>
        </div>

        {/* Side: meta + preview */}
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Meta</h2>
            <Field label="Stock status">
              <Select value={form.stockStatus} onValueChange={(v: any) => update("stockStatus", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">In stock</SelectItem>
                  <SelectItem value="low_stock">Low stock</SelectItem>
                  <SelectItem value="out_of_stock">Out of stock</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center justify-between">
              <Label htmlFor="featured" className="cursor-pointer">Featured product</Label>
              <Switch id="featured" checked={form.featured} onCheckedChange={(v) => update("featured", v)} />
            </div>
            <Field label="Tags (comma-separated)">
              <Input value={form.tags.join(", ")} onChange={(e) => update("tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
            </Field>
          </Card>

          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Preview</p>
            <div data-brand={BRANDS[form.brand].themeAttr} className="rounded-2xl border border-border overflow-hidden bg-card">
              <div className={cn("aspect-square bg-brand-soft")}>
                <img src={form.mainImage} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">{BRANDS[form.brand].name} · {form.category}</p>
                <p className="font-semibold text-sm mt-1 line-clamp-2">{form.name || "Product name"}</p>
                <p className="text-sm font-bold mt-2">KD {form.price.toFixed(2)}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ImagePreviewDialog
        src={previewSrc}
        open={!!previewSrc}
        onOpenChange={(o) => !o && setPreviewSrc(null)}
        filename={previewSrc === form.mainImage ? `${baseName}-main` : baseName}
      />
    </form>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", full && "sm:col-span-2")}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}