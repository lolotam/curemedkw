import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageZoomProps {
  src: string;
  alt: string;
  zoom?: number;
  lensSize?: number;
  className?: string;
}

/**
 * Hover-magnifier image viewer.
 * Shows a circular lens that follows the cursor and displays a zoomed
 * portion of the image. Falls back to the plain image on touch devices.
 */
export function ImageZoom({
  src,
  alt,
  zoom = 2.5,
  lensSize = 180,
  className,
}: ImageZoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      setPos(null);
      return;
    }
    setPos({ x, y });
  };

  const rect = containerRef.current?.getBoundingClientRect();
  const bgX = pos && rect ? (pos.x / rect.width) * 100 : 50;
  const bgY = pos && rect ? (pos.y / rect.height) * 100 : 50;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMove}
      onMouseLeave={() => setPos(null)}
      className={cn("relative h-full w-full cursor-zoom-in overflow-hidden", className)}
    >
      <img
        src={src}
        alt={alt}
        width={800}
        height={800}
        className="h-full w-full object-cover select-none"
        loading="lazy"
        draggable={false}
      />

      {/* Affordance badge */}
      <div
        aria-hidden
        className={cn(
          "absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md backdrop-blur transition-opacity",
          pos ? "opacity-0" : "opacity-100",
        )}
      >
        <Search className="h-4 w-4" />
      </div>

      {/* Magnifier lens */}
      {pos && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full border-2 border-background shadow-xl ring-1 ring-border"
          style={{
            width: lensSize,
            height: lensSize,
            top: pos.y - lensSize / 2,
            left: pos.x - lensSize / 2,
            backgroundImage: `url(${src})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${zoom * 100}%`,
            backgroundPosition: `${bgX}% ${bgY}%`,
          }}
        />
      )}
    </div>
  );
}
