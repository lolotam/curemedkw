import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { SiteLayout } from "@/components/site/SiteLayout";

export default function ResetPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      navigate("/account", { replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SiteLayout>
      <section className="container py-12 md:py-16 flex justify-center">
        <Card className="w-full max-w-md p-8">
          <h1 className="text-2xl font-bold text-center">{t("auth.reset.title")}</h1>
          <form onSubmit={submit} className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>{t("auth.newPassword")}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoFocus />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-brand hover:bg-brand/90 text-white">
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("auth.updatePassword")}
            </Button>
          </form>
        </Card>
      </section>
    </SiteLayout>
  );
}