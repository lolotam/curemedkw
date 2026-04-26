import { useEffect, useRef, useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
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
  Target,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const MAP_EMBED_SRC =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d217.37361994183146!2d48.01954202433483!3d29.341642883971396!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3fcf9d5d6f4578d5%3A0x62965d2b9c4a932c!2sGrand%20Hyper%20Hawally%202!5e0!3m2!1sen!2skw!4v1777236711436!5m2!1sen!2skw";

/** Reveal-on-scroll hook (no deps). */
function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, ...options },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [options]);
  return { ref, inView };
}

type GradientKey =
  | "sky"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "indigo"
  | "cyan";

const GRADIENTS: Record<GradientKey, { from: string; via?: string; to: string; shadow: string }> = {
  sky: { from: "from-sky-400", via: "via-blue-500", to: "to-indigo-500", shadow: "shadow-sky-500/40" },
  violet: { from: "from-violet-500", via: "via-fuchsia-500", to: "to-pink-500", shadow: "shadow-violet-500/40" },
  emerald: { from: "from-emerald-400", via: "via-teal-400", to: "to-cyan-500", shadow: "shadow-emerald-500/40" },
  amber: { from: "from-amber-400", via: "via-orange-400", to: "to-rose-400", shadow: "shadow-amber-500/40" },
  rose: { from: "from-rose-400", via: "via-pink-500", to: "to-fuchsia-500", shadow: "shadow-rose-500/40" },
  indigo: { from: "from-indigo-500", via: "via-violet-500", to: "to-purple-500", shadow: "shadow-indigo-500/40" },
  cyan: { from: "from-cyan-400", via: "via-sky-500", to: "to-blue-500", shadow: "shadow-cyan-500/40" },
};

/** 3D-style colored icon badge. */
function Icon3D({
  icon: Icon,
  variant,
  size = "md",
}: {
  icon: LucideIcon;
  variant: GradientKey;
  size?: "sm" | "md" | "lg";
}) {
  const g = GRADIENTS[variant];
  const dims =
    size === "lg" ? "h-20 w-20" : size === "md" ? "h-16 w-16" : "h-12 w-12";
  const iconSize =
    size === "lg" ? "h-10 w-10" : size === "md" ? "h-8 w-8" : "h-6 w-6";
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-2xl",
        "bg-gradient-to-br ring-1 ring-white/30 shadow-xl",
        "transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110",
        dims,
        g.from,
        g.via,
        g.to,
        g.shadow,
      )}
    >
      {/* glossy top sheen */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-1 top-1 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/50 to-transparent"
      />
      {/* soft inner glow */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10"
      />
      <Icon className={cn("relative text-white drop-shadow-md", iconSize)} strokeWidth={2.25} />
    </span>
  );
}

/** Wrapper that fades + lifts content into view on scroll. */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out will-change-transform",
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default function AboutUs() {
  const { t } = useI18n();

  const pillars: { icon: LucideIcon; key: string; variant: GradientKey }[] = [
    { icon: ShieldCheck, key: "quality", variant: "sky" },
    { icon: Handshake, key: "partnership", variant: "violet" },
    { icon: Globe2, key: "accessibility", variant: "emerald" },
  ];

  const values: { icon: LucideIcon; key: string; variant: GradientKey }[] = [
    { icon: ShieldCheck, key: "integrity", variant: "sky" },
    { icon: Award, key: "excellence", variant: "amber" },
    { icon: HeartPulse, key: "care", variant: "rose" },
    { icon: Lightbulb, key: "innovation", variant: "indigo" },
    { icon: Users, key: "partnership", variant: "violet" },
  ];

  const whyChoose = ["portfolio", "team", "logistics", "expertise", "presence", "support"];

  return (
    <SiteLayout brand="curemed">
      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden py-24 md:py-32">
        {/* animated gradient background */}
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-pink-500/10" />
          <div className="absolute -top-40 -left-20 h-[28rem] w-[28rem] rounded-full bg-sky-400/30 blur-3xl animate-blob-drift" />
          <div className="absolute -top-20 right-0 h-[24rem] w-[24rem] rounded-full bg-violet-400/25 blur-3xl animate-blob-drift animation-delay-200" />
          <div className="absolute bottom-0 left-1/3 h-[20rem] w-[20rem] rounded-full bg-pink-400/25 blur-3xl animate-blob-drift animation-delay-300" />
          {/* dotted texture */}
          <div
            className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
            style={{
              backgroundImage:
                "radial-gradient(currentColor 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
        </div>

        <div className="container max-w-5xl text-center">
          <div className="animate-fade-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand backdrop-blur-md shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              {t("about.hero.eyebrow")}
            </span>
          </div>
          <h1 className="mt-6 text-4xl md:text-7xl font-bold tracking-tight animate-fade-in [animation-delay:120ms]">
            <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
              {t("about.hero.title")}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg md:text-xl text-muted-foreground leading-relaxed animate-fade-in [animation-delay:240ms]">
            {t("about.hero.subtitle")}
          </p>
        </div>

        {/* gradient divider */}
        <div className="mt-20 h-px w-full bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
      </section>

      {/* ===================== OUR STORY ===================== */}
      <section className="container py-20 md:py-24">
        <div className="grid gap-10 lg:grid-cols-12 items-center">
          <Reveal className="lg:col-span-5">
            <div className="relative inline-block">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-sky-500/30 via-violet-500/20 to-pink-500/30 blur-2xl" />
              <div className="relative">
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-600">
                  <Sparkles className="h-3 w-3" /> {t("about.hero.eyebrow")}
                </span>
                <h2 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-sky-500 to-violet-500 bg-clip-text text-transparent">
                    {t("about.story.title")}
                  </span>
                </h2>
              </div>
            </div>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-7">
            <div className="relative rounded-3xl border border-border/60 bg-card/70 p-7 md:p-9 backdrop-blur-sm shadow-lg">
              <p className="text-base md:text-lg text-foreground/85 leading-relaxed whitespace-pre-line">
                {t("about.story.body")}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== MISSION & VISION ===================== */}
      <section className="relative py-20 md:py-24">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-muted/30 to-transparent" />
        <div className="container">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Mission */}
            <Reveal>
              <div className="group relative h-full">
                {/* animated gradient ring */}
                <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500 opacity-60 blur transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative h-full rounded-3xl border border-border/60 bg-card/85 p-8 md:p-10 backdrop-blur-md shadow-xl transition-transform duration-500 group-hover:-translate-y-2">
                  <Icon3D icon={Target} variant="sky" size="lg" />
                  <h2 className="mt-6 text-3xl md:text-4xl font-bold tracking-tight">
                    {t("about.mission.title")}
                  </h2>
                  <blockquote className="mt-4 text-base md:text-lg text-foreground/85 leading-relaxed border-l-4 border-sky-500 pl-5 italic">
                    {t("about.mission.body")}
                  </blockquote>
                </div>
              </div>
            </Reveal>

            {/* Vision */}
            <Reveal delay={150}>
              <div className="group relative h-full">
                <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 opacity-60 blur transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative h-full rounded-3xl border border-border/60 bg-card/85 p-8 md:p-10 backdrop-blur-md shadow-xl transition-transform duration-500 group-hover:-translate-y-2">
                  <Icon3D icon={Eye} variant="violet" size="lg" />
                  <h2 className="mt-6 text-3xl md:text-4xl font-bold tracking-tight">
                    {t("about.vision.title")}
                  </h2>
                  <blockquote className="mt-4 text-base md:text-lg text-foreground/85 leading-relaxed border-l-4 border-violet-500 pl-5 italic">
                    {t("about.vision.body")}
                  </blockquote>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== THREE PILLARS ===================== */}
      <section className="container py-20 md:py-24">
        <Reveal className="max-w-2xl mx-auto text-center mb-14">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
              {t("about.pillars.title")}
            </span>
          </h2>
          <p className="mt-4 text-muted-foreground text-base md:text-lg">{t("about.pillars.subtitle")}</p>
        </Reveal>

        <div className="grid gap-7 md:grid-cols-3">
          {pillars.map(({ icon, key, variant }, i) => (
            <Reveal key={key} delay={i * 120}>
              <div className="group relative h-full">
                <div
                  className={cn(
                    "absolute -inset-0.5 rounded-3xl opacity-0 blur transition-opacity duration-500 group-hover:opacity-70 bg-gradient-to-br",
                    GRADIENTS[variant].from,
                    GRADIENTS[variant].via,
                    GRADIENTS[variant].to,
                  )}
                />
                <div className="relative h-full overflow-hidden rounded-3xl border border-border/60 bg-card/85 p-7 md:p-8 backdrop-blur-md shadow-md transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl">
                  {/* corner number */}
                  <span className="absolute -top-2 right-4 rtl:right-auto rtl:left-4 select-none text-7xl font-black text-foreground/5">
                    0{i + 1}
                  </span>
                  <Icon3D icon={icon} variant={variant} size="md" />
                  <h3 className="mt-5 text-2xl font-bold tracking-tight">
                    {t(`about.pillars.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">
                    {t(`about.pillars.${key}.body`)}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== WHY CHOOSE ===================== */}
      <section className="relative py-20 md:py-24">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-sky-500/[0.04] to-transparent" />
        <div className="container">
          <Reveal className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-emerald-500 via-cyan-500 to-sky-500 bg-clip-text text-transparent">
                {t("about.why.title")}
              </span>
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg">{t("about.why.subtitle")}</p>
          </Reveal>

          <div className="grid gap-5 md:grid-cols-2 max-w-5xl mx-auto">
            {whyChoose.map((k, i) => (
              <Reveal key={k} delay={i * 80}>
                <div className="group relative flex items-start gap-4 rounded-2xl border border-border/60 bg-card/80 p-5 md:p-6 backdrop-blur-sm shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-cyan-400/40">
                  <Icon3D icon={CheckCircle2} variant="cyan" size="sm" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-base">{t(`about.why.${k}.title`)}</h4>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      {t(`about.why.${k}.body`)}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== VALUES ===================== */}
      <section className="container py-20 md:py-24">
        <Reveal className="max-w-2xl mx-auto text-center mb-14">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-amber-500 via-rose-500 to-violet-500 bg-clip-text text-transparent">
              {t("about.values.title")}
            </span>
          </h2>
        </Reveal>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 max-w-6xl mx-auto">
          {values.map(({ icon, key, variant }, i) => (
            <Reveal key={key} delay={i * 100}>
              <div className="group relative h-full">
                <div
                  className={cn(
                    "absolute -inset-0.5 rounded-3xl opacity-0 blur transition-opacity duration-500 group-hover:opacity-60 bg-gradient-to-br",
                    GRADIENTS[variant].from,
                    GRADIENTS[variant].via,
                    GRADIENTS[variant].to,
                  )}
                />
                <div className="relative h-full rounded-3xl border border-border/60 bg-card/85 p-6 text-center backdrop-blur-sm shadow-md transition-transform duration-500 group-hover:-translate-y-2">
                  <div className="flex justify-center">
                    <Icon3D icon={icon} variant={variant} size="md" />
                  </div>
                  <h4 className="mt-5 font-bold text-base">
                    {t(`about.values.${key}.title`)}
                  </h4>
                  <p className="mt-2 text-xs md:text-sm text-muted-foreground leading-relaxed">
                    {t(`about.values.${key}.body`)}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== LOCATION ===================== */}
      <section className="relative pb-24">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent to-violet-500/[0.04]" />
        <div className="container">
          <Reveal className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-violet-500 to-sky-500 bg-clip-text text-transparent">
                {t("contact.location.title")}
              </span>
            </h2>
          </Reveal>

          <div className="grid gap-6 lg:grid-cols-3">
            <Reveal className="space-y-5 lg:col-span-1">
              <div className="group relative">
                <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-500 opacity-50 blur transition-opacity duration-500 group-hover:opacity-90" />
                <div className="relative rounded-3xl border border-border/60 bg-card/85 p-6 backdrop-blur-md shadow-lg">
                  <div className="flex items-start gap-4">
                    <Icon3D icon={MapPin} variant="rose" size="sm" />
                    <div>
                      <h4 className="font-bold mb-1">{t("contact.address.title")}</h4>
                      <p className="text-sm text-muted-foreground">{t("contact.address.body")}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="group relative">
                <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 opacity-50 blur transition-opacity duration-500 group-hover:opacity-90" />
                <div className="relative rounded-3xl border border-border/60 bg-card/85 p-6 backdrop-blur-md shadow-lg">
                  <div className="flex items-start gap-4">
                    <Icon3D icon={Clock} variant="amber" size="sm" />
                    <div>
                      <h4 className="font-bold mb-1">{t("contact.hours.title")}</h4>
                      <p className="text-sm text-muted-foreground">{t("contact.hours.weekdays")}</p>
                      <p className="text-sm text-muted-foreground">{t("contact.hours.weekend")}</p>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={150} className="lg:col-span-2">
              <div className="group relative">
                <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-sky-400 via-violet-500 to-pink-500 opacity-50 blur transition-opacity duration-500 group-hover:opacity-90" />
                <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card shadow-2xl">
                  <iframe
                    src={MAP_EMBED_SRC}
                    title="Curemed location"
                    className="w-full h-[450px] border-0 transition-transform duration-700 group-hover:scale-[1.02]"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}