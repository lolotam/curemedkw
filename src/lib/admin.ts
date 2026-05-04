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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const checkRole = async (uid: string) => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle();
      if (active) setIsAdmin(!!data);
    };

    // Subscribe FIRST, then fetch the initial session (avoids race conditions)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        // Defer the role lookup so the auth listener can return synchronously
        setTimeout(() => { void checkRole(u.id); }, 0);
      } else {
        setIsAdmin(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      if (active) {
        setUser(u);
        setLoading(false);
      }
      if (u) void checkRole(u.id);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, isAdmin, loading };
}

export async function adminLogout() {
  await supabase.auth.signOut();
}