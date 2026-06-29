import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  User,
  MapPin,
  Wallet,
  ReceiptText,
  Sparkles,
  Tag,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { useCreateOrder, useProfile } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { CouponInput, type AppliedCoupon } from "@/components/site/CouponInput";
import { COUNTRIES, findCountry, findGovernorate } from "@/lib/regionsData";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logOperation } from "@/lib/logs";
import { supabase } from "@/integrations/supabase/client";
import {
  ColorfulHeroBg,
  GlowCard,
  Icon3D,
  Reveal,
  type GradientKey,
} from "@/components/site/ColorfulFx";
import type { LucideIcon } from "lucide-react";
import { createMyFatoorahPayment, sha256Hex, saveGuestToken, type OnlinePaymentMethod } from "@/lib/payment";
import { canUseApplePay, canUseGooglePay } from "@/lib/deviceWallets";
import knetLogo from "@/assets/payment/knet.png";
import cardLogo from "@/assets/payment/visa-mastercard.png";
import applePayLogo from "@/assets/payment/apple-pay.png";
import googlePayLogo from "@/assets/payment/google-pay.png";


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

interface PaymentMethodItem {
  method: OnlinePaymentMethod;
  labelKey: string;
  logo: string;
}

// KNET + Visa/MasterCard are always offered; device wallets are appended at runtime.
const BASE_METHODS: PaymentMethodItem[] = [
  { method: "KNET", labelKey: "checkout.method.knet", logo: knetLogo },
  { method: "CARD", labelKey: "checkout.method.card", logo: cardLogo },
];

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
  const [onlineMethod, setOnlineMethod] = useState<OnlinePaymentMethod>("KNET");
  const [redirecting, setRedirecting] = useState(false);
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);

  // Available payment methods: KNET + Visa/MasterCard always; wallets only on
  // supported devices. Built once on mount to avoid SSR/hydration mismatches.
  const [methods, setMethods] = useState<PaymentMethodItem[]>(BASE_METHODS);
  useEffect(() => {
    const list = [...BASE_METHODS];
    if (canUseApplePay()) {
      list.push({ method: "APPLE_PAY", labelKey: "checkout.method.applePay", logo: applePayLogo });
    }
    if (canUseGooglePay()) {
      list.push({ method: "GOOGLE_PAY", labelKey: "checkout.method.googlePay", logo: googlePayLogo });
    }
    setMethods(list);
  }, []);


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
    // Online payment via MyFatoorah is the only checkout path. Authorize the
    // (possibly guest) payment with a one-time token. Only the SHA-256 hash is
    // stored on the order; the raw token stays in sessionStorage.
    const rawPaymentToken = crypto.randomUUID();
    const paymentTokenHash = await sha256Hex(rawPaymentToken);
    try {
      logOperation({ category: "order", operation: "checkout_started", status: "info", metadata: { items_count: items.length, subtotal, method: onlineMethod } });
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
        paymentMethod: "pay_by_link",
        couponCode: applied?.coupon.code ?? null,
        discountAmount: discount,
        paymentSessionTokenHash: paymentTokenHash,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.name,
          productImage: i.image,
          brand: i.brand,
          quantity: i.quantity,
          unitPrice: i.price,
        })),
      });

      // Notify admins of the new order (best-effort, never blocks checkout).
      void (async () => {
        try {
          const { data: settingRow } = await supabase
            .from("site_settings")
            .select("value")
            .eq("key", "whatsapp_integration")
            .maybeSingle();
          const settings: any = settingRow?.value ?? {};
          const adminNumbers: string[] = Array.isArray(settings.admin_numbers) ? settings.admin_numbers : [];
          const itemsSummary = items.map((i) => `• ${i.name} ×${i.quantity}`).join("\n");
          if (adminNumbers.length > 0) {
            void supabase.functions.invoke("send-whatsapp", {
              body: {
                event: "admin.new_order",
                to: adminNumbers,
                order_id: order.id,
                data: {
                  order_number: order.orderNumber,
                  customer_name: form.customerName,
                  customer_phone: form.customerPhone,
                  total: order.total.toFixed(2),
                  items_summary: itemsSummary,
                },
              },
            });
          }
        } catch (e) {
          console.warn("WhatsApp notify failed (non-blocking):", e);
        }
      })();

      // Create the MyFatoorah hosted payment and redirect.
      setRedirecting(true);
      saveGuestToken(order.id, rawPaymentToken);
      const res = await createMyFatoorahPayment(order.id, onlineMethod, rawPaymentToken);
      if (res.success && res.payment_url) {
        clear();
        saveCoupon(null);
        window.location.href = res.payment_url;
        return;
      }
      setRedirecting(false);
      toast.error(res.error || t("checkout.paymentFailed"));
    } catch (err: any) {
      setRedirecting(false);
      toast.error(err?.message || t("checkout.error.generic"));
    }
  };



  return (
    <SiteLayout>
      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden py-8 md:py-16">
        <ColorfulHeroBg />
        <div className="container">
          <Link
            to="/curemed"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand transition-colors animate-fade-in"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("checkout.continueShopping")}
          </Link>
          <h1 className="mt-3 text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight animate-fade-in [animation-delay:120ms]">
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
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  {t("checkout.paymentDesc")}
                </p>
                <div className="space-y-3">
                  {methods.map((m) => (
                    <MethodRow
                      key={m.method}
                      selected={onlineMethod === m.method}
                      onSelect={() => setOnlineMethod(m.method)}
                      logo={m.logo}
                      title={t(m.labelKey)}
                      currency={t("checkout.currency")}
                    />
                  ))}
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

                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={clear}
                    className="text-xs font-medium text-muted-foreground hover:text-rose-500 transition-colors mb-3"
                  >
                    {t("cart.clear")}
                  </button>
                )}

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
                  disabled={createOrder.isPending || redirecting}
                  className={cn(
                    "mt-6 w-full rounded-full font-semibold text-white",
                    "bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500",
                    "shadow-lg shadow-violet-500/30 hover:shadow-violet-500/60",
                    "transition-all duration-300 hover:scale-[1.02]",
                  )}
                >
                  {(createOrder.isPending || redirecting) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {!createOrder.isPending && !redirecting && <Sparkles className="h-4 w-4 mr-2" />}
                  {redirecting
                    ? t("checkout.redirecting")
                    : createOrder.isPending
                      ? t("checkout.creatingPayment")
                      : t("checkout.payNow")}
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

function MethodRow({
  selected,
  onSelect,
  logo,
  title,
  currency,
}: {
  selected: boolean;
  onSelect: () => void;
  logo: string;
  title: string;
  currency: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex w-full items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left transition-all duration-300",
        selected
          ? "border-sky-500 bg-sky-500/5 shadow-md shadow-sky-500/15"
          : "border-border bg-card/60 hover:border-sky-400/60 hover:-translate-y-0.5 hover:shadow-sm",
      )}
    >
      {/* Radio indicator */}
      <span
        className={cn(
          "relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          selected ? "border-sky-500" : "border-muted-foreground/40",
        )}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />}
      </span>

      {/* Logo */}
      <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg bg-white p-1 ring-1 ring-border/60">
        <img src={logo} alt={title} className="max-h-full max-w-full object-contain" />
      </span>

      {/* Label */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{title}</span>
        <span className="block text-xs text-muted-foreground">{currency}</span>
      </span>
    </button>
  );
}
