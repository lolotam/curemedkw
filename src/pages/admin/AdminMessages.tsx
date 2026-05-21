import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Mail, MailOpen, X } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useMessages, useMarkMessageRead, useDeleteMessages, type Message } from "@/lib/db";
import { BRANDS } from "@/lib/brands";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AdminMessages() {
  const { data: all = [] } = useMessages();
  const markRead = useMarkMessageRead();
  const delMany = useDeleteMessages();
  const [active, setActive] = useState<Message | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const focusMessageId = (location.state as { focusMessageId?: string } | null)?.focusMessageId;
  const open = (m: Message) => { setActive(m); if (!m.read) markRead.mutate({ id: m.id, read: true }); };
  useEffect(() => {
    if (!focusMessageId || !all.length) return;
    const target = all.find((m) => m.id === focusMessageId);
    if (target) {
      open(target);
      navigate(".", { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMessageId, all]);
  const remove = (id: string) => { if (confirm("Delete this message?")) { delMany.mutate([id], { onSuccess: () => { if (active?.id === id) setActive(null); toast.success("Deleted"); } }); } };
  const removeSelected = () => { if (!selected.length) return; if (confirm(`Delete ${selected.length} message(s)?`)) { delMany.mutate(selected, { onSuccess: () => { setSelected([]); toast.success("Deleted"); } }); } };
  const toggleSelect = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      <AdminPageHeader
        eyebrow="Messages"
        eyebrowIcon={Mail}
        title="Messages"
        subtitle={`${all.length} total · ${all.filter((m) => !m.read).length} unread`}
        gradient="rose-pink-fuchsia"
        actions={selected.length > 0 ? (
          <Button variant="outline" onClick={removeSelected} className="gap-1.5 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /> Delete {selected.length}</Button>
        ) : null}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card className="overflow-hidden">
          {all.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground"><Mail className="h-8 w-8 mx-auto mb-3 opacity-50" />No messages.</div>
          ) : (
            <ul className="divide-y divide-border">
              {all.map((m) => (
                <li key={m.id} className={cn("flex items-start gap-3 p-4 hover:bg-muted/30 cursor-pointer", active?.id === m.id && "bg-muted/50", !m.read && "bg-brand/[0.03]")} onClick={() => open(m)}>
                  <Checkbox checked={selected.includes(m.id)} onCheckedChange={() => toggleSelect(m.id)} onClick={(e) => e.stopPropagation()} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2"><p className={cn("text-sm truncate", !m.read && "font-bold")}>{m.name}</p><span className="text-xs text-muted-foreground shrink-0">{new Date(m.createdAt).toLocaleDateString()}</span></div>
                    <p className="text-sm text-foreground/80 truncate">{m.subject}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{m.message}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {m.brand && m.brand !== "curemed" && <span className="text-[10px] font-semibold uppercase tracking-wider text-brand">{BRANDS[m.brand].name}</span>}
                      {!m.read && <span className="text-[10px] font-bold text-brand">NEW</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {active ? (
          <Card className="p-6 h-fit sticky top-6">
            <div className="flex items-start justify-between mb-4">
              <div><h2 className="font-bold text-lg">{active.subject}</h2><p className="text-sm text-muted-foreground mt-1">From {active.name} · {new Date(active.createdAt).toLocaleString()}</p></div>
              <Button variant="ghost" size="sm" onClick={() => setActive(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-2 text-sm mb-4 pb-4 border-b border-border">
              <p><span className="text-muted-foreground">Email:</span> <a href={`mailto:${active.email}`} className="text-brand hover:underline">{active.email}</a></p>
              {active.phone && <p><span className="text-muted-foreground">Phone:</span> {active.phone}</p>}
              {active.brand && active.brand !== "curemed" && <p><span className="text-muted-foreground">Brand:</span> {BRANDS[active.brand].name}</p>}
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{active.message}</p>
            <div className="flex gap-2 mt-6 pt-4 border-t border-border">
              <Button size="sm" variant="outline" onClick={() => { markRead.mutate({ id: active.id, read: !active.read }); setActive({ ...active, read: !active.read }); }} className="gap-1.5">
                {active.read ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />} Mark {active.read ? "unread" : "read"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => remove(active.id)} className="gap-1.5 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
            </div>
          </Card>
        ) : (
          <Card className="p-12 text-center text-muted-foreground h-fit"><Mail className="h-8 w-8 mx-auto mb-3 opacity-50" />Select a message to read</Card>
        )}
      </div>
    </div>
  );
}