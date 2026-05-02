import { SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";
import {
  ColorfulHeroBg,
  GlowCard,
  Icon3D,
  Reveal,
} from "@/components/site/ColorfulFx";
import {
  FileCheck,
  Tag,
  CreditCard,
  Truck,
  RotateCcw,
  ShieldAlert,
  Scale,
  Mail,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { GradientKey } from "@/components/site/ColorfulFx";

type Section = {
  icon: LucideIcon;
  variant: GradientKey;
  titleEn: string;
  titleAr: string;
  bodyEn: React.ReactNode;
  bodyAr: React.ReactNode;
};

export default function TermsOfService() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const sections: Section[] = [
    {
      icon: FileCheck,
      variant: "sky",
      titleEn: "Acceptance of terms",
      titleAr: "قبول الشروط",
      bodyEn: (
        <p>
          By using the Curemed website, you agree to these terms. If you do not agree,
          please do not use the site.
        </p>
      ),
      bodyAr: (
        <p>
          باستخدامك لموقع Curemed، فإنك توافق على هذه الشروط. إذا لم توافق، يرجى عدم
          استخدام الموقع.
        </p>
      ),
    },
    {
      icon: Tag,
      variant: "violet",
      titleEn: "Products and pricing",
      titleAr: "المنتجات والأسعار",
      bodyEn: (
        <p>
          All prices are in Kuwaiti Dinar (KWD) and may change without notice. We make
          reasonable efforts to display accurate product information and availability.
        </p>
      ),
      bodyAr: (
        <p>
          جميع الأسعار بالدينار الكويتي (KWD) وقد تتغير دون إشعار. نبذل جهدنا لعرض
          معلومات دقيقة عن المنتجات وتوفرها.
        </p>
      ),
    },
    {
      icon: CreditCard,
      variant: "emerald",
      titleEn: "Orders and payment",
      titleAr: "الطلبات والدفع",
      bodyEn: (
        <p>
          All orders are subject to acceptance. Payment options include cash on delivery
          and pay-by-link.
        </p>
      ),
      bodyAr: (
        <p>
          تخضع جميع الطلبات للقبول. تشمل خيارات الدفع الدفع عند الاستلام والدفع برابط
          آمن.
        </p>
      ),
    },
    {
      icon: Truck,
      variant: "amber",
      titleEn: "Delivery",
      titleAr: "التوصيل",
      bodyEn: (
        <p>
          We deliver within the State of Kuwait. Delivery times may vary by area and
          product availability.
        </p>
      ),
      bodyAr: (
        <p>
          نوصّل داخل دولة الكويت. قد تختلف أوقات التوصيل حسب المنطقة وتوفر المنتج.
        </p>
      ),
    },
    {
      icon: RotateCcw,
      variant: "rose",
      titleEn: "Returns and exchanges",
      titleAr: "الإرجاع والاستبدال",
      bodyEn: (
        <p>
          To request a return, contact us within 7 days of delivery. The product must be
          in its original condition. Opened products cannot be returned for
          health-and-safety reasons.
        </p>
      ),
      bodyAr: (
        <p>
          لطلب الإرجاع، تواصل معنا خلال 7 أيام من الاستلام. يجب أن يكون المنتج بحالته
          الأصلية. لا تُرجع المنتجات المفتوحة لأسباب صحية.
        </p>
      ),
    },
    {
      icon: ShieldAlert,
      variant: "indigo",
      titleEn: "Liability",
      titleAr: "المسؤولية",
      bodyEn: (
        <p>
          Curemed is not liable for any indirect damages arising from use of the site or
          misuse of products contrary to instructions.
        </p>
      ),
      bodyAr: (
        <p>
          لا تتحمل Curemed المسؤولية عن أي أضرار غير مباشرة ناتجة عن استخدام الموقع أو
          المنتجات بشكل مخالف للتعليمات.
        </p>
      ),
    },
    {
      icon: Scale,
      variant: "cyan",
      titleEn: "Governing law",
      titleAr: "القانون الحاكم",
      bodyEn: (
        <p>
          These terms are governed by the laws of the State of Kuwait and its competent
          courts.
        </p>
      ),
      bodyAr: <p>تخضع هذه الشروط لقوانين دولة الكويت ومحاكمها المختصة.</p>,
    },
    {
      icon: Mail,
      variant: "violet",
      titleEn: "Contact",
      titleAr: "التواصل",
      bodyEn: (
        <p>
          <a href="mailto:info@curemed.com" className="text-brand font-medium hover:underline">
            info@curemed.com
          </a>{" "}
          — phone:{" "}
          <a href="tel:+96560003759" className="text-brand font-medium hover:underline">
            +965 6000 3759
          </a>
          .
        </p>
      ),
      bodyAr: (
        <p>
          <a href="mailto:info@curemed.com" className="text-brand font-medium hover:underline">
            info@curemed.com
          </a>{" "}
          — هاتف:{" "}
          <a href="tel:+96560003759" className="text-brand font-medium hover:underline">
            +965 6000 3759
          </a>
          .
        </p>
      ),
    },
  ];

  return (
    <SiteLayout brand="curemed">
      {/* HERO */}
      <section className="relative overflow-hidden py-20 md:py-28">
        <ColorfulHeroBg />
        <div className="container max-w-4xl text-center">
          <div className="animate-fade-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand backdrop-blur-md shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              {isAr ? "اتفاقية الاستخدام" : "Usage Agreement"}
            </span>
          </div>
          <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight animate-fade-in [animation-delay:120ms]">
            <span className="bg-gradient-to-r from-amber-500 via-rose-500 to-violet-500 bg-clip-text text-transparent">
              {isAr ? "الشروط والأحكام" : "Terms of Service"}
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base md:text-lg text-muted-foreground leading-relaxed animate-fade-in [animation-delay:240ms]">
            {isAr
              ? "القواعد التي تنظم استخدامك لخدمات Curemed."
              : "The rules that govern your use of Curemed services."}
          </p>
          <p className="mt-4 text-xs text-muted-foreground animate-fade-in [animation-delay:320ms]">
            {isAr ? "آخر تحديث: مايو 2026" : "Last updated: May 2026"}
          </p>
        </div>
        <div className="mt-16 h-px w-full bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
      </section>

      {/* SECTIONS */}
      <section className="container py-16 md:py-20">
        <div className="grid gap-7 md:grid-cols-2 max-w-6xl mx-auto">
          {sections.map((s, i) => (
            <Reveal key={i} delay={i * 90}>
              <GlowCard variant={s.variant} className="p-7 md:p-8">
                <Icon3D icon={s.icon} variant={s.variant} size="md" />
                <h2 className="mt-5 text-2xl font-bold tracking-tight">
                  {isAr ? s.titleAr : s.titleEn}
                </h2>
                <div className="mt-3 text-sm md:text-base text-foreground/85 leading-relaxed">
                  {isAr ? s.bodyAr : s.bodyEn}
                </div>
              </GlowCard>
            </Reveal>
          ))}
        </div>
      </section>
    </SiteLayout>
  );
}
