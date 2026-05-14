import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  /** Tailwind aspect class. Default aspect-square. */
  aspectClassName?: string;
};

/**
 * Draggable before/after slider.
 * - Before image is the base (full width).
 * - After image is overlaid and revealed by clip-path inset from the right.
 * - Drag the vertical handle horizontally to compare.
 */
export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Before",
  afterLabel = "After",
  className,
  aspectClassName = "aspect-square",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [pos, setPos] = useState(50); // percentage 0-100, position of divider from left

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPos(pct);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      updateFromClientX(e.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [updateFromClientX]);

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    updateFromClientX(e.clientX);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 2));
    else if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 2));
    else if (e.key === "Home") setPos(0);
    else if (e.key === "End") setPos(100);
  };

  return (
    <div
      ref={containerRef}
      dir="ltr"
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-border bg-muted select-none touch-none",
        aspectClassName,
        className,
      )}
      onPointerDown={onPointerDown}
    >
      {/* Before image (base) */}
      <img
        src={beforeSrc}
        alt={beforeLabel}
        className="absolute inset-0 h-full w-full object-contain pointer-events-none"
        draggable={false}
      />
      {/* After image (clipped from the right) */}
      <img
        src={afterSrc}
        alt={afterLabel}
        className="absolute inset-0 h-full w-full object-contain pointer-events-none"
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />

      {/* Labels */}
      <span className="absolute top-2 left-2 z-10 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground backdrop-blur-sm">
        {beforeLabel}
      </span>
      <span className="absolute top-2 right-2 z-10 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground backdrop-blur-sm">
        {afterLabel}
      </span>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-background shadow-[0_0_0_1px_hsl(var(--border))] pointer-events-none"
        style={{ left: `calc(${pos}% - 1px)` }}
      />

      {/* Handle */}
      <button
        type="button"
        aria-label="Drag to compare"
        onKeyDown={onKey}
        className="absolute top-1/2 z-20 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border border-border bg-background shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
        style={{ left: `${pos}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          draggingRef.current = true;
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
          <polyline points="15 18 9 12 15 6" />
          <polyline points="9 6 15 12 9 18" transform="translate(8,0)" />
        </svg>
      </button>
    </div>
  );
}
