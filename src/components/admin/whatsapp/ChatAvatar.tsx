import { useState } from "react";
import { cn } from "@/lib/utils";
import { chatInitials } from "@/lib/whatsappInboxView";
import type { WhatsAppChat } from "@/lib/whatsappInbox";

interface ChatAvatarProps {
  chat: WhatsAppChat;
  /** Signed profile picture URL; null or undefined while there is none or it is still loading. */
  src?: string | null;
  className?: string;
}

/**
 * Round avatar shared by the chat list and the thread header: the contact's WhatsApp profile picture,
 * or their initials when there is no picture or it fails to load (for example an expired signed URL).
 */
export function ChatAvatar({ chat, src, className }: ChatAvatarProps) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const shape = cn("size-10 shrink-0 rounded-full", className);
  if (src && src !== brokenSrc) {
    return <img src={src} alt="" aria-hidden loading="lazy" onError={() => setBrokenSrc(src)} className={cn(shape, "bg-muted object-cover")} />;
  }
  return (
    <span aria-hidden className={cn(shape, "flex items-center justify-center bg-primary/10 text-sm font-semibold text-primary")}>
      {chatInitials(chat)}
    </span>
  );
}
