import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle, Clock, ShoppingBag, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";
import { verifyMyFatoorahPayment, getGuestToken, type VerifyPaymentResult } from "@/lib/payment";
import { ColorfulHeroBg, GlowCard, Icon3D, Reveal } from "@/components/site/ColorfulFx";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart";

type State = "verifying" | "success" | "failed" | "pending";

export default function PaymentCallback() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { clear } = useCart();
  const [state, setState] = useState<State>("verifying");
  const [result, setResult] = useState<VerifyPaymentResult | null>(null);
  const ran = useRef(false);

  const paymentId = params.get("paymentId") || params.get("payment_id");
  const orderId = params.get("order_id");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!paymentId) {
        setState("failed");
        return;
      }
      const guestToken = orderId ? getGuestToken(orderId) : null;
      const res = await verifyMyFatoorahPayment(paymentId, orderId, guestToken);
      setResult(res);
      if (res.payment_status === "paid") {
        clear();
        setState("success");
      } else if (res.payment_status === "pending_status_update" || res.payment_status === "pending_payment")
        setState("pending");
      else setState("failed");
    })();
  }, [clear, paymentId, orderId]);

  const config = {
    verifying: { icon: Loader2, variant: "sky" as const, title: t("payment.verifying"), desc: "" },
    success: { icon: CheckCircle2, variant: "emerald" as const, title: t("payment.successTitle"), desc: t("payment.successDesc") },
    failed: { icon: XCircle, variant: "rose" as const, title: t("payment.failedTitle"), desc: t("payment.failedDesc") },
    pending: { icon: Clock, variant: "amber" as const, title: t("payment.pendingTitle"), desc: t("payment.pendingDesc") },
  }[state];

  const targetOrderId = result?.order_id || orderId;

  return (
    <SiteLayout>
      <section className="relative overflow-hidden py-20 md:py-28">
        <ColorfulHeroBg />
        <div className="container max-w-lg">
          <Reveal>
            <GlowCard variant={config.variant} className="p-8 md:p-10 text-center">
              <div className={cn("flex justify-center", state === "verifying" && "animate-spin")}>
                <Icon3D
                  icon={config.icon}
                  variant={config.variant}
                  size="lg"
                />
              </div>
              <h1 className="mt-6 text-2xl md:text-3xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
                  {config.title}
                </span>
              </h1>
              {config.desc && (
                <p className="mt-3 text-muted-foreground leading-relaxed">{config.desc}</p>
              )}
              {result?.order_number && (
                <p className="mt-4 text-sm">
                  {t("payment.orderNumber")}:{" "}
                  <span className="font-bold">#{result.order_number}</span>
                </p>
              )}

              {state !== "verifying" && (
                <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                  {state === "success" && targetOrderId && (
                    <Button
                      asChild
                      size="lg"
                      className="rounded-full bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 text-white shadow-lg shadow-violet-500/30 hover:scale-105 transition-all"
                    >
                      <Link to={`/order-confirmation/${targetOrderId}`}>{t("payment.viewOrder")}</Link>
                    </Button>
                  )}
                  {state === "failed" && (
                    <Button
                      size="lg"
                      onClick={() => navigate("/checkout")}
                      className="rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30 hover:scale-105 transition-all"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t("payment.retry")}
                    </Button>
                  )}
                  {state === "pending" && targetOrderId && (
                    <Button
                      asChild
                      size="lg"
                      className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 hover:scale-105 transition-all"
                    >
                      <Link to={`/order-confirmation/${targetOrderId}`}>{t("payment.viewOrder")}</Link>
                    </Button>
                  )}
                  <Button asChild variant="outline" size="lg" className={cn("rounded-full")}>
                    <Link to="/curemed">
                      <ShoppingBag className="h-4 w-4 mr-2" />
                      {t("payment.continueShopping")}
                    </Link>
                  </Button>
                </div>
              )}
            </GlowCard>
          </Reveal>
        </div>
      </section>
    </SiteLayout>
  );
}
