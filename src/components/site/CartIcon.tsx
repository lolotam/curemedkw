import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";

export function CartIcon() {
  const { count } = useCart();
  return (
    <Button asChild variant="ghost" size="icon" aria-label="Cart" className="relative">
      <Link to="/cart">
        <ShoppingCart className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold leading-none">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}