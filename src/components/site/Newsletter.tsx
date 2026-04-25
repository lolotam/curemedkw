import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { subscribers } from "@/lib/db";
import { toast } from "sonner";
import { Mail } from "lucide-react";

export function Newsletter() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 255) { toast.error(t("contact.error")); return; }
    subscribers.add(trimmed);
    setEmail("");
    toast.success(t("newsletter.success"));
  };
  return (
    <section className="container py-12">
      <div className="rounded-3xl bg-brand-soft border border-brand/10 p-8 md:p-12 text-center">
        <Mail className="h-8 w-8 mx-auto text-brand mb-3" />
        <h2 className="text-2xl md:text-3xl font-bold">{t("newsletter.title")}</h2>
        <p className="mt-2 text-muted-foreground max-w-md mx-auto">{t("newsletter.subtitle")}</p>
        <form onSubmit={submit} className="mt-6 flex max-w-md mx-auto gap-2">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("newsletter.placeholder")} className="bg-background" required />
          <Button type="submit" className="bg-brand hover:bg-brand/90 text-white">{t("newsletter.subscribe")}</Button>
        </form>
      </div>
    </section>
  );
}