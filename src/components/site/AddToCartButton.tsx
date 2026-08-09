import { ShoppingCart, Check, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/db";
import { useEcommerceGates } from "@/lib/db";
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
  const navigate = useNavigate();
  const { canAddToCart } = useEcommerceGates();
  const [added, setAdded] = useState(false);

  const addToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    add(product, qty);
    setAdded(true);
    toast.success(t("cart.added"));
    window.setTimeout(() => setAdded(false), 1400);
  };

  // While ordering is on hold the buy action becomes an enquiry, so a product
  // card still reads as a product rather than a broken one. It navigates from a
  // click handler instead of rendering a link because product cards already
  // wrap the whole tile in an anchor, and nesting anchors is invalid markup.
  const enquire = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate("/contact");
  };

  const action = canAddToCart
    ? {
        onClick: addToCart,
        Icon: added ? Check : ShoppingCart,
        label: added ? t("cart.added") : t("cart.addToCart"),
      }
    : { onClick: enquire, Icon: MessageCircle, label: t("price.contactUs") };
  const { Icon } = action;

  if (iconOnly) {
    return (
      <Button
        type="button"
        size="icon"
        variant={variant}
        onClick={action.onClick}
        aria-label={action.label}
        className={cn("rounded-full bg-brand text-white hover:bg-brand/90", className)}
      >
        <Icon className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={action.onClick}
      className={cn(
        variant === "default" && "bg-brand hover:bg-brand/90 text-white",
        fullWidth && "w-full",
        className,
      )}
    >
      <Icon className="h-4 w-4 mr-2" />
      {action.label}
    </Button>
  );
}