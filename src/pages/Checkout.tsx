import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Banknote, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { useCreateOrder, useProfile, type PaymentMethod } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { KW_AREAS } from "@/lib/kuwaitData";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function Checkout() {
  const { items, subtotal, clear } = useCart();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const createOrder = useCreateOrder();
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);

  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    city: "Kuwait",
    area: "",
    block: "",
    street: "",
    building: "",
    addressLine: "",
    notes: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");

  useEffect(() => {
    if (!profile) return;
    setForm((f) => ({
      ...f,
      customerName: f.customerName || profile.fullName,
      customerEmail: f.customerEmail || user?.email || "",
      customerPhone: f.customerPhone || profile.phone,
      city: profile.city || f.city,
      area: f.area || profile.area,
      block: f.block || profile.block,
      street: f.street || profile.street,
      building: f.building || profile.building,
      addressLine: f.addressLine || profile.addressLine,
    }));
  }, [profile, user]);

  const set = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (items.length === 0) {
    return (
      <SiteLayout>
        <section className="container py-16 text-center">
          <h1 className="text-2xl font-bold">{t("cart.empty.title")}</h1>
          <Button asChild className="mt-6 bg-brand hover:bg-brand/90 text-white">
            <Link to="/curemed">{t("cart.empty.cta")}</Link>
          </Button>
        </section>
      </SiteLayout>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName.trim() || !form.customerEmail.trim() || !form.customerPhone.trim()) {
      toast.error(t("checkout.error.required"));
      return;
    }
    if (!form.area || !form.block.trim() || !form.street.trim()) {
      toast.error(t("checkout.error.address"));
      return;
    }
    try {
      const order = await createOrder.mutateAsync({
        ...form,
        paymentMethod,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.name,
          productImage: i.image,
          brand: i.brand,
          quantity: i.quantity,
          unitPrice: i.price,
        })),
      });
      clear();
      toast.success(t("checkout.success"));
      navigate(`/order-confirmation/${order.id}`);
    } catch (err: any) {
      toast.error(err?.message || t("checkout.error.generic"));
    }
  };

  return (
    <SiteLayout>
      <div className="bg-brand-soft border-b border-border/40">
        <div className="container py-3 text-sm text-muted-foreground">
          <Link to="/cart" className="inline-flex items-center gap-1 hover:text-brand">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("cart.title")}
          </Link>
        </div>
      </div>
      <section className="container py-10 md:py-14">
        <h1 className="text-3xl font-bold mb-8">{t("checkout.title")}</h1>
        <form onSubmit={submit} className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-bold text-lg mb-4">{t("checkout.contact")}</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label>{t("checkout.fullName")} *</Label>
                  <Input value={form.customerName} onChange={(e) => set("customerName", e.target.value)} required />
                </div>
                <div>
                  <Label>{t("checkout.email")} *</Label>
                  <Input type="email" value={form.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} required />
                </div>
                <div>
                  <Label>{t("checkout.phone")} *</Label>
                  <Input type="tel" value={form.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} required />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-bold text-lg mb-4">{t("checkout.address")}</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t("checkout.city")}</Label>
                  <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
                </div>
                <div>
                  <Label>{t("checkout.area")} *</Label>
                  <select
                    value={form.area}
                    onChange={(e) => set("area", e.target.value)}
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">{t("checkout.areaSelect")}</option>
                    {KW_AREAS.map((a) => (
                      <option key={a.en} value={a.en}>
                        {lang === "ar" ? a.ar : a.en}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{t("checkout.block")} *</Label>
                  <Input value={form.block} onChange={(e) => set("block", e.target.value)} required />
                </div>
                <div>
                  <Label>{t("checkout.street")} *</Label>
                  <Input value={form.street} onChange={(e) => set("street", e.target.value)} required />
                </div>
                <div>
                  <Label>{t("checkout.building")}</Label>
                  <Input value={form.building} onChange={(e) => set("building", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>{t("checkout.addressLine")}</Label>
                  <Input value={form.addressLine} onChange={(e) => set("addressLine", e.target.value)} placeholder={t("checkout.addressLinePh")} />
                </div>
                <div className="sm:col-span-2">
                  <Label>{t("checkout.notes")}</Label>
                  <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-bold text-lg mb-4">{t("checkout.payment")}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <PaymentOption
                  selected={paymentMethod === "cod"}
                  onSelect={() => setPaymentMethod("cod")}
                  icon={<Banknote className="h-5 w-5" />}
                  title={t("checkout.cod")}
                  desc={t("checkout.codDesc")}
                />
                <PaymentOption
                  selected={paymentMethod === "pay_by_link"}
                  onSelect={() => setPaymentMethod("pay_by_link")}
                  icon={<CreditCard className="h-5 w-5" />}
                  title={t("checkout.payByLink")}
                  desc={t("checkout.payByLinkDesc")}
                />
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-border bg-card p-6 h-fit lg:sticky lg:top-28">
            <h2 className="font-bold text-lg mb-4">{t("cart.summary")}</h2>
            <ul className="divide-y divide-border mb-4">
              {items.map((i) => (
                <li key={i.productId} className="flex gap-3 py-2.5 text-sm">
                  <img src={i.image} alt="" className="h-12 w-12 rounded-lg object-cover bg-brand-soft" />
                  <div className="flex-1 min-w-0">
                    <p className="line-clamp-1 font-medium">{lang === "ar" && i.nameAr ? i.nameAr : i.name}</p>
                    <p className="text-xs text-muted-foreground">×{i.quantity}</p>
                  </div>
                  <p className="font-semibold">KD {(i.price * i.quantity).toFixed(2)}</p>
                </li>
              ))}
            </ul>
            <div className="space-y-1 text-sm border-t border-border pt-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                <span>KD {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2">
                <span>{t("cart.total")}</span>
                <span>KD {subtotal.toFixed(2)}</span>
              </div>
            </div>
            <Button
              type="submit"
              disabled={createOrder.isPending}
              className="mt-5 w-full bg-brand hover:bg-brand/90 text-white"
            >
              {createOrder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("checkout.placeOrder")}
            </Button>
          </aside>
        </form>
      </section>
    </SiteLayout>
  );
}

function PaymentOption({
  selected, onSelect, icon, title, desc,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "text-left rounded-xl border-2 p-4 transition-colors",
        selected ? "border-brand bg-brand/5" : "border-border hover:border-brand/40",
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        <span className={cn("h-8 w-8 rounded-full inline-flex items-center justify-center", selected ? "bg-brand text-white" : "bg-muted")}>
          {icon}
        </span>
        {title}
      </div>
      <p className="text-xs text-muted-foreground mt-2">{desc}</p>
    </button>
  );
}