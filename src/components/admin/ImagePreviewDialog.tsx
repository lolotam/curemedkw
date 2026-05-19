import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ZoomIn, ZoomOut, RotateCcw, Copy, Check, Wand2, Loader2 } from "lucide-react";
import { downloadImage } from "@/lib/downloadImage";
import { isUpscaled } from "@/lib/utils";
import { convertAndUploadImage } from "@/lib/imageConvert";
import { toast } from "sonner";

type Props = {
  brand?: string;
  slug?: string;
  onConverted?: (oldUrl: string, newUrl: string) => void;
  src: string | null;
  alt?: string;
  filename?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImagePreviewDialog({ src, alt, filename, open, onOpenChange }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsDragging(false);
      setCopied(false);
    }
  }, [open]);

  const zoomIn = () => setZoom((z) => Math.min(+(z + 0.25).toFixed(2), 5));

  const zoomOut = () =>
    setZoom((z) => {
      const n = Math.max(+(z - 0.25).toFixed(2), 0.5);
      if (n <= 1) setPan({ x: 0, y: 0 });
      return n;
    });

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleCopy = () => {
    if (!src) return;
    navigator.clipboard.writeText(src).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    setZoom((z) => {
      const n = Math.min(Math.max(+(z + delta).toFixed(2), 0.5), 5);
      if (n <= 1) setPan({ x: 0, y: 0 });
      return n;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl !grid-cols-1 grid-rows-[1fr_auto] p-0 gap-0 bg-background overflow-hidden">
        <DialogTitle className="sr-only">Image preview</DialogTitle>
        <div
          className="relative flex items-center justify-center bg-muted/30 overflow-hidden"
          style={{
            height: "80vh",
            cursor: isDragging ? "grabbing" : zoom > 1 ? "grab" : "default",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {src ? (
            <img
              src={src}
              alt={alt || ""}
              draggable={false}
              style={{
                maxHeight: "100%",
                maxWidth: "100%",
                objectFit: "contain",
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: isDragging ? "none" : "transform 0.15s ease",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          ) : null}
          {src && isUpscaled(src) && (
            <Badge
              variant="destructive"
              className="absolute top-3 right-3 z-10 pointer-events-none text-xs"
            >
              Upscaled
            </Badge>
          )}
        </div>
        <div className="flex flex-col gap-2 px-4 py-3 border-t border-border bg-background">
          {/* Row 1: zoom controls + download + close */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 mr-auto">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={zoomOut}
                disabled={zoom <= 0.5}
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs w-10 text-center tabular-nums select-none">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={zoomIn}
                disabled={zoom >= 5}
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              {zoom !== 1 && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={resetZoom}
                  title="Reset zoom"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!src}
              onClick={() => src && downloadImage(src, filename)}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" /> Download
            </Button>
            <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
          {/* Row 2: URL display + copy */}
          {src && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground shrink-0">URL</span>
              <input
                readOnly
                value={src}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 min-w-0 bg-muted/40 border border-border rounded px-2 py-1 text-[10px] font-mono text-muted-foreground truncate focus:outline-none focus:ring-1 focus:ring-ring cursor-text"
                title={src}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-1.5 shrink-0"
                title="Copy URL"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
