import { ShoppingCart, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/db";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  product: Product;
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
  variant?: "default" | "outline" | "ghost";
  fullWidth?: boolean;
  iconOnly?: boolean;
  qty?: number;
}

export function AddToCartButton({
  product,
  size = "default",
  className,
  variant = "default",
  fullWidth,
  iconOnly,
  qty = 1,
}: Props) {
  const { add } = useCart();
  const { t } = useI18n();
  const [added, setAdded] = useState(false);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    add(product, qty);
    setAdded(true);
    toast.success(t("cart.added"));
    window.setTimeout(() => setAdded(false), 1400);
  };

  if (iconOnly) {
    return (
      <Button
        type="button"
        size="icon"
        variant={variant}
        onClick={onClick}
        aria-label={t("cart.addToCart")}
        className={cn("rounded-full bg-brand text-white hover:bg-brand/90", className)}
      >
        {added ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={onClick}
      className={cn(
        variant === "default" && "bg-brand hover:bg-brand/90 text-white",
        fullWidth && "w-full",
        className,
      )}
    >
      {added ? <Check className="h-4 w-4 mr-2" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
      {added ? t("cart.added") : t("cart.addToCart")}
    </Button>
  );
}