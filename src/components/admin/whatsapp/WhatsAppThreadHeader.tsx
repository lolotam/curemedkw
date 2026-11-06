import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { WhatsAppChat } from "@/lib/whatsappInbox";
import { chatPhone, chatTitle } from "@/lib/whatsappInboxView";
import { ChatAvatar } from "./ChatAvatar";

/**
 * Header of the open conversation: avatar, the name as a full-width bar, and the number under it.
 * A chat known only by a WhatsApp `@lid` address shows no number rather than an invented one.
 */
export function WhatsAppThreadHeader({ chat, onBack }: { chat: WhatsAppChat; onBack: () => void }) {
  const { t } = useI18n();
  const phone = chatPhone(chat);
  return (
    <div className="flex items-center gap-2 border-b bg-primary/10 px-3 py-2">
      <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("admin.whatsapp.back")} onClick={onBack}>
        <ArrowLeft className="size-4 rtl:-scale-x-100" />
      </Button>
      <ChatAvatar chat={chat} className="size-11" />
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
        <h2 className="w-full truncate rounded-full bg-primary/85 px-3 py-1 text-center text-base font-bold text-primary-foreground shadow-sm sm:text-lg" dir="auto">
          {chatTitle(chat, t("admin.whatsapp.unknownContact"))}
        </h2>
        {phone && chat.display_name.trim() && <p className="w-full text-xs text-muted-foreground"><span dir="ltr">{phone}</span></p>}
      </div>
    </div>
  );
}
