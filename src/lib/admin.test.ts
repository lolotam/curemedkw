import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  roleLookups: 0,
}));

vi.mock("@/integrations/supabase/clientRuntime", () => {
  const roleQuery = {
    select: () => roleQuery,
    eq: () => roleQuery,
    maybeSingle: async () => { h.roleLookups++; return { data: { role: "admin" } }; },
  };
  return {
    supabase: {
      auth: {
        onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
          h.listener = cb;
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
      },
      from: () => roleQuery,
    },
  };
});

import { useAdminSession } from "./admin";

describe("useAdminSession", () => {
  beforeEach(() => { h.listener = null; h.roleLookups = 0; });

  it("does not go back to loading when auth events repeat for the same user", async () => {
    const { result } = renderHook(() => useAdminSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
    const lookups = h.roleLookups;

    // Tab focus / token refresh / another tab signing in all re-emit the same user.
    act(() => {
      h.listener?.("SIGNED_IN", { user: { id: "u1" } });
      h.listener?.("TOKEN_REFRESHED", { user: { id: "u1" } });
    });
    expect(result.current.loading).toBe(false);
    expect(h.roleLookups).toBe(lookups);
  });

  it("re-checks the role when a different user signs in", async () => {
    const { result } = renderHook(() => useAdminSession());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { h.listener?.("SIGNED_IN", { user: { id: "u2" } }); });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.id).toBe("u2");
  });
});
