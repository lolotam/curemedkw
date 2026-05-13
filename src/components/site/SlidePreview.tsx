import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HeroSlide } from "@/lib/heroSlides";
import { fontCss } from "@/lib/slideFonts";
import { SlideAnimatedText } from "./SlideAnimatedText";

export interface SlidePreviewProps {
  slide: Omit<HeroSlide, "created_at" | "updated_at"> & Partial<Pick<HeroSlide, "created_at" | "updated_at">>;
  lang: "en" | "ar";
  /** Bumped to replay all text animations (slide change, manual replay button). */
  playKey: number;
  /** When true, navigation links inside CTA are disabled (preview mode). */
  preview?: boolean;
  /** Optional scaling factor for text — used in admin mini preview. 1 = full size. */
  scale?: number;
  className?: string;
}

/**
 * Renders a single hero slide. Used by both the live HeroSlider and the
 * admin live-preview panel so what the admin sees is exactly what ships.
 */
export function SlidePreview({
  slide: s,
  lang,
  playKey,
  preview = false,
  scale = 1,
  className = "",
}: SlidePreviewProps) {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const title = lang === "ar" ? s.title_ar : s.title_en;
  const subtitle = lang === "ar" ? s.subtitle_ar : s.subtitle_en;
  const ctaLabel = lang === "ar" ? s.cta_label_ar : s.cta_label_en;

  const op = (s.overlay_opacity ?? 80) / 100;
  const fontFamily = fontCss(lang === "ar" ? s.font_family_ar : s.font_family_en, lang);

  const x = clampPct(s.text_position_x ?? 10);
  const y = clampPct(s.text_position_y ?? 50);
  const align = (s.text_align ?? "left") as "left" | "center" | "right";

  // Center the block on its anchor point so 50/50 truly centers.
  const translate = `translate(${-x}%, ${-y}%)`;

  const h1Size = (s.h1_font_size ?? 60) * scale;
  const h2Size = (s.h2_font_size ?? 20) * scale;
  const ctaSize = (s.cta_font_size ?? 16) * scale;

  // Render CTA when label is present; if href missing, treat as preview/no-nav.
  const ctaHref = s.cta_href ?? "";
  const ctaIsInternal = ctaHref.startsWith("/");
  const ctaIsExternal = /^https?:\/\//.test(ctaHref);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-brand-deep ${className}`} dir={dir}>
      {s.media_url ? (
        s.media_type === "video" ? (
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
            width={1920}
            height={800}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-foreground/40 text-xs">
          No media
        </div>
      )}

      {op > 0 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(to right, hsl(var(--background) / ${op}), hsl(var(--background) / ${op * 0.5}), hsl(var(--background) / ${op * 0.125}))`,
          }}
        />
      )}

      <div
        className="absolute z-10 max-w-[80%] text-foreground"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: translate,
          textAlign: align,
          fontFamily,
        }}
      >
        {title && (
          <SlideAnimatedText
            as="h1"
            text={title}
            animation={s.h1_animation}
            playKey={playKey}
            className="font-bold tracking-tight leading-[1.05]"
            style={{ fontSize: `${h1Size}px`, fontFamily }}
          />
        )}
        {subtitle && (
          <SlideAnimatedText
            as="p"
            text={subtitle}
            animation={s.h2_animation}
            playKey={playKey + 1}
            className="mt-4 text-foreground/80 max-w-xl"
            style={{ fontSize: `${h2Size}px`, fontFamily }}
          />
        )}
        {ctaLabel && (
          <div
            key={`cta-${playKey}`}
            className={ctaLabel ? `${animationToWrap(s.cta_animation)} mt-7 inline-flex` : "hidden"}
          >
            {preview || (!ctaIsInternal && !ctaIsExternal) ? (
              <Button
                size="lg"
                className="bg-brand hover:bg-brand/90 text-white"
                style={{ fontSize: `${ctaSize}px`, fontFamily }}
                type="button"
                onClick={(e) => e.preventDefault()}
              >
                {ctaLabel} <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" />
              </Button>
            ) : ctaIsInternal ? (
              <Button asChild size="lg" className="bg-brand hover:bg-brand/90 text-white" style={{ fontSize: `${ctaSize}px`, fontFamily }}>
                <Link to={ctaHref}>
                  {ctaLabel} <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="bg-brand hover:bg-brand/90 text-white" style={{ fontSize: `${ctaSize}px`, fontFamily }}>
                <a href={ctaHref}>
                  {ctaLabel} <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" />
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function clampPct(v: number) {
  return Math.min(100, Math.max(0, v));
}

/** CTA wrapper uses the animation class so the button appears with motion. */
function animationToWrap(key: string | null | undefined): string {
  if (!key || key === "none" || key === "typewriter") return "";
  return `slide-anim-${key}`;
}