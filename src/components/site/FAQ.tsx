import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useI18n } from "@/lib/i18n";
import { HelpCircle } from "lucide-react";

export interface FaqItem { q: { en: string; ar: string }; a: { en: string; ar: string }; }

const DEFAULT_FAQ: FaqItem[] = [
  { q: { en: "Where are Curemed products available?", ar: "أين تتوفر منتجات كيورميد؟" }, a: { en: "Across leading pharmacies and clinics in Kuwait. Contact us for the closest stockist.", ar: "في الصيدليات والعيادات الرائدة في الكويت. تواصل معنا لمعرفة أقرب نقطة بيع." } },
  { q: { en: "Are your products clinically tested?", ar: "هل منتجاتكم مختبرة سريرياً؟" }, a: { en: "Yes — we partner only with brands whose products meet clinical and regulatory standards.", ar: "نعم — نتعامل فقط مع علامات تجارية تستوفي المعايير السريرية والتنظيمية." } },
  { q: { en: "Do you offer wholesale partnerships?", ar: "هل تقدمون شراكات للجملة؟" }, a: { en: "Absolutely. Use the contact form and our team will get back to you within one business day.", ar: "بالتأكيد. استخدم نموذج التواصل وسيرد عليك فريقنا خلال يوم عمل واحد." } },
  { q: { en: "How can I become an authorized retailer?", ar: "كيف أصبح موزعاً معتمداً؟" }, a: { en: "Reach out via our contact page with your business details. Our partnerships team will guide you through the onboarding process.", ar: "تواصل معنا عبر صفحة الاتصال مع تفاصيل نشاطك التجاري. سيرشدك فريق الشراكات لدينا خلال خطوات الانضمام." } },
  { q: { en: "Are your products certified by Kuwait's Ministry of Health?", ar: "هل منتجاتكم معتمدة من وزارة الصحة الكويتية؟" }, a: { en: "Yes, all our pharmaceutical products are registered with the Ministry of Health in Kuwait and comply with local regulations.", ar: "نعم، جميع منتجاتنا الدوائية مسجلة لدى وزارة الصحة في الكويت ومتوافقة مع اللوائح المحلية." } },
  { q: { en: "Do you ship across the GCC region?", ar: "هل تشحنون إلى دول مجلس التعاون الخليجي؟" }, a: { en: "Currently, we serve the Kuwaiti market exclusively. For GCC inquiries, please contact our partnerships team for distribution opportunities.", ar: "نخدم حالياً السوق الكويتي حصرياً. لاستفسارات دول الخليج، يرجى التواصل مع فريق الشراكات لفرص التوزيع." } },
  { q: { en: "How do I get personalized product recommendations?", ar: "كيف أحصل على توصيات شخصية للمنتجات؟" }, a: { en: "Visit any of our partner pharmacies for expert consultation, or contact us directly through the website for tailored advice.", ar: "زر أي صيدلية شريكة للحصول على استشارة متخصصة، أو تواصل معنا مباشرة عبر الموقع للحصول على نصائح مخصصة." } },
  { q: { en: "What makes Curemed brands different?", ar: "ما الذي يميز علامات كيورميد التجارية؟" }, a: { en: "We curate only globally trusted brands with proven research, premium ingredients, and a commitment to safety — every product is hand-picked.", ar: "نختار فقط علامات تجارية موثوقة عالمياً بأبحاث مثبتة، ومكونات فاخرة، والتزام بالسلامة — كل منتج يتم انتقاؤه بعناية." } },
];

export function FAQ({ items = DEFAULT_FAQ }: { items?: FaqItem[] }) {
  const { t, lang } = useI18n();
  return (
    <section className="relative w-full py-20 md:py-32 overflow-hidden bg-gradient-to-b from-background via-muted/30 to-background">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-brand/10 blur-3xl animate-blob-drift" />
        <div className="absolute bottom-0 -right-20 h-96 w-96 rounded-full bg-brand/10 blur-3xl animate-blob-drift animation-delay-300" />
      </div>

      <div className="w-full px-4 md:px-8 lg:px-16">
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-20 animate-fade-in-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-1.5 text-xs md:text-sm font-semibold uppercase tracking-[0.18em] text-brand backdrop-blur">
            <HelpCircle className="h-4 w-4" />
            {lang === "ar" ? "هل لديك سؤال؟" : "Got Questions?"}
          </span>
          <h2 className="mt-6 text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
            {t("faq.title")}
          </h2>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground">
            {lang === "ar"
              ? "كل ما تحتاج معرفته عن كيورميد ومنتجاتنا وخدماتنا."
              : "Everything you need to know about Curemed, our products and our services."}
          </p>
        </div>

        <Accordion type="single" collapsible className="max-w-5xl mx-auto space-y-4">
          {items.map((it, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="group border border-border rounded-2xl bg-card/60 backdrop-blur-sm px-6 md:px-8 transition-all hover:border-brand/40 hover:shadow-lg data-[state=open]:border-brand/60 data-[state=open]:shadow-xl data-[state=open]:bg-card animate-fade-in-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <AccordionTrigger className="text-start text-base md:text-xl font-semibold py-3 md:py-4 hover:no-underline group-data-[state=open]:text-brand">
                <span className="flex items-center gap-3 md:gap-4">
                  <span className="flex-shrink-0 inline-flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-full bg-brand-soft text-brand text-xs md:text-sm font-bold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{it.q[lang]}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-base md:text-lg text-muted-foreground leading-relaxed pb-6 md:pb-8 ps-12 md:ps-[60px]">
                {it.a[lang]}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}