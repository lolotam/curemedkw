import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useI18n } from "@/lib/i18n";

export interface FaqItem { q: { en: string; ar: string }; a: { en: string; ar: string }; }

const DEFAULT_FAQ: FaqItem[] = [
  { q: { en: "Where are Curemed products available?", ar: "أين تتوفر منتجات كيورميد؟" }, a: { en: "Across leading pharmacies and clinics in Kuwait. Contact us for the closest stockist.", ar: "في الصيدليات والعيادات الرائدة في الكويت. تواصل معنا لمعرفة أقرب نقطة بيع." } },
  { q: { en: "Are your products clinically tested?", ar: "هل منتجاتكم مختبرة سريرياً؟" }, a: { en: "Yes — we partner only with brands whose products meet clinical and regulatory standards.", ar: "نعم — نتعامل فقط مع علامات تجارية تستوفي المعايير السريرية والتنظيمية." } },
  { q: { en: "Do you offer wholesale partnerships?", ar: "هل تقدمون شراكات للجملة؟" }, a: { en: "Absolutely. Use the contact form and our team will get back to you within one business day.", ar: "بالتأكيد. استخدم نموذج التواصل وسيرد عليك فريقنا خلال يوم عمل واحد." } },
];

export function FAQ({ items = DEFAULT_FAQ }: { items?: FaqItem[] }) {
  const { t, lang } = useI18n();
  return (
    <section className="container py-16 md:py-24">
      <div className="text-center mb-12"><h2 className="text-3xl md:text-4xl font-bold">{t("faq.title")}</h2></div>
      <Accordion type="single" collapsible className="max-w-2xl mx-auto">
        {items.map((it, i) => (
          <AccordionItem key={i} value={`item-${i}`}>
            <AccordionTrigger className="text-start">{it.q[lang]}</AccordionTrigger>
            <AccordionContent>{it.a[lang]}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}