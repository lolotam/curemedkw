import { useMemo, useState } from "react";
import { Loader2, Package, Eye, Trash2, Search, MessageSquare, Send, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useOrders, useOrder, useUpdateOrder, useDeleteOrder,
  useCreateNotification,
  type OrderStatus, type PaymentStatus,
} from "@/lib/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { orderDeletionErrorMessage } from "@/lib/orderDeletion";

const STATUS_COLORS: Record<OrderStatus, string> = {
  new: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  confirmed: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  processing: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  shipped: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  delivered: "bg-green-500/10 text-green-700 dark:text-green-300",
  cancelled: "bg-red-500/10 text-red-700 dark:text-red-300",
};

const PAY_COLORS: Record<PaymentStatus, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  pending_payment: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  pending_status_update: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  paid: "bg-green-500/10 text-green-700 dark:text-green-300",
  failed: "bg-red-500/10 text-red-700 dark:text-red-300",
  payment_failed: "bg-red-500/10 text-red-700 dark:text-red-300",
  payment_cancelled: "bg-red-500/10 text-red-700 dark:text-red-300",
  payment_expired: "bg-red-500/10 text-red-700 dark:text-red-300",
  refunded: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  partially_refunded: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
};

export default function AdminOrders() {
  const { data: orders = [], isLoading } = useOrders();
  const updateOrder = useUpdateOrder();
  const deleteOrder = useDeleteOrder();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [payFilter, setPayFilter] = useState<PaymentStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.orderStatus !== statusFilter) return false;
      if (payFilter !== "all" && o.paymentStatus !== payFilter) return false;
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        o.customerEmail.toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter, payFilter]);

  return (
    <div className="p-6 md:p-10 w-full max-w-none space-y-6">
      <AdminPageHeader
        eyebrow="Orders"
        eyebrowIcon={Package}
        title="Orders"
        subtitle={`${orders.length} orders total`}
        gradient="emerald-teal-cyan"
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-56"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(["new", "confirmed", "processing", "shipped", "delivered", "cancelled"] as OrderStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={payFilter} onValueChange={(v) => setPayFilter(v as any)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                {(["pending", "pending_payment", "paid", "payment_failed", "pending_status_update", "refunded"] as PaymentStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />


      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No orders found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setOpenId(o.id)}>
                  <TableCell className="font-mono font-semibold">{o.orderNumber}</TableCell>
                  <TableCell>
                    <div className="font-medium">{o.customerName}</div>
                    <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
                  </TableCell>
                  <TableCell className="font-semibold">KD {o.total.toFixed(2)}</TableCell>
                  <TableCell>
                    <span className={cn("text-[10px] uppercase font-semibold rounded-full px-2 py-1", PAY_COLORS[o.paymentStatus])}>
                      {o.paymentStatus}
                    </span>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {o.paymentMethod === "cod" ? "COD" : "Online"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={cn("text-[10px] uppercase font-semibold rounded-full px-2 py-1", STATUS_COLORS[o.orderStatus])}>
                      {o.orderStatus}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(o.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setOpenId(o.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive" aria-label={`Delete order ${o.orderNumber}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete order {o.orderNumber}?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                try {
                                  await deleteOrder.mutateAsync(o.id);
                                  toast.success("Order deleted");
                                } catch (error) {
                                  toast.error(orderDeletionErrorMessage(error));
                                }
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <OrderDetailDialog
        orderId={openId}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function OrderDetailDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { data: order, isLoading } = useOrder(orderId ?? undefined);
  const updateOrder = useUpdateOrder();
  const notify = useCreateNotification();
  const [adminNotes, setAdminNotes] = useState("");
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Sync notes when order loads
  const noteValue = adminNotes !== "" ? adminNotes : order?.adminNotes ?? "";

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => { if (!o) { onClose(); setAdminNotes(""); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order {order?.orderNumber}</DialogTitle>
        </DialogHeader>
        {isLoading || !order ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <Section title="Customer">
                <p className="font-semibold">{order.customerName}</p>
                <p className="text-muted-foreground">{order.customerEmail}</p>
                <p className="text-muted-foreground">{order.customerPhone}</p>
                <a
                  href={`https://wa.me/${order.customerPhone.replace(/\D/g, "")}`}
                  target="_blank" rel="noreferrer"
                  className="text-xs text-brand hover:underline mt-1 inline-block"
                >
                  Open WhatsApp →
                </a>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a
                      href={`https://wa.me/${order.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
                        `Hi ${order.customerName}, regarding your Curemed order #${order.orderNumber}:`
                      )}`}
                      target="_blank" rel="noreferrer"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </Button>
                  {order.userId && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMsgOpen(true)}>
                      <Send className="h-3.5 w-3.5" /> Send notification
                    </Button>
                  )}
                </div>
              </Section>
              <Section title="Address">
                <p>{order.city}, {order.area}</p>
                <p>Block {order.block}, Street {order.street}</p>
                {order.building && <p>Building {order.building}</p>}
                {order.addressLine && <p className="text-muted-foreground">{order.addressLine}</p>}
              </Section>
            </div>

            {order.notes && (
              <Section title="Customer notes">
                <p className="text-sm">{order.notes}</p>
              </Section>
            )}

            <Section title="Items">
              <ul className="divide-y divide-border">
                {order.items?.map((i) => (
                  <li key={i.id} className="flex gap-3 py-3">
                    {i.productImageSnapshot && (
                      <img src={i.productImageSnapshot} alt="" className="h-12 w-12 rounded-lg object-cover bg-muted" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{i.productNameSnapshot}</p>
                      <p className="text-xs text-muted-foreground">{i.brandSnapshot} · ×{i.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold">KD {Number(i.lineTotal).toFixed(2)}</p>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border pt-3 mt-1 space-y-1 text-sm">
                <Row label="Subtotal" value={`KD ${order.subtotal.toFixed(2)}`} />
                {order.discountAmount > 0 && (
                  <Row label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`} value={`- KD ${order.discountAmount.toFixed(2)}`} />
                )}
                <Row label="Total" value={`KD ${order.total.toFixed(2)}`} bold />
              </div>
            </Section>

            {(order.paymentProvider && order.paymentProvider !== "none") && (
              <Section title="Payment details">
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <PayRow label="Provider" value={order.paymentProvider} />
                  <PayRow label="Method" value={order.paymentOnlineMethod || order.paymentMethod} />
                  <PayRow
                    label="Amount"
                    value={order.paymentAmount != null ? `${order.paymentCurrency || "KWD"} ${order.paymentAmount.toFixed(3)}` : null}
                  />
                  <PayRow label="Status" value={order.paymentStatus} />
                  <PayRow label="Invoice ID" value={order.myfatoorahInvoiceId} copyable />
                  <PayRow label="Payment ID" value={order.myfatoorahPaymentId} copyable />
                  <PayRow label="Transaction ID" value={order.myfatoorahTransactionId} copyable />
                  <PayRow label="Reference ID" value={order.myfatoorahReferenceId} copyable />
                  <PayRow label="Track ID" value={order.myfatoorahTrackId} copyable />
                  <PayRow
                    label="Card"
                    value={order.myfatoorahCardBrand || order.myfatoorahCardLast4
                      ? `${order.myfatoorahCardBrand || ""} ${order.myfatoorahCardLast4 ? `•••• ${order.myfatoorahCardLast4}` : ""}`.trim()
                      : null}
                  />
                  <PayRow label="Paid at" value={order.paidAt ? new Date(order.paidAt).toLocaleString() : null} />
                  <PayRow label="Failed at" value={order.failedAt ? new Date(order.failedAt).toLocaleString() : null} />
                  <PayRow label="Last verified" value={order.paymentVerifiedAt ? new Date(order.paymentVerifiedAt).toLocaleString() : null} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {order.myfatoorahPaymentId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={verifying}
                      onClick={async () => {
                        setVerifying(true);
                        try {
                          const { data, error } = await supabase.functions.invoke("verify-myfatoorah-payment", {
                            body: { payment_id: order.myfatoorahPaymentId, order_id: order.id },
                          });
                          if (error) throw error;
                          toast.success(`Payment status: ${data?.payment_status ?? "updated"}`);
                        } catch (e: any) {
                          toast.error(e?.message || "Verification failed");
                        } finally {
                          setVerifying(false);
                        }
                      }}
                    >
                      {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                      Verify payment now
                    </Button>
                  )}
                  {order.myfatoorahPaymentUrl && order.paymentStatus !== "paid" && (
                    <Button asChild size="sm" variant="outline" className="gap-1.5">
                      <a href={order.myfatoorahPaymentUrl} target="_blank" rel="noreferrer">
                        Open payment URL →
                      </a>
                    </Button>
                  )}
                </div>
              </Section>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase font-semibold text-muted-foreground">Order status</label>
                <Select
                  value={order.orderStatus}
                  onValueChange={async (v) => {
                    await updateOrder.mutateAsync({ id: order.id, patch: { orderStatus: v as OrderStatus } });
                    if (order.userId) {
                      void notify.mutateAsync({
                        userId: order.userId,
                        title: `Order #${order.orderNumber} ${v}`,
                        body: `Your order status has been updated to ${v}.`,
                        type: "order",
                        link: `/order-confirmation/${order.id}`,
                      });
                    }
                    if (v === "shipped" && order.customerPhone) {
                      void supabase.functions.invoke("send-whatsapp", {
                        body: {
                          event: "order.shipped",
                          to: [order.customerPhone],
                          order_id: order.id,
                          data: { order_number: order.orderNumber, customer_name: order.customerName },
                        },
                      });
                    }
                    toast.success("Status updated");
                  }}
                >
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["new", "confirmed", "processing", "shipped", "delivered", "cancelled"] as OrderStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase font-semibold text-muted-foreground">Payment status</label>
                <Select
                  value={order.paymentStatus}
                  onValueChange={async (v) => {
                    await updateOrder.mutateAsync({ id: order.id, patch: { paymentStatus: v as PaymentStatus } });
                    toast.success("Payment updated");
                  }}
                >
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["pending", "pending_payment", "paid", "failed", "payment_failed", "payment_cancelled", "payment_expired", "pending_status_update", "refunded", "partially_refunded"] as PaymentStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs uppercase font-semibold text-muted-foreground">Admin notes</label>
              <Textarea
                rows={3}
                value={noteValue}
                onChange={(e) => setAdminNotes(e.target.value)}
                className="mt-1.5"
                placeholder="Internal notes…"
              />
              <Button
                size="sm"
                className="mt-2 bg-brand hover:bg-brand/90 text-white"
                onClick={async () => {
                  await updateOrder.mutateAsync({ id: order.id, patch: { adminNotes: noteValue } });
                  toast.success("Notes saved");
                }}
              >
                Save notes
              </Button>
            </div>
          </div>
        )}
        {order && (
          <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Message {order.customerName}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Title</Label>
                  <Input value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} placeholder="e.g. Update on your order" />
                </div>
                <div>
                  <Label>Message</Label>
                  <Textarea rows={4} value={msgBody} onChange={(e) => setMsgBody(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMsgOpen(false)}>Cancel</Button>
                <Button
                  className="bg-brand hover:bg-brand/90 text-white"
                  disabled={!msgTitle.trim() || !order.userId || notify.isPending}
                  onClick={async () => {
                    if (!order.userId) return;
                    await notify.mutateAsync({
                      userId: order.userId,
                      title: msgTitle.trim(),
                      body: msgBody.trim(),
                      type: "message",
                      link: `/order-confirmation/${order.id}`,
                    });
                    toast.success("Message sent");
                    setMsgTitle(""); setMsgBody(""); setMsgOpen(false);
                  }}
                >
                  {notify.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Send
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="text-xs uppercase font-semibold text-muted-foreground mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between", bold && "font-bold text-base pt-1")}>
      <span className={cn(!bold && "text-muted-foreground")}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function PayRow({ label, value, copyable }: { label: string; value?: string | null; copyable?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-medium truncate max-w-[60%] text-right">
        <span className="truncate">{value}</span>
        {copyable && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </span>
    </div>
  );
}
