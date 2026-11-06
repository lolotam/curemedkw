import type { ReactNode } from "react";
import { Ban, ChevronDown, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  /** Asks the thread to confirm deleting this message; the thread owns the choice of scope. */
  onRequestDelete: (message: WhatsAppMessage) => void;
}

/**
 * WhatsApp Web style message bubble: the attachment view picked from the message type, the text
 * with clickable links, the time with delivery ticks on outbound messages, and a message menu.
 * A message deleted for everyone keeps its place as a "deleted" placeholder, as on WhatsApp.
 */
export function MessageBubble({ message, timeFormatter, onRequestDelete, ...mediaProps }: MessageBubbleProps) {
  const { t } = useI18n();
  const outbound = message.direction === "outbound";
  const deleted = !!message.remote_deleted_at;
  const kind = resolveMediaKind(message);
  const Media = kind ? MEDIA_VIEWS[kind] : null;
  return (
    <div className={cn("flex w-full", outbound ? "justify-end" : "justify-start")}>
      <div className={cn("group relative max-w-[85%] rounded-lg px-2.5 py-1.5 text-[14.2px] leading-[19px] shadow-sm md:max-w-[65%]",
        outbound ? "rounded-se-none bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
          : "rounded-ss-none bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]")}>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={t("admin.whatsapp.messageActions")}
            className="absolute end-1 top-1 rounded-full bg-inherit p-0.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100">
            <ChevronDown className="size-4 text-black/45 dark:text-white/50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onRequestDelete(message)}>
              <Trash2 className="me-2 size-4" />{t("admin.whatsapp.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {deleted
          ? <p className="flex items-center gap-1.5 italic opacity-70"><Ban className="size-4 shrink-0" />{t("admin.whatsapp.deletedMessage")}</p>
          : <>
            {Media && <Media message={message} {...mediaProps} />}
            {message.body
              ? <p className="whitespace-pre-wrap break-words" dir="auto"><LinkifiedText text={message.body} /></p>
              : message.message_type === "unsupported" && <p className="italic opacity-70">{t("admin.whatsapp.unsupported")}</p>}
          </>}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-black/45 dark:text-white/50">
          <time dateTime={message.sent_at} dir="ltr">{timeFormatter.format(new Date(message.sent_at))}</time>
          {outbound && !deleted && <StatusTicks ack={message.ack_state} />}
        </span>
      </div>
    </div>
  );
}
