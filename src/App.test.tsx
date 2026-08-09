import { render, waitFor } from "@testing-library/react";
import App from "@/App";

// Only the Supabase-touching seams are stubbed. AuthProvider, CartProvider and
// the page components render for real, so this exercises the actual route table.
vi.mock("@/lib/db", () => ({
  useLoaderPageEnabled: () => ({ data: true, isLoading: false }),
}));
vi.mock("@/components/site/BrandingHead", () => ({ BrandingHead: () => null }));

describe("legacy cart route", () => {
  it("redirects to checkout", async () => {
    window.history.pushState({}, "", "/cart");

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/checkout");
    });
  });
});
