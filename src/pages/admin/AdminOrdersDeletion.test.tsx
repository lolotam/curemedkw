import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminOrders from "./AdminOrders";

const boundary = vi.hoisted(() => ({ from: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/clientRuntime", () => ({ supabase: boundary }));
vi.mock("@/integrations/supabase/clientRuntime", () => ({ supabase: boundary }));
vi.mock("sonner", () => ({ toast: { success: boundary.success, error: boundary.error } }));

const PROTECTED = "This order is protected because a MyFatoorah invoice has been assigned. " +
  "Orders with assigned invoices cannot be deleted, including pending or failed payments.";
const GENERIC = "The order could not be deleted. Please refresh the order list.";
const LINKED = "This order is protected by linked records and cannot be deleted. " +
  "Orders with an assigned MyFatoorah invoice stay protected, including pending or failed payments.";

describe("administrator order deletion", () => {
  const clients: QueryClient[] = [];
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
  });

  function setup(refusal: { code: string; message: string } | null, paymentStatus = "pending") {
    const rows = [{ id: "retained-order", order_number: "CM-RETENTION", customer_name: "Synthetic buyer",
      customer_email: "buyer@example.test", customer_phone: "96550000001", total: 20,
      payment_method: "pay_by_link", payment_status: paymentStatus, order_status: "new",
      // An absent/stale browser invoice field must not override the database refusal.
      myfatoorah_invoice_id: null, created_at: "2026-11-04T00:00:00Z" }];
    const items = new Set(["retained-line-item"]);
    const deletions: string[] = [];
    boundary.from.mockImplementation((table: string) => ({
      select: () => ({ order: async () => ({ data: rows, error: null }) }),
      delete: () => ({ eq: async () => {
        deletions.push(table);
        if (table === "order_items") items.clear();
        if (table === "orders" && !refusal) rows.splice(0);
        return { error: table === "orders" ? refusal : null };
      } }),
    }));
    const client = new QueryClient({ defaultOptions: {
      queries: { retry: false }, mutations: { retry: false },
    } });
    clients.push(client);
    render(<QueryClientProvider client={client}><AdminOrders /></QueryClientProvider>);
    return { deletions, items };
  }

  async function confirmDelete() {
    const row = (await screen.findByText("CM-RETENTION")).closest("tr");
    expect(row).not.toBeNull();
    const actions = within(row!).getAllByRole("button");
    fireEvent.click(actions[actions.length - 1]);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
  }

  it.each(["pending", "payment_failed", "paid"])(
    "clearly explains retained-invoice refusal for %s without deleting items or reporting success",
    async (status) => {
      const h = setup({ code: "40001", message: "payment_invoice_identity_retained" }, status);
      await confirmDelete();
      await waitFor(() => expect(boundary.error).toHaveBeenCalledWith(PROTECTED));
      expect(boundary.error).toHaveBeenCalledOnce();
      expect(boundary.success).not.toHaveBeenCalled();
      expect(h.deletions).toEqual(["orders"]);
      expect([...h.items]).toEqual(["retained-line-item"]);
      expect(screen.getByText("CM-RETENTION")).toBeInTheDocument();
    },
  );

  it("keeps an unrelated 40001 refusal generic and never displays upstream text", async () => {
    const h = setup({ code: "40001", message: "sensitive_sql_details_never_display" });
    await confirmDelete();
    await waitFor(() => expect(boundary.error).toHaveBeenCalledWith(GENERIC));
    expect(boundary.error.mock.calls.flat().join(" ")).not.toContain("sensitive_sql");
    expect(boundary.success).not.toHaveBeenCalled();
    expect(h.deletions).toEqual(["orders"]);
  });

  it("reports success only after an ordinary parent deletion succeeds", async () => {
    const h = setup(null);
    await confirmDelete();
    await waitFor(() => expect(boundary.success).toHaveBeenCalledWith("Order deleted"));
    expect(boundary.error).not.toHaveBeenCalled();
    expect(h.deletions).toEqual(["orders"]);
    await waitFor(() => expect(screen.queryByText("CM-RETENTION")).not.toBeInTheDocument());
  });

  it("explains linked-record protection when a retention foreign key refuses deletion", async () => {
    const h = setup({ code: "23503", message: "private_constraint_details_never_display" });
    await confirmDelete();
    await waitFor(() => expect(boundary.error).toHaveBeenCalledWith(LINKED));
    expect(boundary.success).not.toHaveBeenCalled();
    expect(h.deletions).toEqual(["orders"]);
    expect([...h.items]).toEqual(["retained-line-item"]);
  });
});
