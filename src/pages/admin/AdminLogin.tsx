import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { adminAuth } from "@/lib/admin";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import curemedLogo from "@/assets/curemed-logo.png";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminAuth.login(password)) navigate("/admin", { replace: true });
    else toast.error(t("admin.login.invalid"));
  };
  return (
    <div data-brand="curemed" className="min-h-screen flex items-center justify-center bg-brand-soft p-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-6">
          <img src={curemedLogo} alt="Curemed" className="h-10 w-auto mx-auto" />
          <div className="mt-4 inline-flex items-center justify-center h-12 w-12 rounded-full bg-brand/10 text-brand"><Lock className="h-5 w-5" /></div>
          <h1 className="mt-3 text-2xl font-bold">{t("admin.login.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter the admin password to continue</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="pw">{t("admin.login.password")}</Label>
            <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required /></div>
          <Button type="submit" className="w-full bg-brand hover:bg-brand/90 text-white">{t("admin.login.submit")}</Button>
          <p className="text-xs text-muted-foreground text-center">Default password: <code className="bg-muted px-1.5 py-0.5 rounded">curemed-admin</code></p>
        </form>
      </Card>
    </div>
  );
}