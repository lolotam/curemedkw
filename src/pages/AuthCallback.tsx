import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const finalize = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // Surface OAuth provider errors that arrive in the query string or hash
        // (e.g. ?error=...&error_description=... from GoTrue / Google)
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const providerError =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error") ||
          hash.get("error_description") ||
          hash.get("error");
        if (providerError) {
          console.error("OAuth provider error:", providerError, {
            href: window.location.href,
          });
          navigate(
            `/auth?error=${encodeURIComponent(providerError)}`,
            { replace: true },
          );
          return;
        }

        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error("exchangeCodeForSession failed:", exchangeError);
            throw exchangeError;
          }
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (cancelled) return;

        if (data.session) {
          // Clean the URL after a successful exchange
          window.history.replaceState({}, document.title, "/auth/callback");

          const next = sessionStorage.getItem("auth:next") || "/";
          sessionStorage.removeItem("auth:next");
          navigate(next, { replace: true });
        } else {
          navigate("/auth?error=oauth_no_session", { replace: true });
        }
      } catch (err) {
        console.error("OAuth callback error:", err);
        if (!cancelled) {
          navigate("/auth?error=oauth_callback_failed", { replace: true });
        }
      }
    };

    finalize();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
