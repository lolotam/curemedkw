import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { listSlidesForPage, type HeroPageKey, type HeroSlide } from "@/lib/heroSlides";
import { useSiteSetting } from "@/lib/db";
import { SlidePreview } from "./SlidePreview";

interface Props {
  pageKey: HeroPageKey;
  /** Fallback rendered when no slides are configured yet. */
  fallback?: React.ReactNode;
  /** Optional override; otherwise per-page setting (or 5500ms default) is used. */
  intervalMs?: number;
}

type IntervalsMap = Record<string, number>;
type HeroLayoutMode = "fit_viewport" | "aspect_ratio";

export function HeroSlider({ pageKey, fallback, intervalMs }: Props) {
  const { lang } = useI18n();
  const [slides, setSlides] = React.useState<HeroSlide[] | null>(null);
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [aspect, setAspect] = React.useState<number>(16 / 9);
  const { data: intervals } = useSiteSetting<IntervalsMap>("hero_intervals", {});
  const { data: layoutMode = "fit_viewport" } = useSiteSetting<HeroLayoutMode>("hero_layout_mode", "fit_viewport");
  const effectiveInterval = intervalMs ?? intervals?.[pageKey] ?? 5500;
  const isAspectRatioMode = layoutMode === "aspect_ratio";

  React.useEffect(() => {
    let cancelled = false;
    listSlidesForPage(pageKey)
      .then((rows) => { if (!cancelled) setSlides(rows); })
      .catch(() => { if (!cancelled) setSlides([]); });
    return () => { cancelled = true; };
  }, [pageKey]);

  React.useEffect(() => {
    if (!isAspectRatioMode || !slides || slides.length === 0) return;
    let cancelled = false;
    const imageSlides = slides.filter((s) => s.media_type === "image" && !!s.media_url);
    if (imageSlides.length === 0) return;
    Promise.all(
      imageSlides.map(
        (s) =>
          new Promise<number>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight));
            img.onerror = () => resolve(16 / 9);
            img.src = s.media_url;
          })
      )
    ).then((ratios) => {
      if (cancelled || ratios.length === 0) return;
      setAspect(Math.max(Math.min(...ratios), 4 / 5));
    });
    return () => { cancelled = true; };
  }, [slides, isAspectRatioMode]);

  const count = slides?.length ?? 0;

  React.useEffect(() => {
    if (paused || count <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), Math.max(1000, effectiveInterval));
    return () => clearInterval(t);
  }, [paused, count, effectiveInterval]);

  if (slides === null) {
    return isAspectRatioMode ? (
      <div className="w-full animate-pulse bg-brand-soft" style={{ aspectRatio: `${aspect}` }} />
    ) : (
      <div className="h-[calc(100dvh-4rem)] min-h-[480px] w-full animate-pulse bg-brand-soft" />
    );
  }

  if (slides.length === 0) {
    return fallback ? <>{fallback}</> : null;
  }

  const next = () => setIndex((i) => (i + 1) % count);
  const prev = () => setIndex((i) => (i - 1 + count) % count);
  const dots = slides.map((_, i) => (
    <button
      key={i}
      onClick={() => setIndex(i)}
      aria-label={`Go to slide ${i + 1}`}
      aria-current={i === index ? "true" : undefined}
      className={`h-2 rounded-full transition-all ${i === index ? "w-8 bg-brand" : "w-2 bg-foreground/30 hover:bg-foreground/60"}`}
    />
  ));
  const section = (
    <section
      className={isAspectRatioMode
        ? "relative w-full overflow-hidden bg-brand-deep"
        : "relative h-[calc(100dvh-4rem)] min-h-[480px] w-full overflow-hidden bg-brand-deep"}
      style={isAspectRatioMode ? { aspectRatio: `${aspect}` } : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {slides.map((s, i) => {
        const isActive = i === index;
        return (
          <div
            key={s.id}
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${isActive ? "opacity-100 z-10" : "opacity-0 z-0"}`}
            aria-hidden={!isActive}
          >
            <SlidePreview
              slide={s}
              lang={lang as "en" | "ar"}
              playKey={isActive ? index : -1}
              mediaFit={isAspectRatioMode ? "cover" : "contain"}
            />
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
      {!isAspectRatioMode && count > 1 && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background/80 to-transparent">
          <div className="container flex justify-center gap-2 pb-4 pt-8 md:pb-5">
            {dots}
          </div>
        </div>
      )}
    </section>
  );

  return (
    <>
      {section}
      {isAspectRatioMode && count > 1 && (
        <div className="w-full bg-background border-b border-border/60">
          <div className="container py-4 md:py-5 flex justify-center gap-2">
            {dots}
          </div>
        </div>
      )}
    </>
  );
}
