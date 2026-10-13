import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/clientRuntime";
import type { User } from "@supabase/supabase-js";

/**
 * Real Supabase-backed admin session.
 * `isAdmin` is true only when the signed-in user has a `user_roles` row with role = 'admin'.
 */
export interface AdminSession {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

export function useAdminSession(): AdminSession {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // The user whose admin role has been (or is being) checked. Supabase fires
    // auth events on tab focus, token refresh and when another tab signs in —
    // re-checking (and flipping back to "loading") for the same user would
    // unmount every admin page and wipe its state, so only a new user triggers it.
    let checkedUid: string | null = null;

    const applyUser = (u: User | null) => {
      if (!active) return;
      // Keep the previous object when only the token changed, so consumers don't re-render.
      setUser((prev) => (prev?.id === u?.id ? prev : u));
      if (!u) {
        checkedUid = null;
        setIsAdmin(false);
        setRoleLoading(false);
        return;
      }
      if (u.id === checkedUid) return;
      checkedUid = u.id;
      setRoleLoading(true);
      // Defer the role lookup so the auth listener can return synchronously
      setTimeout(() => { void checkRole(u.id); }, 0);
    };

    const checkRole = async (uid: string) => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle();
      if (!active || uid !== checkedUid) return;
      setIsAdmin(!!data);
      setRoleLoading(false);
    };

    // Subscribe FIRST, then fetch the initial session (avoids race conditions)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      applyUser(session?.user ?? null);
      setSessionLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loading = sessionLoading || (!!user && roleLoading);
  return { user, isAdmin, loading };
}

export async function adminLogout() {
  await supabase.auth.signOut();
}