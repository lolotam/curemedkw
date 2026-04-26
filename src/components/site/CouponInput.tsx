import { useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { validateCoupon, type Coupon } from "@/lib/db";
import { useI18n } from "@/lib/i18n";

export interface AppliedCoupon {
  coupon: Coupon;
  discount: number;
}

export function CouponInput({
  subtotal,
  applied,
  onApply,
  onRemove,
}: {
  subtotal: number;
  applied: AppliedCoupon | null;
  onApply: (a: AppliedCoupon) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const r = await validateCoupon(code, subtotal);
      if (!r.ok) {
        toast.error(r.reason);
        return;
      }
      onApply({ coupon: r.coupon, discount: r.discount });
      toast.success(t("coupon.applied"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Tag className="h-4 w-4 text-brand shrink-0" />
          <span className="font-mono font-bold text-brand truncate">{applied.coupon.code}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            −KD {applied.discount.toFixed(2)}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove} aria-label="Remove coupon">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder={t("coupon.label")}
        className="flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void apply();
          }
        }}
      />
      <Button type="button" variant="outline" onClick={apply} disabled={busy || !code.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("coupon.apply")}
      </Button>
    </div>
  );
}