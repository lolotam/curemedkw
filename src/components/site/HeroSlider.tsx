import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { listSlidesForPage, type HeroPageKey, type HeroSlide } from "@/lib/heroSlides";

interface Props {
  pageKey: HeroPageKey;
  /** Fallback rendered when no slides are configured yet. */
  fallback?: React.ReactNode;
  intervalMs?: number;
}

export function HeroSlider({ pageKey, fallback, intervalMs = 5500 }: Props) {
  const { lang, dir } = useI18n();
  const [slides, setSlides] = React.useState<HeroSlide[] | null>(null);
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    listSlidesForPage(pageKey)
      .then((rows) => { if (!cancelled) setSlides(rows); })
      .catch(() => { if (!cancelled) setSlides([]); });
    return () => { cancelled = true; };
  }, [pageKey]);

  const count = slides?.length ?? 0;

  React.useEffect(() => {
    if (paused || count <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(t);
  }, [paused, count, intervalMs]);

  if (slides === null) {
    return <div className="bg-brand-soft w-full aspect-[16/9] max-h-[85vh] animate-pulse" />;
  }

  if (slides.length === 0) {
    return fallback ? <>{fallback}</> : null;
  }

  const next = () => setIndex((i) => (i + 1) % count);
  const prev = () => setIndex((i) => (i - 1 + count) % count);

  return (
    <>
    <section
      className="relative w-full aspect-[16/9] max-h-[85vh] overflow-hidden bg-brand-deep"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {slides.map((s, i) => {
        const title = lang === "ar" ? s.title_ar : s.title_en;
        const subtitle = lang === "ar" ? s.subtitle_ar : s.subtitle_en;
        const ctaLabel = lang === "ar" ? s.cta_label_ar : s.cta_label_en;
        const isActive = i === index;
        const op = (s.overlay_opacity ?? 80) / 100;
        return (
          <div
            key={s.id}
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${isActive ? "opacity-100 z-10" : "opacity-0 z-0"}`}
            aria-hidden={!isActive}
          >
            {s.media_type === "video" ? (
              <video
                src={s.media_url}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <img
                src={s.media_url}
                alt={title || "Hero slide"}
                className="absolute inset-0 w-full h-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
              />
            )}
            {op > 0 && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `linear-gradient(to right, hsl(var(--background) / ${op}), hsl(var(--background) / ${op * 0.5}), hsl(var(--background) / ${op * 0.125}))`,
                }}
              />
            )}
            <div className="relative z-10 container h-full flex items-center">
              <div className="max-w-2xl text-foreground">
                {title && (
                  <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight animate-fade-in-up">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-5 text-lg md:text-xl text-foreground/80 max-w-xl animate-fade-in-up">
                    {subtitle}
                  </p>
                )}
                {ctaLabel && s.cta_href && (
                  <div className="mt-8 animate-fade-in-up">
                    {s.cta_href.startsWith("/") ? (
                      <Button asChild size="lg" className="bg-brand hover:bg-brand/90 text-white">
                        <Link to={s.cta_href}>
                          {ctaLabel} <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" />
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="lg" className="bg-brand hover:bg-brand/90 text-white">
                        <a href={s.cta_href}>
                          {ctaLabel} <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" />
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {count > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Previous slide"
            className="absolute top-1/2 -translate-y-1/2 left-4 rtl:left-auto rtl:right-4 z-20 rounded-full bg-background/80 hover:bg-background border border-border shadow-md p-2.5 backdrop-blur"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <button
            onClick={next}
            aria-label="Next slide"
            className="absolute top-1/2 -translate-y-1/2 right-4 rtl:right-auto rtl:left-4 z-20 rounded-full bg-background/80 hover:bg-background border border-border shadow-md p-2.5 backdrop-blur"
          >
            <ChevronRight className="h-5 w-5 rtl:rotate-180" />
          </button>
        </>
      )}
    </section>
    {count > 1 && (
      <div className="w-full bg-background border-b border-border/60">
        <div className="container py-4 md:py-5 flex justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              className={`h-2 rounded-full transition-all ${i === index ? "w-8 bg-brand" : "w-2 bg-foreground/30 hover:bg-foreground/60"}`}
            />
          ))}
        </div>
      </div>
    )}
    </>
  );
}