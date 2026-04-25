import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
          <img src={curemedLogo} alt="Curemed" className="h-12 w-auto mx-auto object-contain" />
          <h1 className="mt-5 text-2xl font-bold">{t("admin.login.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter the admin password to continue</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="pw">{t("admin.login.password")}</Label>
            <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required /></div>
          <Button type="submit" className="w-full bg-brand hover:bg-brand/90 text-white">{t("admin.login.submit")}</Button>
        </form>
      </Card>
    </div>
  );
}