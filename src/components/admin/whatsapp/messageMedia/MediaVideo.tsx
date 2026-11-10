import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { useWhatsAppMediaBlob } from "@/hooks/useWhatsAppMedia";
import { useI18n } from "@/lib/i18n";
import { isGifPlayback, toAspectRatio } from "@/lib/whatsappInboxView";
import { MediaFallback, MediaSkeleton } from "./MediaDocumentChip";
import { useAttachmentName, type OpenableMediaProps } from "./mediaShared";

/**
 * Video card with a play badge. Video dimensions are not stored, so the frame starts at 4:3 and
 * takes the real aspect ratio once the metadata loads; a click opens the full player.
 */
export function MediaVideo({ message, onOpen, ...props }: OpenableMediaProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInViewOnce(ref);
  const media = useWhatsAppMediaBlob(message.id, visible);
  const url = useObjectUrl(media.data?.blob);
  const name = useAttachmentName(message, media.data?.fileName);
  const [aspect, setAspect] = useState("4 / 3");
  const gif = isGifPlayback(message);

  if (media.isError) return <MediaFallback ref={ref} message={message} {...props} reasonKey="admin.whatsapp.mediaFailed" />;
  if (!url) return <MediaSkeleton ref={ref} className="aspect-[4/3] w-56" />;
  return (
    <div ref={ref} className="mb-0.5 w-56 max-w-full">
      <button type="button" onClick={() => onOpen({ kind: "video", src: url, message, fileName: name })}
        className="relative block w-full overflow-hidden rounded-md bg-black" style={{ aspectRatio: aspect }} aria-label={t("admin.whatsapp.viewVideo")}>
        <video src={url} preload="metadata" muted playsInline autoPlay={gif && visible} loop={gif} className="h-full w-full object-contain"
          onLoadedMetadata={event => setAspect(toAspectRatio(event.currentTarget.videoWidth, event.currentTarget.videoHeight) ?? "4 / 3")} />
        {!gif && <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-white/90 shadow">
            <Play className="size-5 fill-black text-black rtl:-scale-x-100" />
          </span>
        </span>}
      </button>
    </div>
  );
}
