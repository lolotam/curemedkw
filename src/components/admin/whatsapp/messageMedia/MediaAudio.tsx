import { useRef } from "react";
import { Download } from "lucide-react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { useWhatsAppMediaBlob } from "@/hooks/useWhatsAppMedia";
import { useI18n } from "@/lib/i18n";
import { MediaFallback, MediaSkeleton } from "./MediaDocumentChip";
import { useAttachmentName, type MediaProps } from "./mediaShared";

/**
 * Voice note or audio file played inline with the native controls. Audio has no lightbox, so the
 * download button sits next to the player.
 */
export function MediaAudio({ message, onDownload, downloadPending }: MediaProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInViewOnce(ref);
  const media = useWhatsAppMediaBlob(message.id, visible);
  const url = useObjectUrl(media.data?.blob);
  const name = useAttachmentName(message);

  if (media.isError) {
    return <MediaFallback ref={ref} message={message} onDownload={onDownload} downloadPending={downloadPending} reasonKey="admin.whatsapp.mediaFailed" />;
  }
  if (!url) return <MediaSkeleton ref={ref} className="h-14 w-64" />;
  return (
    <div ref={ref} className="mb-0.5 w-64 max-w-full rounded-md bg-black/5 p-2 dark:bg-white/10">
      <div className="mb-1 flex items-center gap-1">
        <p className="min-w-0 flex-1 truncate text-xs opacity-70" dir="auto">{name}</p>
        <button type="button" disabled={downloadPending} onClick={() => onDownload(message)} aria-label={t("admin.whatsapp.downloadFile")}
          title={t("admin.whatsapp.downloadFile")} className="shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40">
          <Download className="size-3.5" />
        </button>
      </div>
      <audio controls preload="metadata" src={url} className="w-full" />
    </div>
  );
}
