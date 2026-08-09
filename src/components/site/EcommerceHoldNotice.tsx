import { Info } from "lucide-react";
import { useEcommerceGates } from "@/lib/db";
import { holdNotice } from "@/lib/ecommerceMode";
import { useI18n } from "@/lib/i18n";

/**
 * Storefront-wide banner explaining why the buying path is closed.
 *
 * Shown on every page while any purchase affordance is disabled, so a shopper
 * who finds a missing "Add to cart" button has an explanation rather than
 * assuming the site is broken.
 */
export function EcommerceHoldNotice() {
  const { isOnHold, mode } = useEcommerceGates();
  const { t, lang } = useI18n();

  if (!isOnHold) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="container flex items-start gap-3 py-2.5 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="min-w-0">
          <span className="font-semibold">{t("shop.hold.title")}</span>
          <span className="mx-1.5 opacity-50">—</span>
          <span>{holdNotice(mode, lang)}</span>
        </p>
      </div>
    </div>
  );
}
