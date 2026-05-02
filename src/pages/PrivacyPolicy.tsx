import { SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";
import {
  ColorfulHeroBg,
  GlowCard,
  Icon3D,
  Reveal,
} from "@/components/site/ColorfulFx";
import {
  ShieldCheck,
  Database,
  Cog,
  Share2,
  UserCheck,
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

export default function PrivacyPolicy() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const sections: Section[] = [
    {
      icon: ShieldCheck,
      variant: "sky",
      titleEn: "Introduction",
      titleAr: "المقدمة",
      bodyEn: (
        <p>
          Curemed respects your privacy. This policy explains how we collect, use, and
          protect your information when you use our website and services in Kuwait.
        </p>
      ),
      bodyAr: (
        <p>
          تحترم Curemed خصوصيتك. توضح هذه السياسة كيفية جمع واستخدام وحماية معلوماتك
          عند استخدامك لموقعنا وخدماتنا في الكويت.
        </p>
      ),
    },
    {
      icon: Database,
      variant: "violet",
      titleEn: "Information we collect",
      titleAr: "المعلومات التي نجمعها",
      bodyEn: (
        <ul className="list-disc pl-6 space-y-1">
          <li>Full name, phone number, and email address</li>
          <li>Delivery address (governorate, area, block, street, building)</li>
          <li>Order and payment details</li>
          <li>Technical data such as IP address, browser type, and cookies</li>
        </ul>
      ),
      bodyAr: (
        <ul className="list-disc pr-6 space-y-1">
          <li>الاسم الكامل ورقم الهاتف والبريد الإلكتروني</li>
          <li>عنوان التوصيل (المحافظة، المنطقة، القطعة، الشارع، المبنى)</li>
          <li>تفاصيل الطلبات والمدفوعات</li>
          <li>بيانات تقنية مثل عنوان IP ونوع المتصفح وملفات تعريف الارتباط</li>
        </ul>
      ),
    },
    {
      icon: Cog,
      variant: "emerald",
      titleEn: "How we use your information",
      titleAr: "كيفية استخدام معلوماتك",
      bodyEn: (
        <ul className="list-disc pl-6 space-y-1">
          <li>Process and deliver your orders</li>
          <li>Communicate about orders or inquiries</li>
          <li>Improve our services and user experience</li>
          <li>Send promotional offers (you can unsubscribe at any time)</li>
        </ul>
      ),
      bodyAr: (
        <ul className="list-disc pr-6 space-y-1">
          <li>معالجة الطلبات وتوصيلها</li>
          <li>التواصل بشأن الطلبات أو الاستفسارات</li>
          <li>تحسين خدماتنا وتجربة المستخدم</li>
          <li>إرسال العروض الترويجية (يمكنك إلغاء الاشتراك في أي وقت)</li>
        </ul>
      ),
    },
    {
      icon: Share2,
      variant: "amber",
      titleEn: "Sharing of information",
      titleAr: "مشاركة المعلومات",
      bodyEn: (
        <p>
          We do not sell your data. We may share it with delivery partners and payment
          processors only to the extent necessary to fulfill your order.
        </p>
      ),
      bodyAr: (
        <p>
          لا نبيع بياناتك. قد نشاركها مع شركات التوصيل ومعالجي الدفع فقط بالقدر اللازم
          لإتمام طلبك.
        </p>
      ),
    },
    {
      icon: UserCheck,
      variant: "indigo",
      titleEn: "Your rights",
      titleAr: "حقوقك",
      bodyEn: (
        <p>
          You may request access to, correction of, or deletion of your personal data by
          emailing us at{" "}
          <a href="mailto:info@curemed.com" className="text-brand font-medium hover:underline">
            info@curemed.com
          </a>
          .
        </p>
      ),
      bodyAr: (
        <p>
          يمكنك طلب الوصول إلى بياناتك أو تصحيحها أو حذفها بمراسلتنا على{" "}
          <a href="mailto:info@curemed.com" className="text-brand font-medium hover:underline">
            info@curemed.com
          </a>
          .
        </p>
      ),
    },
    {
      icon: Mail,
      variant: "rose",
      titleEn: "Contact us",
      titleAr: "التواصل معنا",
      bodyEn: (
        <p>
          For any privacy-related inquiry:{" "}
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
          لأي استفسار حول الخصوصية:{" "}
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
              {isAr ? "حقوقك أولًا" : "Your Rights First"}
            </span>
          </div>
          <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight animate-fade-in [animation-delay:120ms]">
            <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
              {isAr ? "سياسة الخصوصية" : "Privacy Policy"}
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base md:text-lg text-muted-foreground leading-relaxed animate-fade-in [animation-delay:240ms]">
            {isAr
              ? "نوضح بشفافية كيفية جمع بياناتك واستخدامها وحمايتها."
              : "Transparent details on how we collect, use, and protect your data."}
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
            <Reveal key={i} delay={i * 100}>
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
