import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Search, Send, Shield, ShieldOff, Ban, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  useAdminUsers, useToggleAdminRole, useToggleUserBlock,
  useCreateNotification,
} from "@/lib/db";
import { cn } from "@/lib/utils";

export default function AdminUsers() {
  const { data: users = [], isLoading, isError, error } = useAdminUsers();
  const toggleAdmin = useToggleAdminRole();
  const toggleBlock = useToggleUserBlock();
  const [search, setSearch] = useState("");
  const [notifyUserId, setNotifyUserId] = useState<string | null>(null);
  const [notifyName, setNotifyName] = useState("");

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.profile.fullName.toLowerCase().includes(q) || u.profile.phone.includes(q);
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-6">
      <AdminPageHeader
        eyebrow="Users"
        eyebrowIcon={UserCog}
        title="Users"
        subtitle={`${users.length} registered · Manage roles, block, and send notifications.`}
        gradient="indigo-violet-purple"
      />


      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load users: {(error as Error)?.message ?? "Unknown error"}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users.</TableCell></TableRow>
            ) : (
              filtered.map((u) => (
                <TableRow key={u.profile.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {u.profile.avatarUrl ? (
                        <img src={u.profile.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover bg-muted" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-brand/10 text-brand inline-flex items-center justify-center text-xs font-bold">
                          {(u.profile.fullName || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium">{u.profile.fullName || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{u.profile.phone || "—"}</TableCell>
                  <TableCell className="text-sm">{u.orderCount}</TableCell>
                  <TableCell>
                    {u.isAdmin ? <Badge className="bg-brand/15 text-brand">Admin</Badge> : <Badge variant="secondary">Customer</Badge>}
                  </TableCell>
                  <TableCell>
                    {u.profile.isBlocked
                      ? <Badge className="bg-destructive/15 text-destructive">Blocked</Badge>
                      : <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Active</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm" variant="ghost"
                        title={u.isAdmin ? "Revoke admin" : "Make admin"}
                        onClick={async () => {
                          await toggleAdmin.mutateAsync({ userId: u.profile.id, makeAdmin: !u.isAdmin });
                          toast.success(u.isAdmin ? "Admin revoked" : "Admin granted");
                        }}
                      >
                        {u.isAdmin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        title={u.profile.isBlocked ? "Unblock" : "Block"}
                        className={cn(u.profile.isBlocked ? "text-emerald-600" : "text-destructive")}
                        onClick={async () => {
                          await toggleBlock.mutateAsync({ userId: u.profile.id, blocked: !u.profile.isBlocked });
                          toast.success(u.profile.isBlocked ? "User unblocked" : "User blocked");
                        }}
                      >
                        {u.profile.isBlocked ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" title="Send notification"
                        onClick={() => { setNotifyUserId(u.profile.id); setNotifyName(u.profile.fullName); }}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <NotifyDialog
        userId={notifyUserId}
        userName={notifyName}
        onClose={() => setNotifyUserId(null)}
      />
    </div>
  );
}

function NotifyDialog({ userId, userName, onClose }: { userId: string | null; userName: string; onClose: () => void }) {
  const create = useCreateNotification();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const send = async () => {
    if (!userId || !title.trim()) return;
    try {
      await create.mutateAsync({ userId, title: title.trim(), body: body.trim(), type: "system" });
      toast.success("Notification sent");
      setTitle(""); setBody(""); onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed");
    }
  };

  return (
    <Dialog open={!!userId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Send notification to {userName || "user"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Message</Label><Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={create.isPending || !title.trim()} className="bg-brand hover:bg-brand/90 text-white">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}