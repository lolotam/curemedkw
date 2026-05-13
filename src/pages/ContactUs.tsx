import { useEffect, useRef, useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Seo } from "@/components/site/Seo";
import { ContactSection } from "@/components/site/ContactSection";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Sparkles,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const MAP_EMBED_SRC =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d217.37361994183146!2d48.01954202433483!3d29.341642883971396!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3fcf9d5d6f4578d5%3A0x62965d2b9c4a932c!2sGrand%20Hyper%20Hawally%202!5e0!3m2!1sen!2skw!4v1777236711436!5m2!1sen!2skw";
const MAP_LINK = "https://maps.app.goo.gl/Jef93YXeUzmncKpr7";

type GradientKey = "sky" | "violet" | "emerald" | "amber" | "rose" | "indigo" | "cyan";

const GRADIENTS: Record<GradientKey, { from: string; via?: string; to: string; shadow: string }> = {
  sky: { from: "from-sky-400", via: "via-blue-500", to: "to-indigo-500", shadow: "shadow-sky-500/40" },
  violet: { from: "from-violet-500", via: "via-fuchsia-500", to: "to-pink-500", shadow: "shadow-violet-500/40" },
  emerald: { from: "from-emerald-400", via: "via-teal-400", to: "to-cyan-500", shadow: "shadow-emerald-500/40" },
  amber: { from: "from-amber-400", via: "via-orange-400", to: "to-rose-400", shadow: "shadow-amber-500/40" },
  rose: { from: "from-rose-400", via: "via-pink-500", to: "to-fuchsia-500", shadow: "shadow-rose-500/40" },
  indigo: { from: "from-indigo-500", via: "via-violet-500", to: "to-purple-500", shadow: "shadow-indigo-500/40" },
  cyan: { from: "from-cyan-400", via: "via-sky-500", to: "to-blue-500", shadow: "shadow-cyan-500/40" },
};

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

function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
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
  const dims = size === "lg" ? "h-20 w-20" : size === "md" ? "h-16 w-16" : "h-12 w-12";
  const iconSize = size === "lg" ? "h-10 w-10" : size === "md" ? "h-8 w-8" : "h-6 w-6";
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
      <span aria-hidden className="pointer-events-none absolute inset-x-1 top-1 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/50 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
      <Icon className={cn("relative text-white drop-shadow-md", iconSize)} strokeWidth={2.25} />
    </span>
  );
}

export default function ContactUs() {
  const { t } = useI18n();

  const infos: { icon: LucideIcon; title: string; body: string; href?: string; variant: GradientKey }[] = [
    { icon: MapPin, title: t("contact.address.title"), body: t("contact.address.body"), variant: "rose" },
    { icon: Phone, title: t("contact.phone.title"), body: "+965 6000 3759", href: "tel:+96560003759", variant: "emerald" },
    { icon: Mail, title: t("contact.email.title"), body: "info@curemed.com", href: "mailto:info@curemed.com", variant: "sky" },
    { icon: Clock, title: t("contact.hours.title"), body: `${t("contact.hours.weekdays")}\n${t("contact.hours.weekend")}`, variant: "amber" },
  ];

  return (
    <SiteLayout brand="curemed">
      <Seo
        title="Contact Curemed — Pharmacies & Customer Support in Kuwait"
        description="Get in touch with Curemed in Kuwait. Reach our team by phone, email or message for orders, partnerships and product enquiries."
        path="/contact"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: "Curemed",
          url: "https://curemedkw.lovable.app/contact",
          areaServed: "KW",
          address: { "@type": "PostalAddress", addressCountry: "KW" },
        }}
      />
      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-pink-500/10" />
          <div className="absolute -top-40 -left-20 h-[28rem] w-[28rem] rounded-full bg-sky-400/30 blur-3xl animate-blob-drift" />
          <div className="absolute -top-20 right-0 h-[24rem] w-[24rem] rounded-full bg-violet-400/25 blur-3xl animate-blob-drift animation-delay-200" />
          <div className="absolute bottom-0 left-1/3 h-[20rem] w-[20rem] rounded-full bg-pink-400/25 blur-3xl animate-blob-drift animation-delay-300" />
          <div
            className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
            style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "22px 22px" }}
          />
        </div>

        <div className="container max-w-5xl text-center">
          <div className="animate-fade-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand backdrop-blur-md shadow-sm">
              <MessageCircle className="h-3.5 w-3.5" />
              {t("contact.subtitle")}
            </span>
          </div>
          <h1 className="mt-6 text-4xl md:text-7xl font-bold tracking-tight animate-fade-in [animation-delay:120ms]">
            <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
              {t("contact.title")}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg md:text-xl text-muted-foreground leading-relaxed animate-fade-in [animation-delay:240ms]">
            {t("contact.subtitle")}
          </p>
        </div>

        <div className="mt-20 h-px w-full bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
      </section>

      {/* ===================== INFO CARDS ===================== */}
      <section className="container pb-4">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {infos.map((info, i) => (
            <Reveal key={info.title} delay={i * 100}>
              <InfoCard {...info} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== FORM ===================== */}
      <ContactSection brand="curemed" />

      {/* ===================== LOCATION ===================== */}
      <section className="relative pb-24">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent to-violet-500/[0.04]" />
        <div className="container">
          <Reveal className="max-w-2xl mx-auto text-center mb-12">
            <span className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
              <Sparkles className="h-3 w-3" /> {t("contact.location.title")}
            </span>
            <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-violet-500 to-sky-500 bg-clip-text text-transparent">
                {t("contact.location.title")}
              </span>
            </h2>
          </Reveal>

          <Reveal delay={150}>
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

          <div className="mt-6 text-center">
            <a
              href={MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              <MapPin className="h-4 w-4" /> Open in Google Maps
            </a>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}

function InfoCard({
  icon: Icon,
  title,
  body,
  href,
  variant,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
  variant: GradientKey;
}) {
  const content = (
    <div className="group relative h-full">
      <div
        className={cn(
          "absolute -inset-0.5 rounded-3xl opacity-0 blur transition-opacity duration-500 group-hover:opacity-70 bg-gradient-to-br",
          GRADIENTS[variant].from,
          GRADIENTS[variant].via,
          GRADIENTS[variant].to,
        )}
      />
      <div className="relative h-full overflow-hidden rounded-3xl border border-border/60 bg-card/85 p-6 backdrop-blur-md shadow-md transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl flex flex-col items-center text-center gap-4">
        <Icon3D icon={Icon} variant={variant} size="md" />
        <h3 className="font-bold text-base">{title}</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{body}</p>
      </div>
    </div>
  );
  return href ? (
    <a href={href} className="block h-full">
      {content}
    </a>
  ) : (
    content
  );
}