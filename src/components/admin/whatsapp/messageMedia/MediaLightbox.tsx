import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import type { WhatsAppMessage } from "@/lib/whatsappInbox";
import type { LightboxEntry } from "./mediaShared";

const TITLE_KEYS: Record<LightboxEntry["kind"], string> = {
  image: "admin.whatsapp.viewImage", video: "admin.whatsapp.viewVideo", pdf: "admin.whatsapp.viewPdf",
};

interface MediaLightboxProps {
  entry: LightboxEntry | null;
  onClose: () => void;
  onDownload: (message: WhatsAppMessage) => void;
  downloadPending: boolean;
}

/** Full-size viewer for images, videos and PDFs, with download and close actions. */
export function MediaLightbox({ entry, onClose, onDownload, downloadPending }: MediaLightboxProps) {
  const { t } = useI18n();
  return (
    <Dialog open={entry !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-4xl border-0 bg-black/90 p-2">
        <DialogHeader className="sr-only">
          <DialogTitle>{entry ? t(TITLE_KEYS[entry.kind]) : ""}</DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="flex flex-col items-center gap-3">
            {entry.kind === "image" && <img src={entry.src} alt={entry.fileName} className="max-h-[75vh] w-auto max-w-full rounded-md object-contain" />}
            {entry.kind === "video" && <video src={entry.src} controls autoPlay playsInline className="max-h-[75vh] w-full max-w-full rounded-md bg-black" />}
            {entry.kind === "pdf" && <iframe src={entry.src} title={entry.fileName} className="h-[75vh] w-full rounded-md bg-white" />}
            <div className="flex gap-2 pb-1">
              <Button variant="secondary" disabled={downloadPending} onClick={() => onDownload(entry.message)}>
                <Download className="me-2 size-4" />{t("admin.whatsapp.downloadFile")}
              </Button>
              <Button variant="outline" onClick={onClose}>{t("admin.whatsapp.close")}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
