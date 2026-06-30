import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CartProvider, type CartItem } from "@/lib/cart";
import { I18nProvider } from "@/lib/i18n";
import Checkout from "@/pages/Checkout";

const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  createMyFatoorahPayment: vi.fn(),
  saveGuestToken: vi.fn(),
}));

vi.mock("@/components/site/SiteLayout", () => ({
  SiteLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    useCreateOrder: () => ({ mutateAsync: mocks.createOrder, isPending: false }),
    useProfile: () => ({ data: null }),
  };
});

vi.mock("@/lib/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment")>();
  return {
    ...actual,
    sha256Hex: vi.fn(async () => "payment-token-hash"),
    saveGuestToken: mocks.saveGuestToken,
    createMyFatoorahPayment: mocks.createMyFatoorahPayment,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: vi.fn(async () => ({ data: null })) }),
      }),
    }),
    functions: { invoke: vi.fn() },
  },
}));

const CART_STORAGE_KEY = "curemed.cart.v1";
const CART_ITEM: CartItem = {
  productId: "product-1",
  name: "Test product",
  nameAr: "منتج اختباري",
  brand: "flexitol",
  image: "/test-product.webp",
  price: 10,
  quantity: 2,
};

function renderCheckout() {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([CART_ITEM]));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <CartProvider>
          <MemoryRouter>
            <Checkout />
          </MemoryRouter>
        </CartProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

function fillRequiredCheckoutForm(container: HTMLElement, phone = "55683677") {
  const inputs = container.querySelectorAll("input");
  fireEvent.change(inputs[0], { target: { value: "Waleed Mohamed" } });
  fireEvent.change(inputs[1], { target: { value: "dr.vet.waleedtam@gmail.com" } });
  fireEvent.change(inputs[2], { target: { value: phone } });

  const selects = container.querySelectorAll("select");
  fireEvent.change(selects[1], { target: { value: "Capital" } });
  fireEvent.change(selects[2], { target: { value: "Sharq" } });

  fireEvent.change(inputs[3], { target: { value: "1" } });
  fireEvent.change(inputs[4], { target: { value: "Arabian Gulf Street" } });
}

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mocks.createOrder.mockReset();
  mocks.createOrder.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    orderNumber: "CM-1001",
    total: 20,
  });
  mocks.createMyFatoorahPayment.mockReset();
  mocks.createMyFatoorahPayment.mockResolvedValue({
    success: true,
    order_id: "11111111-1111-4111-8111-111111111111",
    payment_url: "#knet-gateway",
  });
  mocks.saveGuestToken.mockReset();
});

describe("Checkout cart summary", () => {
  it("links back to the storefront", () => {
    renderCheckout();

    expect(screen.getByRole("link", { name: "Continue shopping" })).toHaveAttribute(
      "href",
      "/curemed",
    );
  });

  it("clears every item from the summary", async () => {
    renderCheckout();

    fireEvent.click(screen.getByRole("button", { name: "Clear cart" }));

    await waitFor(() => {
      expect(screen.queryByText("Test product")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clear cart" })).not.toBeInTheDocument();
    });
  });

  it("does not show the redundant edit-cart hint", () => {
    renderCheckout();

    expect(screen.queryByText("Edit your cart")).not.toBeInTheDocument();
  });

  it("keeps cart items while redirecting to the payment gateway", async () => {
    const { container } = renderCheckout();
    fillRequiredCheckoutForm(container);

    fireEvent.click(screen.getByRole("button", { name: "Pay Now" }));

    await waitFor(() => expect(mocks.createMyFatoorahPayment).toHaveBeenCalled());

    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "[]")).toEqual([CART_ITEM]);
  });

  it("stores checkout phone with the fixed Kuwait country code", async () => {
    const { container } = renderCheckout();
    fillRequiredCheckoutForm(container, "55683677");

    fireEvent.click(screen.getByRole("button", { name: "Pay Now" }));

    await waitFor(() => expect(mocks.createOrder).toHaveBeenCalled());

    expect(mocks.createOrder.mock.calls[0][0]).toEqual(
      expect.objectContaining({ customerPhone: "+96555683677" }),
    );
  });
});
