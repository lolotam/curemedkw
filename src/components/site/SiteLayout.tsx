import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { WhatsAppFab } from "./WhatsAppFab";
import { LiveOrdersToast } from "./LiveOrdersToast";

export function SiteLayout({ brand = "curemed", children }: { brand?: string; children: React.ReactNode }) {
  return (
    <div data-brand={brand} className="min-h-screen flex flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter brand={brand} />
      <WhatsAppFab />
      <LiveOrdersToast />
    </div>
  );
}