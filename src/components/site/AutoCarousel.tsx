import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface Props {
  children: React.ReactNode[];
  itemBasis?: string;
  intervalMs?: number;
}

export function AutoCarousel({ children, itemBasis = "basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4", intervalMs = 4500 }: Props) {
  const { dir } = useI18n();
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [paused, setPaused] = React.useState(false);

  const scroll = React.useCallback((direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const step = el.clientWidth * 0.8 * (dir === "rtl" ? -direction : direction);
    el.scrollBy({ left: step, behavior: "smooth" });
  }, [dir]);

  React.useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      const el = trackRef.current;
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const atEnd = dir === "rtl"
        ? Math.abs(el.scrollLeft) >= maxScroll - 4
        : el.scrollLeft >= maxScroll - 4;
      if (atEnd) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        scroll(1);
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, [paused, intervalMs, scroll, dir]);

  return (
    <div className="relative group" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div ref={trackRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children.map((c, i) => (
          <div key={i} className={`shrink-0 snap-start ${itemBasis} px-1`}>{c}</div>
        ))}
      </div>
      <button onClick={() => scroll(-1)} className="absolute top-1/2 -translate-y-1/2 left-2 rtl:left-auto rtl:right-2 rounded-full bg-background/90 border border-border shadow-md p-2 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Previous">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
      </button>
      <button onClick={() => scroll(1)} className="absolute top-1/2 -translate-y-1/2 right-2 rtl:right-auto rtl:left-2 rounded-full bg-background/90 border border-border shadow-md p-2 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Next">
        <ChevronRight className="h-4 w-4 rtl:rotate-180" />
      </button>
    </div>
  );
}