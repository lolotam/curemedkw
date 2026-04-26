import { SiteLayout } from "@/components/site/SiteLayout";
import { Card } from "@/components/ui/card";
import {
  ShieldCheck,
  Handshake,
  Globe2,
  Sparkles,
  HeartPulse,
  Award,
  Lightbulb,
  Users,
  MapPin,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

const MAP_EMBED_SRC =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d217.37361994183146!2d48.01954202433483!3d29.341642883971396!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3fcf9d5d6f4578d5%3A0x62965d2b9c4a932c!2sGrand%20Hyper%20Hawally%202!5e0!3m2!1sen!2skw!4v1777236711436!5m2!1sen!2skw";

export default function AboutUs() {
  const { t } = useI18n();

  const pillars = [
    { icon: ShieldCheck, key: "quality" },
    { icon: Handshake, key: "partnership" },
    { icon: Globe2, key: "accessibility" },
  ];

  const values = [
    { icon: ShieldCheck, key: "integrity" },
    { icon: Award, key: "excellence" },
    { icon: HeartPulse, key: "care" },
    { icon: Lightbulb, key: "innovation" },
    { icon: Users, key: "partnership" },
  ];

  const whyChoose = ["portfolio", "team", "logistics", "expertise", "presence", "support"];

  return (
    <SiteLayout brand="curemed">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 md:py-28 bg-gradient-to-b from-brand/5 via-background to-background">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="absolute top-1/2 -right-24 h-80 w-80 rounded-full bg-pink-400/15 blur-3xl" />
        </div>
        <div className="container max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand backdrop-blur">
            <Sparkles className="h-3 w-3" />
            {t("about.hero.eyebrow")}
          </span>
          <h1 className="mt-4 text-4xl md:text-6xl font-bold tracking-tight">
            {t("about.hero.title")}
          </h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            {t("about.hero.subtitle")}
          </p>
        </div>
      </section>

      {/* Our Story */}
      <section className="container py-16 md:py-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">{t("about.story.title")}</h2>
          <p className="text-muted-foreground leading-relaxed text-base md:text-lg whitespace-pre-line">
            {t("about.story.body")}
          </p>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="container py-12">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-8 md:p-10 bg-gradient-to-br from-sky-500/10 to-cyan-400/5 border-sky-500/20">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 mb-4">
              <HeartPulse className="h-6 w-6" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3">{t("about.mission.title")}</h2>
            <blockquote className="text-base md:text-lg text-foreground/85 leading-relaxed border-l-4 border-sky-500 pl-4 italic">
              {t("about.mission.body")}
            </blockquote>
          </Card>
          <Card className="p-8 md:p-10 bg-gradient-to-br from-violet-500/10 to-pink-400/5 border-violet-500/20">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-600 mb-4">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3">{t("about.vision.title")}</h2>
            <blockquote className="text-base md:text-lg text-foreground/85 leading-relaxed border-l-4 border-violet-500 pl-4 italic">
              {t("about.vision.body")}
            </blockquote>
          </Card>
        </div>
      </section>

      {/* Three pillars */}
      <section className="container py-16 md:py-20">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">{t("about.pillars.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("about.pillars.subtitle")}</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {pillars.map(({ icon: Icon, key }) => (
            <Card
              key={key}
              className="p-6 md:p-8 transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand mb-4">
                <Icon className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-bold mb-2">
                {t(`about.pillars.${key}.title`)}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`about.pillars.${key}.body`)}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Why Choose Curemed */}
      <section className="bg-muted/30 py-16 md:py-20">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">{t("about.why.title")}</h2>
            <p className="mt-3 text-muted-foreground">{t("about.why.subtitle")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 max-w-4xl mx-auto">
            {whyChoose.map((k) => (
              <div
                key={k}
                className="flex items-start gap-3 p-5 rounded-2xl bg-card border border-border"
              >
                <CheckCircle2 className="h-5 w-5 text-brand shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm">{t(`about.why.${k}.title`)}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t(`about.why.${k}.body`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our values */}
      <section className="container py-16 md:py-20">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">{t("about.values.title")}</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5 max-w-5xl mx-auto">
          {values.map(({ icon: Icon, key }) => (
            <Card
              key={key}
              className="p-5 text-center transition-all hover:-translate-y-1 hover:shadow-md"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand mb-3">
                <Icon className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-sm mb-1">
                {t(`about.values.${key}.title`)}
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t(`about.values.${key}.body`)}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Location */}
      <section className="container pb-20">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold">{t("contact.location.title")}</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <Card className="p-6">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-brand shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold mb-1">{t("contact.address.title")}</h4>
                  <p className="text-sm text-muted-foreground">{t("contact.address.body")}</p>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-brand shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold mb-1">{t("contact.hours.title")}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t("contact.hours.weekdays")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("contact.hours.weekend")}
                  </p>
                </div>
              </div>
            </Card>
          </div>
          <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-border shadow-lg">
            <iframe
              src={MAP_EMBED_SRC}
              title="Curemed location"
              className="w-full h-[450px] border-0"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}