import { useRef } from "react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { useWhatsAppMediaBlob } from "@/hooks/useWhatsAppMedia";
import { useI18n } from "@/lib/i18n";
import { MediaFallback, MediaSkeleton } from "./MediaDocumentChip";
import { useAttachmentName, type OpenableMediaProps } from "./mediaShared";

/** Inline image thumbnail, fetched when it scrolls into view; a click opens it in the lightbox. */
export function MediaImage({ message, onOpen, ...props }: OpenableMediaProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInViewOnce(ref);
  const media = useWhatsAppMediaBlob(message.id, visible);
  const url = useObjectUrl(media.data?.blob);
  const name = useAttachmentName(message, media.data?.fileName);

  if (media.isError) return <MediaFallback ref={ref} message={message} {...props} reasonKey="admin.whatsapp.mediaFailed" />;
  if (!url) return <MediaSkeleton ref={ref} />;
  return (
    <div ref={ref}>
      <button type="button" onClick={() => onOpen({ kind: "image", src: url, message, fileName: name })}
        className="mb-0.5 block overflow-hidden rounded-md" aria-label={t("admin.whatsapp.viewImage")}>
        <img src={url} alt={name} className="max-h-72 w-auto max-w-full rounded-md object-contain" />
      </button>
    </div>
  );
}
