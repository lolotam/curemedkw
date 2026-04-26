import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadImage } from "@/lib/downloadImage";

type Props = {
  src: string | null;
  alt?: string;
  filename?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImagePreviewDialog({ src, alt, filename, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl !grid-cols-1 grid-rows-[1fr_auto] p-0 gap-0 bg-background overflow-hidden">
        <DialogTitle className="sr-only">Image preview</DialogTitle>
        <div className="flex items-center justify-center bg-muted/30 p-4 min-h-[40vh] max-h-[85vh] overflow-auto">
          {src ? (
            <img src={src} alt={alt || ""} className="max-h-[80vh] max-w-full object-contain" />
          ) : null}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-background">
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
      </DialogContent>
    </Dialog>
  );
}