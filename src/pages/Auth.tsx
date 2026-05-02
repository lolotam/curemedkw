import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  LogIn,
  UserPlus,
  KeyRound,
  Mail,
  Phone,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { SiteLayout } from "@/components/site/SiteLayout";
import {
  ColorfulHeroBg,
  GlowCard,
  Icon3D,
  Reveal,
  type GradientKey,
} from "@/components/site/ColorfulFx";

type Mode = "signin" | "signup" | "reset";

const MODE_META: Record<
  Mode,
  { variant: GradientKey; icon: LucideIcon; gradient: string }
> = {
  signin: {
    variant: "sky",
    icon: LogIn,
    gradient: "from-sky-500 via-violet-500 to-pink-500",
  },
  signup: {
    variant: "violet",
    icon: UserPlus,
    gradient: "from-violet-500 via-fuchsia-500 to-pink-500",
  },
  reset: {
    variant: "amber",
    icon: KeyRound,
    gradient: "from-amber-500 via-rose-500 to-violet-500",
  },
};

export default function Auth() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/account";
  const initialMode = (params.get("mode") as Mode) || "signin";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [loading, user, navigate, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success(t("auth.signin.cta"));
        navigate(next, { replace: true });
      } else if (mode === "signup") {
        const redirectUrl = `${window.location.origin}${next}`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: { full_name: fullName, phone },
          },
        });
        if (error) throw error;
        toast.success(t("auth.checkEmail"));
        setMode("signin");
      } else {
        const redirectUrl = `${window.location.origin}/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl,
        });
        if (error) throw error;
        toast.success(t("auth.checkEmail"));
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
      // Remember where to land after the OAuth round-trip
      sessionStorage.setItem("auth:next", next || "/");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        toast.error(error.message ?? "Google sign-in failed");
        setBusy(false);
        return;
      }
      // Browser is redirecting to Google — nothing else to do
    } catch (err: any) {
      toast.error(err?.message ?? "Google sign-in failed");
      setBusy(false);
    }
  };

  const meta = MODE_META[mode];
  const titleText =
    mode === "signin"
      ? t("auth.signin.title")
      : mode === "signup"
        ? t("auth.signup.title")
        : t("auth.reset.title");

  return (
    <SiteLayout brand="curemed">
      <section className="relative overflow-hidden py-16 md:py-24">
        <ColorfulHeroBg />

        <div className="container max-w-xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="animate-fade-in">
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand backdrop-blur-md shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
                {mode === "signup"
                  ? t("auth.signup.cta")
                  : mode === "reset"
                    ? t("auth.reset.cta")
                    : t("auth.signin.cta")}
              </span>
            </div>
            <h1 className="mt-5 text-4xl md:text-5xl font-bold tracking-tight animate-fade-in [animation-delay:120ms]">
              <span
                className={`bg-gradient-to-r ${meta.gradient} bg-clip-text text-transparent`}
              >
                {titleText}
              </span>
            </h1>
            {mode === "reset" && (
              <p className="mt-4 text-sm md:text-base text-muted-foreground animate-fade-in [animation-delay:200ms]">
                {t("auth.reset.body")}
              </p>
            )}
          </div>

          {/* Card */}
          <Reveal>
            <GlowCard variant={meta.variant} className="p-7 md:p-9">
              <div className="flex justify-center -mt-16 mb-4">
                <Icon3D icon={meta.icon} variant={meta.variant} size="lg" />
              </div>

              <form onSubmit={submit} className="space-y-4 animate-fade-in">
                {mode === "signup" && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <UserIcon className="h-3.5 w-3.5 text-brand" />
                        {t("auth.fullName")}
                      </Label>
                      <Input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className="bg-background/80 backdrop-blur-sm border-border/70"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-brand" />
                        {t("auth.phone")}
                      </Label>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="bg-background/80 backdrop-blur-sm border-border/70"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-brand" />
                    {t("auth.email")}
                  </Label>
                  <Input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-background/80 backdrop-blur-sm border-border/70"
                  />
                </div>

                {mode !== "reset" && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-brand" />
                      {t("auth.password")}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPw ? "text" : "password"}
                        autoComplete={
                          mode === "signin" ? "current-password" : "new-password"
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="pr-10 bg-background/80 backdrop-blur-sm border-border/70"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        tabIndex={-1}
                      >
                        {showPw ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => setMode("reset")}
                        className="text-xs text-brand hover:underline story-link"
                      >
                        {t("auth.forgot")}
                      </button>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={busy}
                  className={`w-full text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl bg-gradient-to-r ${meta.gradient} hover:opacity-95`}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {mode === "signin" && t("auth.signin.cta")}
                  {mode === "signup" && t("auth.signup.cta")}
                  {mode === "reset" && t("auth.reset.cta")}
                </Button>
              </form>

              {mode !== "reset" && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border/60" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-card/85 px-3 text-muted-foreground uppercase tracking-wider">
                        {t("auth.or")}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={signInWithGoogle}
                    className="w-full bg-background/70 backdrop-blur-sm border-border/70 hover:bg-background hover:border-brand/40 transition-all duration-300 hover:scale-[1.02] hover:shadow-md"
                  >
                    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                    </svg>
                    {t("auth.continueGoogle")}
                  </Button>
                </>
              )}

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signin" && (
                  <>
                    {t("auth.noAccount")}{" "}
                    <button
                      type="button"
                      onClick={() => setMode("signup")}
                      className="text-brand font-semibold hover:underline story-link"
                    >
                      {t("auth.signup.cta")}
                    </button>
                  </>
                )}
                {mode === "signup" && (
                  <>
                    {t("auth.haveAccount")}{" "}
                    <button
                      type="button"
                      onClick={() => setMode("signin")}
                      className="text-brand font-semibold hover:underline story-link"
                    >
                      {t("auth.signin.cta")}
                    </button>
                  </>
                )}
                {mode === "reset" && (
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className="text-brand font-semibold hover:underline story-link"
                  >
                    ← {t("auth.signin.cta")}
                  </button>
                )}
              </p>
            </GlowCard>
          </Reveal>
        </div>
      </section>
    </SiteLayout>
  );
}
