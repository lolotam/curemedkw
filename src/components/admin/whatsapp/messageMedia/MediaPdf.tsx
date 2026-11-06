import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { useWhatsAppMediaBlob } from "@/hooks/useWhatsAppMedia";
import { useI18n } from "@/lib/i18n";
import { resolveMediaKind } from "@/lib/whatsappInboxView";
import { MediaDocumentChip, MediaFallback, MediaSkeleton } from "./MediaDocumentChip";
import { useAttachmentName, type OpenableMediaProps } from "./mediaShared";

/** Thumbnail width in CSS pixels (the frame is w-56), rendered at 2x for sharp high-DPI screens. */
const THUMB_PIXELS = 224 * 2;
/** Height cap so an extremely tall, narrow page cannot force a huge canvas allocation (the frame shows max-h-72). */
const THUMB_MAX_HEIGHT = 288 * 2;

/**
 * Renders the first page of a PDF to a PNG data URL. pdf.js and its worker are imported on first
 * use so the library stays out of the admin bundle until a PDF actually scrolls into view.
 */
async function renderFirstPage(blob: Blob, onTask: (task: PDFDocumentLoadingTask) => void): Promise<string> {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  onTask(task);
  const page = await (await task.promise).getPage(1);
  const natural = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(THUMB_PIXELS / natural.width, THUMB_MAX_HEIGHT / natural.height) });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
  return canvas.toDataURL("image/png");
}

/**
 * PDF attachment shown as a first-page thumbnail; a click opens it in the lightbox. A document
 * that turns out not to be a PDF, or one pdf.js cannot read (encrypted, damaged), falls back to
 * the download chip.
 */
export function MediaPdf({ message, onOpen, ...props }: OpenableMediaProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInViewOnce(ref);
  const media = useWhatsAppMediaBlob(message.id, visible);
  const url = useObjectUrl(media.data?.blob);
  const name = useAttachmentName(message, media.data?.fileName);
  const [thumb, setThumb] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const blob = media.data?.blob;
  const isPdf = resolveMediaKind(message, media.data?.mimeType) === "pdf";

  useEffect(() => {
    if (!blob || !isPdf) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    renderFirstPage(blob, started => { task = started; })
      .then(image => { if (!cancelled) setThumb(image); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => void task?.destroy());
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [blob, isPdf]);

  if (media.isError || failed) return <MediaFallback ref={ref} message={message} {...props} reasonKey="admin.whatsapp.pdfError" />;
  if (media.data && !isPdf) return <div ref={ref}><MediaDocumentChip message={message} {...props} /></div>;
  if (!thumb || !url) return <MediaSkeleton ref={ref} />;
  return (
    <div ref={ref}>
      <button type="button" onClick={() => onOpen({ kind: "pdf", src: url, message, fileName: name })}
        className="mb-0.5 block overflow-hidden rounded-md border border-black/10 dark:border-white/10" aria-label={t("admin.whatsapp.viewPdf")}>
        <img src={thumb} alt={name} className="max-h-72 w-56 max-w-full bg-white object-contain" />
      </button>
      <p className="truncate text-xs opacity-70" dir="auto">{name}</p>
    </div>
  );
}
