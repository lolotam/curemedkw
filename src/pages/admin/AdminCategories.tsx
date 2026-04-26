import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, Pencil, Upload, X, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
  useBulkDeleteCategories, uploadCategoryImage, useProducts, slugify,
  type Category, type CategoryInput,
} from "@/lib/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BLANK: CategoryInput = {
  slug: "", nameEn: "", nameAr: "", imageUrl: "", sortOrder: 0, isActive: true,
};

export default function AdminCategories() {
  const { data: categories = [] } = useCategories();
  const { data: products = [] } = useProducts();
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();
  const deleteMut = useDeleteCategory();
  const bulkDeleteMut = useBulkDeleteCategories();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  const productCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      if (p.categoryId) m.set(p.categoryId, (m.get(p.categoryId) || 0) + 1);
    }
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter(
      (c) => c.nameEn.toLowerCase().includes(query) ||
             c.nameAr.includes(query) ||
             c.slug.toLowerCase().includes(query),
    );
  }, [q, categories]);

  const allChecked = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const removeOne = (c: Category) => {
    if (!confirm(`Delete category "${c.nameEn}"? Products will keep their text category.`)) return;
    deleteMut.mutate(c.id, {
      onSuccess: () => toast.success("Category deleted"),
      onError: (e: any) => toast.error(e.message),
    });
  };

  const bulkDelete = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} categor${ids.length === 1 ? "y" : "ies"}?`)) return;
    bulkDeleteMut.mutate(ids, {
      onSuccess: () => { toast.success(`Deleted ${ids.length}`); setSelected(new Set()); },
      onError: (e: any) => toast.error(e.message),
    });
  };

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="text-muted-foreground mt-1">Bilingual product categories shown across the site.</p>
        </div>
        <Button onClick={() => setEditing("new")} className="bg-brand hover:bg-brand/90 text-white gap-2">
          <Plus className="h-4 w-4" /> Add category
        </Button>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or slug…" className="pl-9" />
          </div>
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={bulkDelete} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size}
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 w-10"><Checkbox checked={allChecked} onCheckedChange={toggleAll} /></th>
                <th className="text-left px-4 py-3">Image</th>
                <th className="text-left px-4 py-3">English</th>
                <th className="text-left px-4 py-3">Arabic</th>
                <th className="text-left px-4 py-3">Slug</th>
                <th className="text-left px-4 py-3">Order</th>
                <th className="text-left px-4 py-3">Products</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3"><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} /></td>
                  <td className="px-4 py-3">
                    <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted border border-border">
                      {c.imageUrl ? (
                        <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                          <ImagePlus className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{c.nameEn}</td>
                  <td className="px-4 py-3" dir="rtl">{c.nameAr || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.slug}</td>
                  <td className="px-4 py-3">{c.sortOrder}</td>
                  <td className="px-4 py-3 text-muted-foreground">{productCounts.get(c.id) || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => removeOne(c)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No categories yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CategoryEditorDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          try {
            if (editing === "new") {
              await createMut.mutateAsync(input);
              toast.success("Category created");
            } else if (editing) {
              await updateMut.mutateAsync({ id: editing.id, patch: input });
              toast.success("Category updated");
            }
            setEditing(null);
          } catch (e: any) {
            toast.error(e.message || "Save failed");
          }
        }}
      />
    </div>
  );
}

function CategoryEditorDialog({
  editing, onClose, onSave,
}: {
  editing: Category | "new" | null;
  onClose: () => void;
  onSave: (input: CategoryInput) => Promise<void> | void;
}) {
  const open = editing !== null;
  const [form, setForm] = useState<CategoryInput>(BLANK);
  const [uploading, setUploading] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset form whenever the dialog opens for a new target
  useEffect(() => {
    if (editing === "new") {
      setForm(BLANK);
      setSlugTouched(false);
    } else if (editing) {
      setForm({
        slug: editing.slug,
        nameEn: editing.nameEn,
        nameAr: editing.nameAr,
        imageUrl: editing.imageUrl,
        sortOrder: editing.sortOrder,
        isActive: editing.isActive,
      });
      setSlugTouched(true);
    }
    setSaving(false);
  }, [editing]);

  const update = <K extends keyof CategoryInput>(k: K, v: CategoryInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onNameEnChange = (v: string) => {
    update("nameEn", v);
    if (!slugTouched) update("slug", slugify(v));
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Validate aspect ratio (1:1 hint, allow any but warn)
      const url = await uploadCategoryImage(file);
      update("imageUrl", url);
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh] p-0">
        <DialogHeader>
          <DialogTitle className="px-6 pt-6">{editing === "new" ? "Add category" : "Edit category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1">
          <div className="flex items-start gap-4">
            <div className="relative h-32 w-32 rounded-xl overflow-hidden border border-border bg-muted shrink-0">
              {form.imageUrl ? (
                <>
                  <img src={form.imageUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => update("imageUrl", "")}
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                  <ImagePlus className="h-6 w-6" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Image (1:1 square)</p>
              <p className="text-xs text-muted-foreground">Square crop recommended. PNG/JPG.</p>
              <Label className="inline-flex">
                <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
                <span className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-sm cursor-pointer hover:bg-muted",
                  uploading && "opacity-50 pointer-events-none",
                )}>
                  <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Upload"}
                </span>
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name (English) *</Label>
              <Input value={form.nameEn} onChange={(e) => onNameEnChange(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Name (Arabic)</Label>
              <Input value={form.nameAr} onChange={(e) => update("nameAr", e.target.value)} dir="rtl" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Slug *</Label>
              <Input
                value={form.slug}
                onChange={(e) => { setSlugTouched(true); update("slug", slugify(e.target.value)); }}
                placeholder="foot-care"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sort order</Label>
              <Input type="number" value={form.sortOrder}
                onChange={(e) => update("sortOrder", parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5 flex items-center gap-2 pt-6">
              <Checkbox id="active" checked={form.isActive}
                onCheckedChange={(v) => update("isActive", !!v)} />
              <Label htmlFor="active" className="text-sm cursor-pointer">Active</Label>
            </div>
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t border-border bg-background sticky bottom-0">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="bg-brand hover:bg-brand/90 text-white"
            disabled={saving || !form.nameEn.trim() || !form.slug.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(form);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}