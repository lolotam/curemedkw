import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { useDeleteOrder } from "./db";

const sdk = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/clientRuntime", () => ({ supabase: sdk }));

describe("order deletion with retained payment records", () => {
  beforeEach(() => vi.clearAllMocks());

  function setup(error: { code: string; message: string } | null) {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const remainingItems = new Set(["retained-line-item"]);
    const calls: Array<{ table: string; column: string; id: string }> = [];
    sdk.from.mockImplementation((table: string) => ({
      delete: () => ({
        eq: async (column: string, id: string) => {
          calls.push({ table, column, id });
          if (table === "order_items") remainingItems.clear();
          return { error: table === "orders" ? error : null };
        },
      }),
    }));
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return {
      ...renderHook(() => useDeleteOrder(), { wrapper }),
      client,
      remainingItems,
      calls,
    };
  }

  it("preserves items when the database refuses a retained order deletion", async () => {
    const refusal = { code: "40001", message: "payment_invoice_identity_retained" };
    const h = setup(refusal);
    const invalidate = vi.spyOn(h.client, "invalidateQueries");
    try {
      await act(async () => {
        await expect(h.result.current.mutateAsync("retained-order")).rejects.toBe(refusal);
      });
      expect([...h.remainingItems]).toEqual(["retained-line-item"]);
      expect(h.calls).toEqual([{ table: "orders", column: "id", id: "retained-order" }]);
      expect(h.result.current.isSuccess).toBe(false);
      expect(invalidate).not.toHaveBeenCalled();
    } finally {
      h.unmount();
      h.client.clear();
    }
  });

  it("sends one parent deletion and invalidates the list only after success", async () => {
    const h = setup(null);
    const invalidate = vi.spyOn(h.client, "invalidateQueries");
    try {
      await act(async () => { await h.result.current.mutateAsync("ordinary-order"); });
      expect(h.calls).toEqual([{ table: "orders", column: "id", id: "ordinary-order" }]);
      expect(invalidate).toHaveBeenCalledOnce();
    } finally {
      h.unmount();
      h.client.clear();
    }
  });
});
