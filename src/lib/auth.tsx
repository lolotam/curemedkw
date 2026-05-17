import * as React from "react";
import { supabase } from "@/integrations/supabase/clientRuntime";
import type { User } from "@supabase/supabase-js";
import { logOperation } from "@/lib/logs";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthCtx>({ user: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_IN") {
        logOperation({ category: "auth", operation: "login", status: "success", userId: session?.user?.id ?? null, userEmail: session?.user?.email ?? null, metadata: { provider: session?.user?.app_metadata?.provider } });
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = React.useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      signOut: async () => {
        logOperation({ category: "auth", operation: "logout", status: "success" });
        await supabase.auth.signOut();
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return React.useContext(AuthContext);
}