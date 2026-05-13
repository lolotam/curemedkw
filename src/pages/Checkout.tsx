import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CreditCard,
  Banknote,
  Loader2,
  User,
  MapPin,
  Wallet,
  ReceiptText,
  Sparkles,
  Tag,
  ShoppingBag,
  Globe,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
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
import { CouponInput, type AppliedCoupon } from "@/components/site/CouponInput";
import { COUNTRIES, findCountry, findGovernorate } from "@/lib/regionsData";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ColorfulHeroBg,
  GlowCard,
  Icon3D,
  Reveal,
  type GradientKey,
} from "@/components/site/ColorfulFx";
import type { LucideIcon } from "lucide-react";

const COUPON_KEY = "curemed.appliedCoupon";
function loadCoupon(): AppliedCoupon | null {
  try {
    const raw = sessionStorage.getItem(COUPON_KEY);
    return raw ? (JSON.parse(raw) as AppliedCoupon) : null;
  } catch { return null; }
}
function saveCoupon(c: AppliedCoupon | null) {
  if (c) sessionStorage.setItem(COUPON_KEY, JSON.stringify(c));
  else sessionStorage.removeItem(COUPON_KEY);
}

export default function Checkout() {
  const { items, subtotal, clear, setQuantity, remove } = useCart();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const createOrder = useCreateOrder();
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);

  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    country: "Kuwait",
    governorate: "",
    area: "",
    block: "",
    street: "",
    building: "",
    addressLine: "",
    notes: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);

  useEffect(() => { setApplied(loadCoupon()); }, []);
  useEffect(() => {
    if (applied && subtotal < applied.coupon.minOrderAmount) {
      setApplied(null);
      saveCoupon(null);
    }
  }, [subtotal, applied]);

  const discount = applied ? Math.min(applied.discount, subtotal) : 0;
  const total = Math.max(0, subtotal - discount);

  useEffect(() => {
    if (!profile) return;
    setForm((f) => ({
      ...f,
      customerName: f.customerName || profile.fullName,
      customerEmail: f.customerEmail || user?.email || "",
      customerPhone: f.customerPhone || profile.phone,
      country: profile.country || f.country,
      governorate: profile.governorate || f.governorate,
      area: f.area || profile.area,
      block: f.block || profile.block,
      street: f.street || profile.street,
      building: f.building || profile.building,
      addressLine: f.addressLine || profile.addressLine,
    }));
  }, [profile, user]);

  const set = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const selectedCountry = useMemo(() => findCountry(form.country), [form.country]);
  const selectedGov = useMemo(
    () => findGovernorate(form.country, form.governorate),
    [form.country, form.governorate],
  );
  const govOptions = selectedCountry?.governorates ?? [];
  const areaOptions = selectedGov?.areas ?? [];

  const onCountryChange = (val: string) =>
    setForm((f) => ({ ...f, country: val, governorate: "", area: "" }));
  const onGovChange = (val: string) =>
    setForm((f) => ({ ...f, governorate: val, area: "" }));

  if (items.length === 0) {
    return (
      <SiteLayout>
        <section className="relative overflow-hidden py-24 md:py-32">
          <ColorfulHeroBg />
          <div className="container max-w-xl text-center">
            <Reveal>
              <div className="flex justify-center">
                <Icon3D icon={ShoppingBag} variant="violet" size="lg" />
              </div>
              <h1 className="mt-6 text-4xl md:text-5xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
                  {t("cart.empty.title")}
                </span>
              </h1>
              <Button
                asChild
                size="lg"
                className="mt-8 rounded-full bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 text-white shadow-lg shadow-violet-500/30 hover:scale-105 transition-all"
              >
                <Link to="/curemed">
                  <Sparkles className="h-4 w-4 mr-2" />
                  {t("cart.empty.cta")}
                </Link>
              </Button>
            </Reveal>
          </div>
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
    if (!form.country || !form.governorate) {
      toast.error(t("checkout.error.country"));
      return;
    }
    if (!form.area || !form.block.trim() || !form.street.trim()) {
      toast.error(t("checkout.error.address"));
      return;
    }
    try {
      const order = await createOrder.mutateAsync({
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        country: form.country,
        governorate: form.governorate,
        // Keep `city` populated for backwards-compatible admin views.
        city: form.governorate,
        area: form.area,
        block: form.block,
        street: form.street,
        building: form.building,
        addressLine: form.addressLine,
        notes: form.notes,
        paymentMethod,
        couponCode: applied?.coupon.code ?? null,
        discountAmount: discount,
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
      saveCoupon(null);
      toast.success(t("checkout.success"));
      navigate(`/order-confirmation/${order.id}`);
    } catch (err: any) {
      toast.error(err?.message || t("checkout.error.generic"));
    }
  };

  return (
    <SiteLayout>
      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden py-16 md:py-20">
        <ColorfulHeroBg />
        <div className="container">
          <Link
            to="/cart"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand transition-colors animate-fade-in"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("cart.title")}
          </Link>
          <h1 className="mt-4 text-4xl md:text-6xl font-bold tracking-tight animate-fade-in [animation-delay:120ms]">
            <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
              {t("checkout.title")}
            </span>
          </h1>
        </div>
      </section>

      {/* ===================== FORM + SUMMARY ===================== */}
      <section className="container pb-20 md:pb-24">
        <form onSubmit={submit} className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-7">
            {/* Contact */}
            <Reveal>
              <SectionCard
                icon={User}
                variant="sky"
                title={t("checkout.contact")}
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label>{t("checkout.fullName")} *</Label>
                    <Input
                      value={form.customerName}
                      onChange={(e) => set("customerName", e.target.value)}
                      required
                      className="mt-1.5 h-11 rounded-xl bg-background/70 backdrop-blur focus-visible:ring-sky-500"
                    />
                  </div>
                  <div>
                    <Label>{t("checkout.email")} *</Label>
                    <Input
                      type="email"
                      value={form.customerEmail}
                      onChange={(e) => set("customerEmail", e.target.value)}
                      required
                      className="mt-1.5 h-11 rounded-xl bg-background/70 backdrop-blur focus-visible:ring-sky-500"
                    />
                  </div>
                  <div>
                    <Label>{t("checkout.phone")} *</Label>
                    <Input
                      type="tel"
                      value={form.customerPhone}
                      onChange={(e) => set("customerPhone", e.target.value)}
                      required
                      className="mt-1.5 h-11 rounded-xl bg-background/70 backdrop-blur focus-visible:ring-sky-500"
                    />
                  </div>
                </div>
              </SectionCard>
            </Reveal>

            {/* Address */}
            <Reveal delay={100}>
              <SectionCard
                icon={MapPin}
                variant="emerald"
                title={t("checkout.address")}
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>{t("checkout.country")} *</Label>
                    <select
                      value={form.country}
                      onChange={(e) => onCountryChange(e.target.value)}
                      required
                      className="mt-1.5 flex h-11 w-full rounded-xl border border-input bg-background/70 backdrop-blur px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">{t("checkout.countrySelect")}</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.en}>
                          {lang === "ar" ? c.ar : c.en}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{t("checkout.governorate")} *</Label>
                    <select
                      value={form.governorate}
                      onChange={(e) => onGovChange(e.target.value)}
                      required
                      disabled={!selectedCountry}
                      className="mt-1.5 flex h-11 w-full rounded-xl border border-input bg-background/70 backdrop-blur px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                    >
                      <option value="">{t("checkout.governorateSelect")}</option>
                      {govOptions.map((g) => (
                        <option key={g.en} value={g.en}>
                          {lang === "ar" ? g.ar : g.en}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{t("checkout.area")} *</Label>
                    <select
                      value={form.area}
                      onChange={(e) => set("area", e.target.value)}
                      required
                      disabled={!selectedGov}
                      className="mt-1.5 flex h-11 w-full rounded-xl border border-input bg-background/70 backdrop-blur px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                    >
                      <option value="">{t("checkout.areaSelect")}</option>
                      {areaOptions.map((a) => (
                        <option key={a.en} value={a.en}>
                          {lang === "ar" ? a.ar : a.en}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{t("checkout.block")} *</Label>
                    <Input
                      value={form.block}
                      onChange={(e) => set("block", e.target.value)}
                      required
                      className="mt-1.5 h-11 rounded-xl bg-background/70 backdrop-blur focus-visible:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <Label>{t("checkout.street")} *</Label>
                    <Input
                      value={form.street}
                      onChange={(e) => set("street", e.target.value)}
                      required
                      className="mt-1.5 h-11 rounded-xl bg-background/70 backdrop-blur focus-visible:ring-emerald-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t("checkout.building")}</Label>
                    <Input
                      value={form.building}
                      onChange={(e) => set("building", e.target.value)}
                      className="mt-1.5 h-11 rounded-xl bg-background/70 backdrop-blur focus-visible:ring-emerald-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t("checkout.addressLine")}</Label>
                    <Input
                      value={form.addressLine}
                      onChange={(e) => set("addressLine", e.target.value)}
                      placeholder={t("checkout.addressLinePh")}
                      className="mt-1.5 h-11 rounded-xl bg-background/70 backdrop-blur focus-visible:ring-emerald-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t("checkout.notes")}</Label>
                    <Textarea
                      rows={3}
                      value={form.notes}
                      onChange={(e) => set("notes", e.target.value)}
                      className="mt-1.5 rounded-xl bg-background/70 backdrop-blur focus-visible:ring-emerald-500"
                    />
                  </div>
                </div>
              </SectionCard>
            </Reveal>

            {/* Payment */}
            <Reveal delay={200}>
              <SectionCard
                icon={Wallet}
                variant="amber"
                title={t("checkout.payment")}
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  <PaymentOption
                    selected={paymentMethod === "cod"}
                    onSelect={() => setPaymentMethod("cod")}
                    icon={Banknote}
                    title={t("checkout.cod")}
                    desc={t("checkout.codDesc")}
                    variant="amber"
                  />
                  <PaymentOption
                    selected={paymentMethod === "pay_by_link"}
                    onSelect={() => setPaymentMethod("pay_by_link")}
                    icon={CreditCard}
                    title={t("checkout.payByLink")}
                    desc={t("checkout.payByLinkDesc")}
                    variant="violet"
                  />
                </div>
              </SectionCard>
            </Reveal>
          </div>

          {/* Summary */}
          <aside className="h-fit lg:sticky lg:top-28">
            <Reveal delay={150}>
              <GlowCard variant="violet" className="p-6 md:p-7">
                <div className="flex items-center gap-3 mb-5">
                  <Icon3D icon={ReceiptText} variant="violet" size="sm" />
                  <h2 className="font-bold text-lg">
                    <span className="bg-gradient-to-r from-violet-500 to-pink-500 bg-clip-text text-transparent">
                      {t("cart.summary")}
                    </span>
                  </h2>
                </div>

                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {t("checkout.editCart")}
                </p>
                <ul className="divide-y divide-border/60 mb-4 max-h-80 overflow-y-auto pr-1 -mr-1">
                  {items.map((i) => (
                    <li key={i.productId} className="flex gap-3 py-3 text-sm">
                      <img
                        src={i.image}
                        alt=""
                        width={112}
                        height={112}
                        className="h-14 w-14 rounded-xl object-cover bg-brand-soft ring-1 ring-border/60 shrink-0"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <p className="line-clamp-2 font-medium leading-snug">
                          {lang === "ar" && i.nameAr ? i.nameAr : i.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="inline-flex items-center rounded-full border border-border/70 bg-background/70 backdrop-blur overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setQuantity(i.productId, i.quantity - 1)}
                              aria-label={t("cart.decrease")}
                              className="h-7 w-7 grid place-items-center hover:bg-gradient-to-br hover:from-sky-500/20 hover:to-violet-500/20 transition-colors"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="px-2 min-w-[1.75rem] text-center text-xs font-bold tabular-nums">
                              {i.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => setQuantity(i.productId, i.quantity + 1)}
                              aria-label={t("cart.increase")}
                              className="h-7 w-7 grid place-items-center hover:bg-gradient-to-br hover:from-sky-500/20 hover:to-violet-500/20 transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(i.productId)}
                            aria-label={t("cart.remove")}
                            className="h-7 w-7 grid place-items-center rounded-full border border-rose-500/30 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="font-semibold whitespace-nowrap self-start">
                        KD {(i.price * i.quantity).toFixed(2)}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="mb-4">
                  <CouponInput
                    subtotal={subtotal}
                    applied={applied}
                    onApply={(a) => { setApplied(a); saveCoupon(a); }}
                    onRemove={() => { setApplied(null); saveCoupon(null); }}
                  />
                </div>

                <div className="space-y-3 text-sm border-t border-border/60 pt-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                    <span className="font-semibold">KD {subtotal.toFixed(2)}</span>
                  </div>
                  {applied && (
                    <div className="flex justify-between items-center rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 px-3 py-2 border border-emerald-500/20">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        <Tag className="h-3.5 w-3.5" />
                        {applied.coupon.code}
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        −KD {discount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline pt-2">
                    <span className="font-semibold text-base">{t("cart.total")}</span>
                    <span className="font-extrabold text-2xl bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
                      KD {total.toFixed(2)}
                    </span>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={createOrder.isPending}
                  className={cn(
                    "mt-6 w-full rounded-full font-semibold text-white",
                    "bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500",
                    "shadow-lg shadow-violet-500/30 hover:shadow-violet-500/60",
                    "transition-all duration-300 hover:scale-[1.02]",
                  )}
                >
                  {createOrder.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <Sparkles className="h-4 w-4 mr-2" />
                  {t("checkout.placeOrder")}
                </Button>
              </GlowCard>
            </Reveal>
          </aside>
        </form>
      </section>
    </SiteLayout>
  );
}

function SectionCard({
  icon,
  variant,
  title,
  children,
}: {
  icon: LucideIcon;
  variant: GradientKey;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <GlowCard variant={variant} className="p-6 md:p-7">
      <div className="flex items-center gap-3 mb-5">
        <Icon3D icon={icon} variant={variant} size="sm" />
        <h2 className="font-bold text-lg md:text-xl">{title}</h2>
      </div>
      {children}
    </GlowCard>
  );
}

function PaymentOption({
  selected,
  onSelect,
  icon: Icon,
  title,
  desc,
  variant,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: LucideIcon;
  title: string;
  desc: string;
  variant: GradientKey;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative text-left rounded-2xl p-5 transition-all duration-300",
        "border-2 backdrop-blur",
        selected
          ? "border-transparent bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-pink-500/10 shadow-lg shadow-violet-500/20 scale-[1.02]"
          : "border-border bg-card/60 hover:border-brand/40 hover:-translate-y-1 hover:shadow-md",
      )}
    >
      {selected && (
        <span className="absolute -top-2 -right-2 rtl:right-auto rtl:-left-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 via-violet-500 to-pink-500 text-white text-[10px] font-bold shadow-md">
          ✓
        </span>
      )}
      <div className="flex items-center gap-3 font-semibold">
        <Icon3D icon={Icon} variant={variant} size="sm" />
        <span className="text-base">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{desc}</p>
    </button>
  );
}