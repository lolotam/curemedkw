import { forwardRef } from "react";
import { Download, FileText } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAttachmentName, type MediaProps } from "./mediaShared";

/** Pulsing frame shown until an attachment scrolls into view and finishes loading. */
export const MediaSkeleton = forwardRef<HTMLDivElement, { className?: string }>(function MediaSkeleton({ className = "h-40 w-56" }, ref) {
  return (
    <div ref={ref} className={`mb-0.5 flex max-w-full animate-pulse items-center justify-center rounded-md bg-black/10 dark:bg-white/10 ${className}`}>
      <FileText className="size-5 opacity-40" />
    </div>
  );
});

/** Download chip for attachments that are not previewed inline; nothing is fetched until it is clicked. */
export function MediaDocumentChip({ message, onDownload, downloadPending }: MediaProps) {
  const { t } = useI18n();
  const name = useAttachmentName(message);
  return (
    <button type="button" disabled={downloadPending} onClick={() => onDownload(message)} aria-label={`${t("admin.whatsapp.downloadFile")}: ${name}`}
      className="mb-0.5 flex w-full items-center gap-1.5 rounded-md bg-black/5 px-2 py-1.5 text-start text-sm transition-colors hover:bg-black/10 disabled:opacity-60 dark:bg-white/10 dark:hover:bg-white/15">
      <FileText className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate" dir="auto">{name}</span>
      <Download className="size-3.5 shrink-0 opacity-70" />
    </button>
  );
}

/**
 * A preview that could not load falls back to the download chip plus a short reason, so a broken
 * player never takes away the only way to get the file.
 */
export const MediaFallback = forwardRef<HTMLDivElement, MediaProps & { reasonKey: string }>(function MediaFallback({ reasonKey, ...props }, ref) {
  const { t } = useI18n();
  return (
    <div ref={ref}>
      <MediaDocumentChip {...props} />
      <p className="mt-1 text-xs opacity-60">{t(reasonKey)}</p>
    </div>
  );
});
