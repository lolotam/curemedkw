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

/** Phone-width fit-viewport hero: sized by the image's own ratio, full viewport height from `md` up. */
const MOBILE_MEDIA_FIT_CLASS =
  "aspect-[var(--hero-aspect)] md:aspect-auto md:h-[calc(100dvh-4rem)] md:min-h-[480px]";

/** True when the slide shows a plain image with no overlay text (in the active language) that a short hero could clip. */
function isMediaOnlySlide(s: HeroSlide, lang: string): boolean {
  const text = lang === "ar"
    ? [s.title_ar, s.subtitle_ar, s.cta_label_ar]
    : [s.title_en, s.subtitle_en, s.cta_label_en];
  return s.media_type === "image" && text.every((t) => !t?.trim());
}

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

  // A 16:9 image letterboxed inside a full-height phone viewport leaves large empty bands above and
  // below it, so on narrow screens an image-only hero takes the image's height instead.
  const fitMediaOnMobile = !isAspectRatioMode && !!slides && slides.every((s) => isMediaOnlySlide(s, lang));

  React.useEffect(() => {
    if (!slides || (!isAspectRatioMode && !fitMediaOnMobile)) return;
    let cancelled = false;
    const imageSlides = slides.filter((s) => s.media_type === "image" && !!s.media_url);
    // Fit-viewport mode only needs the first image's ratio, which the active slide is already loading;
    // measuring every slide would download the whole carousel up front.
    const measured = isAspectRatioMode ? imageSlides : imageSlides.slice(0, 1);
    if (measured.length === 0) return;
    Promise.all(
      measured.map(
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
  }, [slides, isAspectRatioMode, fitMediaOnMobile]);

  const count = slides?.length ?? 0;
  const aspectVar = { "--hero-aspect": `${aspect}` } as React.CSSProperties;

  React.useEffect(() => {
    if (paused || count <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), Math.max(1000, effectiveInterval));
    return () => clearInterval(t);
  }, [paused, count, effectiveInterval]);

  if (slides === null) {
    return isAspectRatioMode ? (
      <div className="w-full animate-pulse bg-brand-soft" style={{ aspectRatio: `${aspect}` }} />
    ) : (
      <div className={`${MOBILE_MEDIA_FIT_CLASS} w-full animate-pulse bg-brand-soft`} style={aspectVar} />
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
  let sectionSizeClass = "h-[calc(100dvh-4rem)] min-h-[480px]";
  let sectionStyle: React.CSSProperties | undefined;
  if (isAspectRatioMode) {
    sectionSizeClass = "";
    sectionStyle = { aspectRatio: `${aspect}` };
  } else if (fitMediaOnMobile) {
    sectionSizeClass = MOBILE_MEDIA_FIT_CLASS;
    sectionStyle = aspectVar;
  }
  const section = (
    <section
      className={`relative ${sectionSizeClass} w-full overflow-hidden bg-brand-deep`}
      style={sectionStyle}
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
        <div className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background/80 to-transparent${fitMediaOnMobile ? " hidden md:block" : ""}`}>
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
      {(isAspectRatioMode || fitMediaOnMobile) && count > 1 && (
        <div className={`w-full bg-background border-b border-border/60${fitMediaOnMobile ? " md:hidden" : ""}`}>
          <div className="container py-4 md:py-5 flex justify-center gap-2">
            {dots}
          </div>
        </div>
      )}
    </>
  );
}
