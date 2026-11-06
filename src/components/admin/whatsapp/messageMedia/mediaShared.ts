import { useI18n } from "@/lib/i18n";
import type { WhatsAppMessage } from "@/lib/whatsappInbox";
import { providerMediaMeta } from "@/lib/whatsappInboxView";

export type LightboxEntry = { kind: "image" | "video" | "pdf"; src: string; message: WhatsAppMessage; fileName: string };

export interface MediaProps {
  message: WhatsAppMessage;
  onDownload: (message: WhatsAppMessage) => void;
  downloadPending: boolean;
}

export interface OpenableMediaProps extends MediaProps {
  onOpen: (entry: LightboxEntry) => void;
}

/** Label for an attachment: the fetched file name, else the name WhatsApp sent, else its type. */
export function useAttachmentName(message: WhatsAppMessage, fetchedName?: string): string {
  const { t } = useI18n();
  return fetchedName || providerMediaMeta(message).fileName || t(`admin.whatsapp.preview.${message.message_type}`);
}
