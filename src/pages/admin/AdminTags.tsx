import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, Tag as TagIcon, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useTags, useUpsertTag, useRenameTag, useDeleteTag, useProducts } from "@/lib/db";
import { toast } from "sonner";

export default function AdminTags() {
  const { data: tags = [] } = useTags();
  const { data: products = [] } = useProducts();
  const upsert = useUpsertTag();
  const rename = useRenameTag();
  const remove = useDeleteTag();
  const [newName, setNewName] = useState("");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) for (const t of p.tags) m.set(t, (m.get(t) || 0) + 1);
    return m;
  }, [products]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    try { await upsert.mutateAsync({ name }); setNewName(""); toast.success("Tag added"); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Tags</h1>
        <p className="text-muted-foreground mt-1">Master list of product tags. Rename and deletes also update every linked product.</p>
      </div>

      <Card className="p-4 mb-4 flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New tag name…" onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button onClick={add} className="bg-brand hover:bg-brand/90 text-white gap-1.5"><Plus className="h-4 w-4" /> Add</Button>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 w-12">#</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Slug</th>
              <th className="text-left px-4 py-3">Used in</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t, i) => {
              const used = counts.get(t.name) || 0;
              return (
                <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 font-medium inline-flex items-center gap-2"><TagIcon className="h-3.5 w-3.5 text-brand" />{t.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.slug}</td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/products?tag=${encodeURIComponent(t.name)}`} className="text-brand hover:underline inline-flex items-center gap-1">
                      {used} product{used === 1 ? "" : "s"} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" onClick={async () => {
                        const next = window.prompt("Rename tag:", t.name)?.trim();
                        if (!next || next === t.name) return;
                        try { await rename.mutateAsync({ id: t.id, oldName: t.name, newName: next }); toast.success("Renamed"); }
                        catch (e: any) { toast.error(e.message); }
                      }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={async () => {
                        if (!confirm(`Delete tag "${t.name}"? It will be removed from ${used} product(s).`)) return;
                        try { await remove.mutateAsync({ id: t.id, name: t.name }); toast.success("Deleted"); }
                        catch (e: any) { toast.error(e.message); }
                      }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {tags.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No tags yet. Tags are also auto-created when AI extracts them on product import.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}