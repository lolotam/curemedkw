import { cn } from "@/lib/utils";
import { chatInitials } from "@/lib/whatsappInboxView";
import type { WhatsAppChat } from "@/lib/whatsappInbox";

/** Round avatar showing the chat's initials, shared by the chat list and the thread header. */
export function ChatAvatar({ chat, className }: { chat: WhatsAppChat; className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary", className)}>
      {chatInitials(chat)}
    </span>
  );
}
