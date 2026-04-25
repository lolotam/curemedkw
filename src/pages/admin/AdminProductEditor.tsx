import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, X, Star, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useProduct,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  uploadProductImage,
  uploadProductMarkdown,
  type Product,
  type BrandKey,
} from "@/lib/db";
import { BRAND_LIST, BRANDS } from "@/lib/brands";
import { placeholderImage } from "@/lib/placeholder";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ProductImportFromUrl } from "@/components/admin/ProductImportFromUrl";
import type { ExtractedFields } from "@/lib/aiImport";

const BLANK = (brand: BrandKey = "flexitol"): Omit<Product, "id" | "createdAt" | "updatedAt"> => ({
  brand,
  name: "",
  category: BRANDS[brand].categories[0],
  price: 0,
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
});

export default function AdminProductEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const { data: existing, isLoading } = useProduct(isNew ? undefined : id);
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const deleteMut = useDeleteProduct();
  const [form, setForm] = useState(() => BLANK());
  const [hydrated, setHydrated] = useState(isNew);

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

  // Markdown captured from the AI import — saved into the product folder
  // after the product row exists.
  const pendingScrapeRef = useRef<{ markdown: string; sourceUrl: string } | null>(null);
  const productId = isNew ? undefined : id;

  const uploadMain = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadProductImage(file, productId);
      update("mainImage", url);
      toast.success("Main image updated");
    } catch (err: any) { toast.error(err.message); }
    e.target.value = "";
  };

  const uploadGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    try {
      const urls = await Promise.all(files.map((f) => uploadProductImage(f, productId)));
      update("gallery", [...form.gallery, ...urls]);
      toast.success(`${urls.length} image(s) added`);
    } catch (err: any) { toast.error(err.message); }
    e.target.value = "";
  };

  const removeGalleryAt = (idx: number) =>
    update("gallery", form.gallery.filter((_, i) => i !== idx));

  const setAsMain = (src: string) => {
    const oldMain = form.mainImage;
    update("mainImage", src);
    update("gallery", [oldMain, ...form.gallery.filter((g) => g !== src)]);
  };

  const applyImported = (
    fields: ExtractedFields,
    images: string[],
    scrape?: { markdown: string; sourceUrl: string },
  ) => {
    if (scrape?.markdown) {
      pendingScrapeRef.current = scrape;
      // If the product already exists, persist immediately.
      if (productId) {
        uploadProductMarkdown(productId, scrape.markdown, scrape.sourceUrl)
          .then(() => {
            pendingScrapeRef.current = null;
            toast.message("Scraped markdown saved to product folder");
          })
          .catch((err) => console.warn("Failed to save markdown", err));
      }
    }
    setForm((f) => {
      const next = { ...f };
      if (fields.name) next.name = fields.name;
      if (fields.brand) next.brand = fields.brand;
      if (fields.category) next.category = fields.category;
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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.sku.trim()) {
      toast.error("Name and SKU are required");
      return;
    }
    try {
      if (isNew) {
        const created = await createMut.mutateAsync(form);
        // Now that we have an id, flush any pending scrape markdown.
        if (pendingScrapeRef.current) {
          try {
            await uploadProductMarkdown(
              created.id,
              pendingScrapeRef.current.markdown,
              pendingScrapeRef.current.sourceUrl,
            );
          } catch (err) {
            console.warn("Failed to save scrape markdown after create", err);
          }
          pendingScrapeRef.current = null;
        }
        toast.success("Product created");
        navigate(`/admin/products/${created.id}`);
      } else if (id) {
        await updateMut.mutateAsync({ id, patch: form });
        if (pendingScrapeRef.current) {
          try {
            await uploadProductMarkdown(
              id,
              pendingScrapeRef.current.markdown,
              pendingScrapeRef.current.sourceUrl,
            );
          } catch (err) {
            console.warn("Failed to save scrape markdown", err);
          }
          pendingScrapeRef.current = null;
        }
        toast.success("Product updated");
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
        <Button type="submit" className="bg-brand hover:bg-brand/90 text-white">Save</Button>
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
              <Field label="Category">
                <Input value={form.category} onChange={(e) => update("category", e.target.value)} list="cats" />
                <datalist id="cats">
                  {BRANDS[form.brand].categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </Field>
              <Field label="Price (KD)">
                <Input type="number" step="0.01" min={0} value={form.price} onChange={(e) => update("price", parseFloat(e.target.value) || 0)} />
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
              <div className="relative h-32 w-32 rounded-lg overflow-hidden border border-border bg-muted shrink-0">
                <img src={form.mainImage} alt="" className="h-full w-full object-cover" />
                <span className="absolute top-1 left-1 bg-brand text-white text-[10px] font-bold px-1.5 py-0.5 rounded">MAIN</span>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Main image</p>
                <p className="text-xs text-muted-foreground">PNG/JPG, under 1.5MB. Stored locally in your browser.</p>
                <input type="file" ref={fileMain} accept="image/*" onChange={uploadMain} className="hidden" />
                <Button type="button" variant="outline" size="sm" onClick={() => fileMain.current?.click()} className="gap-1.5">
                  <Upload className="h-3.5 w-3.5" /> Upload
                </Button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Gallery ({form.gallery.length})</p>
                <input type="file" ref={fileGallery} accept="image/*" multiple onChange={uploadGallery} className="hidden" />
                <Button type="button" variant="outline" size="sm" onClick={() => fileGallery.current?.click()} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add images
                </Button>
              </div>
              {form.gallery.length === 0 ? (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-6 text-center">No gallery images yet.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {form.gallery.map((src, i) => (
                    <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        <Button type="button" size="sm" variant="secondary" onClick={() => setAsMain(src)} title="Set as main">
                          <Star className="h-3 w-3" />
                        </Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => removeGalleryAt(i)}>
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