import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { Quote, MapPin } from "lucide-react";
import { useTestimonials } from "@/lib/db";

export function Testimonials() {
  const { t, lang } = useI18n();
  const { data: items = [] } = useTestimonials();
  if (items.length === 0) return null;
  // Duplicate the list so the -50% translate loops seamlessly
  const loop = [...items, ...items];
  return (
    <section className="container py-16 md:py-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-bold">{t("testimonials.title")}</h2>
      </div>
      <div
        className="relative overflow-hidden group"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
        }}
      >
        <div
          className="flex gap-5 w-max marquee group-hover:[animation-play-state:paused]"
          style={{ animationDuration: "80s" }}
          dir="ltr"
        >
          {loop.map((it, idx) => {
            const name = lang === "ar" ? it.nameAr : it.nameEn;
            const role = lang === "ar" ? it.roleAr : it.roleEn;
            const quote = lang === "ar" ? it.quoteAr : it.quoteEn;
            const initial = (name || "?").charAt(0);
            const tint =
              it.gender === "f"
                ? "bg-pink-500/15 text-pink-600"
                : "bg-blue-500/15 text-blue-600";
            return (
              <Card
                key={`${it.id}-${idx}`}
                className="p-6 bg-brand-soft border-brand/10 w-[320px] md:w-[360px] shrink-0"
              >
                <Quote className="h-7 w-7 text-brand opacity-30 mb-3" />
                <p
                  className="text-sm leading-relaxed text-foreground line-clamp-5"
                  dir={lang === "ar" ? "rtl" : "ltr"}
                >
                  "{quote}"
                </p>
                <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${tint}`}
                  >
                    {initial}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{name}</p>
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {role}
                      {it.location ? ` · ${it.location}` : ""}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}