import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, Bell } from "lucide-react";
import { toast } from "sonner";
import {
  useNotificationTemplates, useUpsertNotificationTemplate,
  useDeleteNotificationTemplate, type NotificationTemplate,
} from "@/lib/db";

const empty = () => ({ key: "", subject: "", body: "", isActive: true });

export default function AdminNotificationTemplates() {
  const { data: templates = [], isLoading } = useNotificationTemplates();
  const upsert = useUpsertNotificationTemplate();
  const remove = useDeleteNotificationTemplate();
  const [editing, setEditing] = useState<{ id?: string; key: string; subject: string; body: string; isActive: boolean } | null>(null);

  const open = (t?: NotificationTemplate) => {
    if (!t) return setEditing(empty());
    setEditing({ id: t.id, key: t.key, subject: t.subject, body: t.body, isActive: t.isActive });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.key.trim() || !editing.subject.trim()) {
      toast.error("Key and subject are required");
      return;
    }
    try {
      await upsert.mutateAsync(editing);
      toast.success("Template saved");
      setEditing(null);
    } catch (err: any) {
      toast.error(err?.message || "Save failed");
    }
  };

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" /> Notification templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Reusable subject &amp; body for order updates and admin messages.
            Use placeholders like <code className="font-mono text-xs">{"{{order_number}}"}</code>, <code className="font-mono text-xs">{"{{customer_name}}"}</code>, <code className="font-mono text-xs">{"{{status}}"}</code>.
          </p>
        </div>
        <Button onClick={() => open()} className="bg-brand hover:bg-brand/90 text-white">
          <Plus className="h-4 w-4 mr-1" /> New template
        </Button>
      </header>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
            ) : templates.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No templates yet.</TableCell></TableRow>
            ) : (
              templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-sm">{t.key}</TableCell>
                  <TableCell>{t.subject}</TableCell>
                  <TableCell>
                    {t.isActive
                      ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Active</Badge>
                      : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => open(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button
                      size="sm" variant="ghost" className="text-destructive"
                      onClick={async () => {
                        if (!confirm(`Delete template ${t.key}?`)) return;
                        await remove.mutateAsync(t.id);
                        toast.success("Deleted");
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Key</Label>
                <Input
                  value={editing.key}
                  onChange={(e) => setEditing({ ...editing, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                  placeholder="e.g. order_confirmed"
                />
              </div>
              <div>
                <Label>Subject</Label>
                <Input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea rows={6} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
              </div>
              <div className="flex items-center justify-between pt-2">
                <Label>Active</Label>
                <Switch checked={editing.isActive} onCheckedChange={(v) => setEditing({ ...editing, isActive: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending} className="bg-brand hover:bg-brand/90 text-white">
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}