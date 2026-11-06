import type { ReactNode } from "react";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { WhatsAppMessage } from "@/lib/whatsappInbox";
import { resolveMediaKind, type MediaKind } from "@/lib/whatsappInboxView";
import { MediaAudio } from "./messageMedia/MediaAudio";
import { MediaDocumentChip } from "./messageMedia/MediaDocumentChip";
import type { OpenableMediaProps } from "./messageMedia/mediaShared";
import { MediaImage } from "./messageMedia/MediaImage";
import { MediaPdf } from "./messageMedia/MediaPdf";
import { MediaVideo } from "./messageMedia/MediaVideo";
import { StatusTicks } from "./StatusTicks";

const MEDIA_VIEWS: Record<MediaKind, (props: OpenableMediaProps) => ReactNode> = {
  image: MediaImage, video: MediaVideo, audio: MediaAudio, pdf: MediaPdf, document: MediaDocumentChip,
};

interface MessageBubbleProps extends Omit<OpenableMediaProps, "message"> {
  message: WhatsAppMessage;
  timeFormatter: Intl.DateTimeFormat;
}

/**
 * WhatsApp Web style message bubble: the attachment view picked from the message type, the text
 * with clickable links, and the time with delivery ticks on outbound messages.
 */
export function MessageBubble({ message, timeFormatter, ...mediaProps }: MessageBubbleProps) {
  const { t } = useI18n();
  const outbound = message.direction === "outbound";
  const kind = resolveMediaKind(message);
  const Media = kind ? MEDIA_VIEWS[kind] : null;
  return (
    <div className={cn("flex w-full", outbound ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-lg px-2.5 py-1.5 text-[14.2px] leading-[19px] shadow-sm md:max-w-[65%]",
        outbound ? "rounded-se-none bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
          : "rounded-ss-none bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]")}>
        {Media && <Media message={message} {...mediaProps} />}
        {message.body
          ? <p className="whitespace-pre-wrap break-words" dir="auto"><LinkifiedText text={message.body} /></p>
          : message.message_type === "unsupported" && <p className="italic opacity-70">{t("admin.whatsapp.unsupported")}</p>}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-black/45 dark:text-white/50">
          <time dateTime={message.sent_at} dir="ltr">{timeFormatter.format(new Date(message.sent_at))}</time>
          {outbound && <StatusTicks ack={message.ack_state} />}
        </span>
      </div>
    </div>
  );
}
