import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { WhatsAppChat } from "@/lib/whatsappInbox";
import { chatTitle, lastMessageTime, previewText, type ChatPreview } from "@/lib/whatsappInboxView";
import { ChatAvatar } from "./ChatAvatar";
import { StatusTicks } from "./StatusTicks";

interface WhatsAppChatListProps {
  chats: WhatsAppChat[];
  previews: Map<string, ChatPreview> | undefined;
  isLoading: boolean;
  failed: boolean;
  selectedId: string | null;
  onSelect: (chat: WhatsAppChat) => void;
  search: string;
  onSearchChange: (value: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

interface ChatRowProps {
  chat: WhatsAppChat;
  preview: ChatPreview | undefined;
  selected: boolean;
  onSelect: (chat: WhatsAppChat) => void;
}

/** One conversation: avatar, name and last-message time, then the preview and the unread count. */
function ChatRow({ chat, preview, selected, onSelect }: ChatRowProps) {
  const { t, lang } = useI18n();
  const unread = chat.unread_count > 0;
  return (
    <li>
      <button type="button" onClick={() => onSelect(chat)} aria-current={selected || undefined}
        className={cn("flex w-full items-center gap-3 border-b px-3 py-2.5 text-start transition-colors hover:bg-muted/60", selected && "bg-muted")}>
        <ChatAvatar chat={chat} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium" dir="auto">{chatTitle(chat, t("admin.whatsapp.unknownContact"))}</span>
            <span className={cn("shrink-0 text-[11px]", unread ? "font-semibold text-emerald-600" : "text-muted-foreground")} dir="ltr">
              {lastMessageTime(chat.last_message_at, lang)}
            </span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              {preview?.direction === "outbound" && <StatusTicks ack={preview.ack_state} />}
              <span className="truncate" dir="auto">{preview ? previewText(preview, t) : ""}</span>
            </span>
            {unread && (
              <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] hover:bg-emerald-600">
                {chat.unread_count}
              </Badge>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/** WhatsApp Web style conversation list: avatar, name, last-message time, preview and unread count. */
export function WhatsAppChatList({
  chats, previews, isLoading, failed, selectedId, onSelect, search, onSearchChange, hasMore, loadingMore, onLoadMore,
}: WhatsAppChatListProps) {
  const { t } = useI18n();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={event => onSearchChange(event.target.value)} placeholder={t("admin.whatsapp.search")}
            aria-label={t("admin.whatsapp.search")} className="h-9 ps-8" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>}
        {failed && <p role="alert" className="p-4 text-sm text-destructive">{t("admin.whatsapp.loadFailed")}</p>}
        {!isLoading && !failed && chats.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("admin.whatsapp.empty")}</p>}
        <ul>
          {chats.map(chat => (
            <ChatRow key={chat.id} chat={chat} selected={chat.id === selectedId} onSelect={onSelect}
              preview={chat.last_message_id ? previews?.get(chat.last_message_id) : undefined} />
          ))}
        </ul>
        {hasMore && (
          <div className="flex justify-center p-3">
            <Button variant="ghost" size="sm" disabled={loadingMore} onClick={onLoadMore}>{t("admin.whatsapp.more")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
