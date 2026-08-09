import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { WhatsAppFab } from "./WhatsAppFab";
import { LiveOrdersToast } from "./LiveOrdersToast";
import { EcommerceHoldNotice } from "./EcommerceHoldNotice";
import { useEcommerceGates } from "@/lib/db";

export function SiteLayout({ brand = "curemed", children }: { brand?: string; children: React.ReactNode }) {
  const { canCheckout } = useEcommerceGates();
  return (
    <div data-brand={brand} className="min-h-screen flex flex-col bg-background text-foreground">
      <SiteHeader />
      <EcommerceHoldNotice />
      <main className="flex-1">{children}</main>
      <SiteFooter brand={brand} />
      <WhatsAppFab />
      {/* The "someone just ordered…" social proof would be untrue while orders
          cannot be placed, so it is suppressed alongside checkout. */}
      {canCheckout && <LiveOrdersToast />}
    </div>
  );
}
