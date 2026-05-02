import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useOrder } from "@/lib/db";
import { useI18n } from "@/lib/i18n";

export default function OrderConfirmation() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading } = useOrder(id);
  const { t } = useI18n();

  if (isLoading) return null;

  return (
    <SiteLayout>
      <section className="container py-16 md:py-24">
        <div className="max-w-xl mx-auto text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 text-green-600 mb-4">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold">{t("order.thanks")}</h1>
          <p className="text-muted-foreground mt-2">{t("order.received")}</p>

          {order && (
            <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-left">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">
                    {t("order.number")}
                  </p>
                  <p className="font-bold text-lg">{order.orderNumber}</p>
                </div>
                <Package className="h-6 w-6 text-brand" />
              </div>
              <ul className="divide-y divide-border">
                {order.items?.map((i) => (
                  <li key={i.id} className="flex gap-3 py-3 text-sm">
                    {i.productImageSnapshot && (
                      <img src={i.productImageSnapshot} alt="" className="h-12 w-12 rounded-lg object-cover bg-brand-soft" loading="lazy" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium line-clamp-1">{i.productNameSnapshot}</p>
                      <p className="text-xs text-muted-foreground">×{i.quantity}</p>
                    </div>
                    <p className="font-semibold">KD {Number(i.lineTotal).toFixed(2)}</p>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border pt-3 mt-3 flex justify-between font-bold">
                <span>{t("cart.total")}</span>
                <span>KD {order.total.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                {order.paymentMethod === "cod" ? t("checkout.cod") : t("checkout.payByLink")}
              </p>
            </div>
          )}

          <Button asChild className="mt-8 bg-brand hover:bg-brand/90 text-white">
            <Link to="/curemed">{t("order.continueShopping")}</Link>
          </Button>
        </div>
      </section>
    </SiteLayout>
  );
}