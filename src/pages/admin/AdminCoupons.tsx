import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, Ticket } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { toast } from "sonner";
import {
  useCoupons, useUpsertCoupon, useDeleteCoupon, type Coupon, type CouponType,
} from "@/lib/db";

const empty = (): { id?: string; code: string; description: string; discountType: CouponType; discountValue: number; minOrderAmount: number; maxUses: string; expiresAt: string; isActive: boolean; } => ({
  code: "", description: "", discountType: "percent", discountValue: 10,
  minOrderAmount: 0, maxUses: "", expiresAt: "", isActive: true,
});

export default function AdminCoupons() {
  const { data: coupons = [], isLoading } = useCoupons();
  const upsert = useUpsertCoupon();
  const remove = useDeleteCoupon();
  const [editing, setEditing] = useState<ReturnType<typeof empty> | null>(null);

  const open = (c?: Coupon) => {
    if (!c) return setEditing(empty());
    setEditing({
      id: c.id, code: c.code, description: c.description,
      discountType: c.discountType, discountValue: c.discountValue,
      minOrderAmount: c.minOrderAmount,
      maxUses: c.maxUses?.toString() ?? "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
      isActive: c.isActive,
    });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.code.trim()) return toast.error("Code is required");
    if (!editing.discountValue || editing.discountValue <= 0) return toast.error("Discount must be > 0");
    try {
      await upsert.mutateAsync({
        id: editing.id,
        code: editing.code,
        description: editing.description,
        discountType: editing.discountType,
        discountValue: Number(editing.discountValue),
        minOrderAmount: Number(editing.minOrderAmount) || 0,
        maxUses: editing.maxUses ? Number(editing.maxUses) : null,
        expiresAt: editing.expiresAt ? new Date(editing.expiresAt).toISOString() : null,
        isActive: editing.isActive,
      });
      toast.success("Coupon saved");
      setEditing(null);
    } catch (err: any) {
      toast.error(err?.message || "Save failed");
    }
  };

  return (
    <div className="p-6 md:p-10 w-full max-w-none space-y-6">
      <AdminPageHeader
        eyebrow="Coupons"
        eyebrowIcon={Ticket}
        title="Coupons"
        subtitle={`${coupons.length} coupons total.`}
        gradient="amber-orange-rose"
        actions={
          <Button onClick={() => open()} className="bg-brand hover:bg-brand/90 text-white">
            <Plus className="h-4 w-4 mr-1" /> New coupon
          </Button>
        }
      />


      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Min order</TableHead>
              <TableHead>Used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
            ) : coupons.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No coupons yet.</TableCell></TableRow>
            ) : (
              coupons.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-bold">{c.code}</TableCell>
                  <TableCell>{c.discountType === "percent" ? `${c.discountValue}%` : `KD ${c.discountValue}`}</TableCell>
                  <TableCell>KD {c.minOrderAmount.toFixed(2)}</TableCell>
                  <TableCell>{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ""}</TableCell>
                  <TableCell className="text-sm">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    {c.isActive
                      ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Active</Badge>
                      : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => open(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive"
                      onClick={async () => {
                        if (!confirm(`Delete coupon ${c.code}?`)) return;
                        await remove.mutateAsync(c.id);
                        toast.success("Deleted");
                      }}>
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
          <DialogHeader><DialogTitle>{editing?.id ? "Edit coupon" : "New coupon"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Code</Label><Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="e.g. WELCOME10" /></div>
              <div><Label>Description</Label><Textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={editing.discountType} onValueChange={(v: CouponType) => setEditing({ ...editing, discountType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent (%)</SelectItem>
                      <SelectItem value="fixed">Fixed (KD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Value</Label><Input type="number" min={0} step="0.01" value={editing.discountValue} onChange={(e) => setEditing({ ...editing, discountValue: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Min order (KD)</Label><Input type="number" min={0} step="0.01" value={editing.minOrderAmount} onChange={(e) => setEditing({ ...editing, minOrderAmount: Number(e.target.value) })} /></div>
                <div><Label>Max uses</Label><Input type="number" min={0} value={editing.maxUses} onChange={(e) => setEditing({ ...editing, maxUses: e.target.value })} placeholder="Unlimited" /></div>
              </div>
              <div><Label>Expires at</Label><Input type="date" value={editing.expiresAt} onChange={(e) => setEditing({ ...editing, expiresAt: e.target.value })} /></div>
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