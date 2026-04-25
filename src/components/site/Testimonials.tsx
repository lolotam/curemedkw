import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { Quote } from "lucide-react";

interface T { name: string; role: { en: string; ar: string }; quote: { en: string; ar: string }; }

const DEFAULTS: T[] = [
  { name: "Dr. Layla A.", role: { en: "Dermatologist, Kuwait", ar: "طبيبة جلدية، الكويت" }, quote: { en: "Curemed consistently delivers the brands I trust. Their service is professional and reliable.", ar: "تقدم كيورميد دائماً العلامات التي أثق بها. خدمتهم احترافية وموثوقة." } },
  { name: "Ahmed M.", role: { en: "Pharmacy owner", ar: "صاحب صيدلية" }, quote: { en: "Great product range and very responsive sales team. Highly recommended.", ar: "تشكيلة منتجات رائعة وفريق مبيعات سريع الاستجابة. أنصح به بشدة." } },
  { name: "Noura S.", role: { en: "Customer", ar: "عميلة" }, quote: { en: "I rely on Curemed brands for my whole family — quality I can feel.", ar: "أعتمد على علامات كيورميد لعائلتي بأكملها — جودة أشعر بها." } },
];

export function Testimonials({ items = DEFAULTS }: { items?: T[] }) {
  const { t, lang } = useI18n();
  return (
    <section className="container py-16 md:py-24">
      <div className="text-center mb-12"><h2 className="text-3xl md:text-4xl font-bold">{t("testimonials.title")}</h2></div>
      <div className="grid gap-6 md:grid-cols-3">
        {items.map((it, i) => (
          <Card key={i} className="p-6 bg-brand-soft border-brand/10">
            <Quote className="h-8 w-8 text-brand opacity-30 mb-3" />
            <p className="text-sm leading-relaxed text-foreground">"{it.quote[lang]}"</p>
            <div className="mt-4 pt-4 border-t border-border/50">
              <p className="font-semibold text-sm">{it.name}</p>
              <p className="text-xs text-muted-foreground">{it.role[lang]}</p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}