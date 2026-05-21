import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, X, Maximize2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageZoomProps {
  src: string;
  alt: string;
  className?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const STEP = 0.5;

const noSave = {
  draggable: false as const,
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  style: {
    userSelect: "none" as const,
    WebkitUserSelect: "none" as const,
    WebkitUserDrag: "none",
    WebkitTouchCallout: "none" as const,
  } as React.CSSProperties,
};

/**
 * Product image with click-to-open zoom lightbox.
 * Includes basic anti-save protections (right-click, drag, selection disabled,
 * watermark overlay). Not bulletproof — anyone can screenshot, but it raises
 * the bar enough to deter casual reuse.
 */
export function ImageZoom({ src, alt, className }: ImageZoomProps) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => setScale((s) => Math.min(MAX_SCALE, +(s + STEP).toFixed(2))), []);
  const zoomOut = useCallback(
    () =>
      setScale((s) => {
        const next = Math.max(MIN_SCALE, +(s - STEP).toFixed(2));
        if (next === 1) setOffset({ x: 0, y: 0 });
        return next;
      }),
    [],
  );

  // Reset when dialog opens
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  // Keyboard shortcuts inside dialog
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, zoomIn, zoomOut, reset]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.x),
      y: dragRef.current.oy + (e.clientY - dragRef.current.y),
    });
  };
  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <>
      <div
        className={cn("relative h-full w-full cursor-zoom-in group", className)}
        onClick={() => setOpen(true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          src={src}
          alt={alt}
          width={800}
          height={800}
          loading="lazy"
          className="h-full w-full object-cover pointer-events-none"
          {...noSave}
        />
        {/* Affordance badge */}
        <div
          aria-hidden
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md backdrop-blur transition-transform group-hover:scale-110"
        >
          <Maximize2 className="h-4 w-4" />
        </div>
        {/* Anti-steal overlay */}
        <div aria-hidden className="absolute inset-0 pointer-events-none" />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[95vw] w-[95vw] h-[95vh] p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur"
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Toolbar */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full border border-border bg-background/90 px-2 py-1 shadow-lg">
            <Button variant="ghost" size="icon" onClick={zoomOut} aria-label="Zoom out" disabled={scale <= MIN_SCALE}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="min-w-[3rem] text-center text-xs font-medium tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="ghost" size="icon" onClick={zoomIn} aria-label="Zoom in" disabled={scale >= MAX_SCALE}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={reset} aria-label="Reset zoom">
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Image area */}
          <div
            className="relative flex h-full w-full items-center justify-center overflow-hidden select-none"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            style={{ cursor: scale > 1 ? (dragRef.current ? "grabbing" : "grab") : "zoom-in" }}
            onClick={(e) => {
              if (dragRef.current) return;
              if (scale === 1) zoomIn();
            }}
          >
            <img
              src={src}
              alt={alt}
              className="max-h-full max-w-full object-contain transition-transform duration-100 ease-out pointer-events-none"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                ...noSave.style,
              }}
              {...noSave}
            />

            {/* Watermark overlay */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden"
            >
              <div
                className="text-foreground/10 font-bold whitespace-nowrap select-none"
                style={{
                  fontSize: "clamp(2rem, 6vw, 5rem)",
                  transform: "rotate(-30deg)",
                  letterSpacing: "0.2em",
                }}
              >
                CUREMED · CUREMED · CUREMED
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
