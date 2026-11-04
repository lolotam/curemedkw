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
  const { isOnHold, canCheckout, mode } = useEcommerceGates();
  const { t, lang } = useI18n();

  if (!isOnHold) return null;

  // With only "Add to cart" closed, orders still complete — announcing paused
  // ordering there would be untrue. That configuration is an enquiry shop.
  const title = canCheckout ? t("shop.hold.enquiryTitle") : t("shop.hold.title");

  return (
    <div
      role="status"
      className="border-b border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="container flex items-start gap-3 py-2.5 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        {/* Phones: the title is its own bold line and the notice sits under it
            one step smaller; from sm up both share one line split by a dash. */}
        <p className="min-w-0">
          <span className="block text-base font-semibold sm:inline sm:text-sm">{title}</span>
          <span className="mx-1.5 hidden opacity-50 sm:inline">—</span>
          <span className="block sm:inline">{holdNotice(mode, lang)}</span>
        </p>
      </div>
    </div>
  );
}
