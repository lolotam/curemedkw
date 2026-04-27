import * as React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Languages } from "lucide-react";
import type { HeroSlide } from "@/lib/heroSlides";
import { SlidePreview } from "@/components/site/SlidePreview";

interface Props {
  slide: HeroSlide;
}

/**
 * Mini live preview of a slide as configured in the editor.
 * 16:9 aspect, scales text down so the relative composition matches the live hero.
 */
export function SlideLivePreview({ slide }: Props) {
  const [lang, setLang] = React.useState<"en" | "ar">("en");
  const [playKey, setPlayKey] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.35);

  // Preview is roughly 1/3 of a 1920px-wide hero, so scale text accordingly.
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      // Live hero renders at viewport width; assume reference 1440px desktop.
      setScale(Math.max(0.18, Math.min(1, w / 1440)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Replay animations whenever editable style/content changes.
  React.useEffect(() => {
    setPlayKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slide.title_en, slide.title_ar, slide.subtitle_en, slide.subtitle_ar,
    slide.cta_label_en, slide.cta_label_ar, slide.h1_animation, slide.h2_animation,
    slide.cta_animation, slide.font_family_en, slide.font_family_ar,
    slide.h1_font_size, slide.h2_font_size, slide.cta_font_size,
    slide.text_position_x, slide.text_position_y, slide.text_align, lang,
  ]);

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-background/60">
        <span className="text-xs font-semibold text-muted-foreground">Live preview</span>
        <div className="flex items-center gap-1">
          <div className="inline-flex rounded-md border border-border overflow-hidden text-[11px]">
            {(["en", "ar"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`px-2 py-0.5 ${lang === l ? "bg-brand text-white" : "bg-background hover:bg-muted"}`}
              >
                <span className="inline-flex items-center gap-1"><Languages className="h-3 w-3" />{l.toUpperCase()}</span>
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setPlayKey((k) => k + 1)}
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Replay
          </Button>
        </div>
      </div>
      <div ref={wrapRef} className="relative w-full aspect-[16/9] bg-brand-deep">
        <SlidePreview slide={slide} lang={lang} playKey={playKey} preview scale={scale} />
      </div>
    </div>
  );
}