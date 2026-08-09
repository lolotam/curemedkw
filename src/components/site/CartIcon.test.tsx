import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CartProvider } from "@/lib/cart";
import { CartIcon } from "@/components/site/CartIcon";

describe("CartIcon", () => {
  it("opens checkout directly", () => {
    render(
      <MemoryRouter>
        <CartProvider>
          <CartIcon />
        </CartProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Checkout" })).toHaveAttribute(
      "href",
      "/checkout",
    );
  });
});
