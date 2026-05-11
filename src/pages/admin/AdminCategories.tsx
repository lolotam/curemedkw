import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, Pencil, Upload, X, ImagePlus, CornerDownRight, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
  useBulkDeleteCategories, uploadCategoryImage, uploadCategoryBanner, useProducts, slugify,
  type Category, type CategoryInput,
} from "@/lib/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BLANK: CategoryInput = {
  slug: "", nameEn: "", nameAr: "", imageUrl: "", bannerUrl: "", sortOrder: 0, isActive: true,
  parentId: null, visiblePages: ["curemed"],
};

const TOP_LEVEL_VALUE = "__top__";

/** Build a flat ordered list: each parent followed by its children. */
function buildTree(categories: Category[]) {
  const byParent = new Map<string | null, Category[]>();
  const ids = new Set(categories.map((c) => c.id));
  for (const c of categories) {
    // Treat orphans (parent points to deleted row) as top-level
    const key = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    const arr = byParent.get(key) ?? [];
    arr.push(c);
    byParent.set(key, arr);
  }
  const sortFn = (a: Category, b: Category) =>
    a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn);
  const out: { cat: Category; depth: 0 | 1 }[] = [];
  const tops = (byParent.get(null) ?? []).slice().sort(sortFn);
  for (const top of tops) {
    out.push({ cat: top, depth: 0 });
    const kids = (byParent.get(top.id) ?? []).slice().sort(sortFn);
    for (const k of kids) out.push({ cat: k, depth: 1 });
  }
  return out;
}

/** Find every descendant id of a category (used for cycle protection). */
function descendantIds(rootId: string, categories: Category[]): Set<string> {
  const out = new Set<string>();
  const walk = (id: string) => {
    for (const c of categories) {
      if (c.parentId === id && !out.has(c.id)) {
        out.add(c.id);
        walk(c.id);
      }
    }
  };
  walk(rootId);
  return out;
}

export default function AdminCategories() {
  const { data: categories = [] } = useCategories();
  const { data: products = [] } = useProducts();
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();
  const deleteMut = useDeleteCategory();
  const bulkDeleteMut = useBulkDeleteCategories();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Category | { mode: "new"; parentId: string | null } | null>(null);

  const productCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      if (p.categoryId) m.set(p.categoryId, (m.get(p.categoryId) || 0) + 1);
    }
    return m;
  }, [products]);

  // Always render in tree order; when searching, keep the parent of any
  // matched child visible so the hierarchy stays readable.
  const rows = useMemo(() => {
    const tree = buildTree(categories);
    const query = q.trim().toLowerCase();
    if (!query) return tree;
    const matchIds = new Set(
      categories
        .filter(
          (c) =>
            c.nameEn.toLowerCase().includes(query) ||
            c.nameAr.includes(query) ||
            c.slug.toLowerCase().includes(query),
        )
        .map((c) => c.id),
    );
    // Include parents of matched children
    for (const c of categories) {
      if (matchIds.has(c.id) && c.parentId) matchIds.add(c.parentId);
    }
    return tree.filter((r) => matchIds.has(r.cat.id));
  }, [q, categories]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.cat.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) rows.forEach((r) => next.delete(r.cat.id));
      else rows.forEach((r) => next.add(r.cat.id));
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

  const removeOne = async (c: Category) => {
    const children = categories.filter((x) => x.parentId === c.id);
    if (children.length > 0) {
      const choice = window.prompt(
        `"${c.nameEn}" has ${children.length} subcategor${children.length === 1 ? "y" : "ies"}.\n\n` +
          `Type "move" to promote them to top-level and delete this category,\n` +
          `or "all" to delete this category AND all its subcategories.\n` +
          `Leave empty to cancel.`,
      );
      const action = (choice || "").trim().toLowerCase();
      if (action !== "move" && action !== "all") return;
      try {
        if (action === "move") {
          await Promise.all(
            children.map((ch) => updateMut.mutateAsync({ id: ch.id, patch: { parentId: null } })),
          );
          await deleteMut.mutateAsync(c.id);
          toast.success("Category deleted, subcategories moved to top-level");
        } else {
          await bulkDeleteMut.mutateAsync([...children.map((ch) => ch.id), c.id]);
          toast.success(`Deleted ${children.length + 1} categories`);
        }
      } catch (e: any) {
        toast.error(e.message);
      }
      return;
    }
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

  const isNew = editing && typeof editing === "object" && "mode" in editing && editing.mode === "new";
  const editingCategory = editing && !isNew ? (editing as Category) : null;
  const editingParentSeed = isNew ? (editing as { parentId: string | null }).parentId : null;

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="text-muted-foreground mt-1">Bilingual product categories with optional subcategories. Drag-free re-parenting via the editor.</p>
        </div>
        <Button onClick={() => setEditing({ mode: "new", parentId: null })} className="bg-brand hover:bg-brand/90 text-white gap-2">
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
                <th className="text-left px-4 py-3 w-12">#</th>
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
              {rows.map(({ cat: c, depth }, i) => (
                <tr
                  key={c.id}
                  className={cn(
                    "border-t border-border hover:bg-muted/30",
                    depth === 1 && "bg-muted/20",
                  )}
                >
                  <td className="px-4 py-3"><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className={cn("flex items-center gap-2", depth === 1 && "pl-6")}>
                      {depth === 1 && <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                        {c.imageUrl ? (
                          <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                            <ImagePlus className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={cn("px-4 py-3 font-medium", depth === 1 && "text-muted-foreground")}>{c.nameEn}</td>
                  <td className="px-4 py-3" dir="rtl">{c.nameAr || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.slug}</td>
                  <td className="px-4 py-3">{c.sortOrder}</td>
                  <td className="px-4 py-3 text-muted-foreground">{productCounts.get(c.id) || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {depth === 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Add subcategory"
                          onClick={() => setEditing({ mode: "new", parentId: c.id })}
                        >
                          <FolderPlus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => removeOne(c)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No categories yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CategoryEditorDialog
        editingCategory={editingCategory}
        isNew={!!isNew}
        seedParentId={editingParentSeed}
        allCategories={categories}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          try {
            if (isNew) {
              await createMut.mutateAsync(input);
              toast.success("Category created");
            } else if (editingCategory) {
              await updateMut.mutateAsync({ id: editingCategory.id, patch: input });
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
  editingCategory, isNew, seedParentId, allCategories, onClose, onSave,
}: {
  editingCategory: Category | null;
  isNew: boolean;
  seedParentId: string | null;
  allCategories: Category[];
  onClose: () => void;
  onSave: (input: CategoryInput) => Promise<void> | void;
}) {
  const open = isNew || !!editingCategory;
  const [form, setForm] = useState<CategoryInput>(BLANK);
  const [uploading, setUploading] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset form whenever the dialog opens for a new target
  useEffect(() => {
    if (!open) return;
    if (isNew) {
      setForm({ ...BLANK, parentId: seedParentId });
      setSlugTouched(false);
    } else if (editingCategory) {
      setForm({
        slug: editingCategory.slug,
        nameEn: editingCategory.nameEn,
        nameAr: editingCategory.nameAr,
        imageUrl: editingCategory.imageUrl,
        sortOrder: editingCategory.sortOrder,
        isActive: editingCategory.isActive,
        parentId: editingCategory.parentId,
        visiblePages: editingCategory.visiblePages ?? [],
      });
      setSlugTouched(true);
    }
    setSaving(false);
  }, [open, isNew, seedParentId, editingCategory]);

  const update = <K extends keyof CategoryInput>(k: K, v: CategoryInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onNameEnChange = (v: string) => {
    update("nameEn", v);
    if (!slugTouched) update("slug", slugify(v));
  };

  // Available parent options exclude self and any descendants (cycle protection).
  const parentOptions = useMemo(() => {
    const blocked = editingCategory
      ? new Set([editingCategory.id, ...descendantIds(editingCategory.id, allCategories)])
      : new Set<string>();
    return allCategories
      .filter((c) => !blocked.has(c.id))
      .slice()
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  }, [editingCategory, allCategories]);

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
      <DialogContent className="max-w-lg !grid-cols-1 grid-rows-[auto_1fr_auto] max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="px-6 pt-6">
            {isNew ? (seedParentId ? "Add subcategory" : "Add category") : "Edit category"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 py-4 overflow-y-auto min-h-0">
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
            <div className="space-y-2 flex-1 min-w-0">
              <p className="text-sm font-medium">Image (1:1 square)</p>
              <div className="flex gap-2">
                <Input
                  value={form.imageUrl}
                  onChange={(e) => update("imageUrl", e.target.value)}
                  placeholder="https://example.com/category.jpg"
                  className="flex-1"
                />
                <Label className="inline-flex shrink-0">
                  <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
                  <span className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-sm cursor-pointer hover:bg-muted",
                    uploading && "opacity-50 pointer-events-none",
                  )}>
                    <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Upload"}
                  </span>
                </Label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Paste a URL above, or upload an image. 1:1 square recommended (PNG/JPG/WebP).
              </p>
              {form.imageUrl && (
                <p className="text-[11px] text-muted-foreground break-all">
                  Currently: <span className="font-mono">{form.imageUrl}</span>
                </p>
              )}
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
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Parent category</Label>
              <Select
                value={form.parentId ?? TOP_LEVEL_VALUE}
                onValueChange={(v) => update("parentId", v === TOP_LEVEL_VALUE ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Top-level —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TOP_LEVEL_VALUE}>— Top-level —</SelectItem>
                  {parentOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nameEn}
                      {c.parentId ? "  ·  (currently a subcategory)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Leave as Top-level to make this a parent category. Pick another category to make it a subcategory or to transfer it under a different parent.
              </p>
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
        <DialogFooter className="px-6 py-4 border-t border-border bg-background flex-row justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            type="button"
            style={{
              backgroundColor: "hsl(var(--brand-primary, 205 67% 36%))",
              color: "white",
            }}
            className="hover:opacity-90 min-w-[110px]"
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