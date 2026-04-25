import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useAdminSession } from "@/lib/admin";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import curemedLogo from "@/assets/curemed-logo.png";
import { Loader2 } from "lucide-react";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user, loading } = useAdminSession();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If already signed in, jump to /admin (the layout handles non-admin case)
  useEffect(() => {
    if (!loading && user) navigate("/admin", { replace: true });
  }, [loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
        navigate("/admin", { replace: true });
      } else {
        const redirectUrl = `${window.location.origin}/admin`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
      const redirectUrl = `${window.location.origin}/admin`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUrl },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err?.message ?? "Google sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div data-brand="curemed" className="min-h-screen flex items-center justify-center bg-brand-soft p-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-6">
          <img src={curemedLogo} alt="Curemed" className="h-12 w-auto mx-auto object-contain" />
          <h1 className="mt-5 text-2xl font-bold">
            {mode === "signin" ? t("admin.login.title") : "Create admin account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in with your admin account to continue."
              : "Create your account, then a site administrator will grant you access."}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">{t("admin.login.password")}</Label>
            <Input id="pw" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-brand hover:bg-brand/90 text-white">
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or</span></div>
        </div>

        <Button type="button" variant="outline" disabled={busy} onClick={signInWithGoogle} className="w-full">
          <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
          </svg>
          Continue with Google
        </Button>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>Need an account?{" "}
              <button type="button" onClick={() => setMode("signup")} className="text-brand font-medium hover:underline">Sign up</button>
            </>
          ) : (
            <>Have an account?{" "}
              <button type="button" onClick={() => setMode("signin")} className="text-brand font-medium hover:underline">Sign in</button>
            </>
          )}
        </p>
      </Card>
    </div>
  );
}