import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { useCreateMessage, type BrandKey } from "@/lib/db";
import { toast } from "sonner";
import { z } from "zod";
import { Send, Sparkles, Loader2 } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional(),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2000),
});

export function ContactSection({ brand }: { brand?: BrandKey | "curemed" }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const createMsg = useCreateMessage();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(t("contact.error")); return; }
    const d = parsed.data;
    createMsg.mutate(
      { name: d.name, email: d.email, phone: d.phone, subject: d.subject, message: d.message, brand: brand ?? "curemed" },
      {
        onSuccess: () => {
          setForm({ name: "", email: "", phone: "", subject: "", message: "" });
          toast.success(t("contact.success"));
        },
        onError: () => toast.error(t("contact.error")),
      }
    );
  };

  return (
    <section id="contact" className="relative py-20 md:py-24">
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-muted/30 to-transparent" />
      <div className="container">
        <div className="max-w-2xl mx-auto text-center mb-10 animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
            <Sparkles className="h-3 w-3" /> {t("contact.send")}
          </span>
          <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
              {t("contact.title")}
            </span>
          </h2>
          <p className="mt-4 text-muted-foreground text-base md:text-lg">{t("contact.subtitle")}</p>
        </div>

        <div className="group relative max-w-2xl mx-auto">
          {/* animated gradient ring */}
          <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-sky-400 via-violet-500 to-pink-500 opacity-60 blur transition-opacity duration-500 group-hover:opacity-90" />
          <form
            onSubmit={onSubmit}
            className="relative grid gap-5 rounded-3xl border border-border/60 bg-card/90 p-6 md:p-9 backdrop-blur-md shadow-2xl"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("contact.name")}
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  maxLength={100}
                  className="h-11 rounded-xl border-border/60 bg-background/70 transition-all focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("contact.email")}
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  maxLength={255}
                  className="h-11 rounded-xl border-border/60 bg-background/70 transition-all focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-400/30"
                />
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("contact.phone")}
                </Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  maxLength={40}
                  className="h-11 rounded-xl border-border/60 bg-background/70 transition-all focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("contact.subject")}
                </Label>
                <Input
                  id="subject"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  required
                  maxLength={200}
                  className="h-11 rounded-xl border-border/60 bg-background/70 transition-all focus-visible:border-pink-400 focus-visible:ring-2 focus-visible:ring-pink-400/30"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("contact.message")}
              </Label>
              <Textarea
                id="message"
                rows={6}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
                maxLength={2000}
                className="rounded-xl border-border/60 bg-background/70 transition-all focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-400/30"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={createMsg.isPending}
              className="group/btn relative h-12 overflow-hidden rounded-xl bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 text-white font-semibold shadow-lg shadow-violet-500/30 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-500/40 disabled:opacity-70"
            >
              <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full" />
              <span className="relative inline-flex items-center gap-2">
                {createMsg.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {t("contact.send")}
              </span>
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}