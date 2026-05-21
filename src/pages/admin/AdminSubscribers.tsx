import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Trash2, Search, Users } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useSubscribers, useDeleteSubscriber } from "@/lib/db";
import { toast } from "sonner";

export default function AdminSubscribers() {
  const [q, setQ] = useState("");
  const { data: all = [] } = useSubscribers();
  const del = useDeleteSubscriber();
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return query ? all.filter((s) => s.email.toLowerCase().includes(query)) : all;
  }, [q, all]);
  const remove = (id: string, email: string) => { if (confirm(`Remove ${email}?`)) { del.mutate(id, { onSuccess: () => toast.success("Removed") }); } };
  const exportCsv = () => {
    const header = "email,subscribed_at\n";
    const rows = all.map((s) => `${s.email},${new Date(s.createdAt).toISOString()}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `curemed-subscribers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success("Exported");
  };
  return (
    <div className="p-6 md:p-10 w-full max-w-none">
      <AdminPageHeader
        eyebrow="Subscribers"
        eyebrowIcon={Users}
        title="Subscribers"
        subtitle={`${all.length} email subscribers`}
        gradient="amber-orange-rose"
        actions={
          <Button onClick={exportCsv} className="gap-2 bg-brand hover:bg-brand/90 text-white" disabled={!all.length}><Download className="h-4 w-4" /> Export CSV</Button>
        }
      />

      <Card className="p-4 mb-4"><div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emails…" className="pl-9" /></div></Card>
      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground"><Users className="h-8 w-8 mx-auto mb-3 opacity-50" />No subscribers.</div>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((s) => (
              <li key={s.id} className="flex items-center justify-between p-4 hover:bg-muted/30">
                <div><p className="font-medium text-sm">{s.email}</p><p className="text-xs text-muted-foreground">Subscribed {new Date(s.createdAt).toLocaleDateString()}</p></div>
                <Button variant="ghost" size="sm" onClick={() => remove(s.id, s.email)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}