import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { messages, type BrandKey } from "@/lib/db";
import { toast } from "sonner";
import { z } from "zod";

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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(t("contact.error")); return; }
    const d = parsed.data;
    messages.create({
      name: d.name, email: d.email, phone: d.phone,
      subject: d.subject, message: d.message,
      brand: brand ?? "curemed",
    });
    setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    toast.success(t("contact.success"));
  };

  return (
    <section id="contact" className="container py-16 md:py-24">
      <div className="max-w-2xl mx-auto text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-bold">{t("contact.title")}</h2>
        <p className="mt-3 text-muted-foreground">{t("contact.subtitle")}</p>
      </div>
      <form onSubmit={onSubmit} className="max-w-2xl mx-auto grid gap-4 bg-card p-6 md:p-8 rounded-2xl border border-border">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="name">{t("contact.name")}</Label><Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} /></div>
          <div className="space-y-1.5"><Label htmlFor="email">{t("contact.email")}</Label><Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={255} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="phone">{t("contact.phone")}</Label><Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} /></div>
          <div className="space-y-1.5"><Label htmlFor="subject">{t("contact.subject")}</Label><Input id="subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required maxLength={200} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="message">{t("contact.message")}</Label><Textarea id="message" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required maxLength={2000} /></div>
        <Button type="submit" size="lg" className="bg-brand hover:bg-brand/90 text-white">{t("contact.send")}</Button>
      </form>
    </section>
  );
}