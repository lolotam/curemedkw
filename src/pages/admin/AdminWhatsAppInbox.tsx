import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { callWhatsAppInbox, type WhatsAppChat } from "@/lib/whatsappInbox";
import { useChatAvatars, useWhatsAppInbox } from "@/hooks/useWhatsAppInbox";
import { WhatsAppInboxComposer } from "@/components/admin/WhatsAppInboxComposer";
import { WhatsAppChatList } from "@/components/admin/whatsapp/WhatsAppChatList";
import { WhatsAppContactList } from "@/components/admin/whatsapp/WhatsAppContactList";
import { WhatsAppThread } from "@/components/admin/whatsapp/WhatsAppThread";
import { WhatsAppThreadHeader } from "@/components/admin/whatsapp/WhatsAppThreadHeader";

export default function AdminWhatsAppInbox() {
  const { t } = useI18n();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<WhatsAppChat | null>(null);
  const [search, setSearch] = useState("");
  const [readFailed, setReadFailed] = useState(false);
  const { chats, messages, connection } = useWhatsAppInbox(selected?.id ?? null, search);
  const chatRows = chats.data?.pages.flat() ?? [];
  const avatars = useChatAvatars(chatRows.map(chat => chat.id));
  const current = chatRows.find(chat => chat.id === selected?.id) ?? selected;
  const rows = [...new Map((messages.data?.pages.flat() ?? []).map(message => [message.id, message])).values()].reverse();
  // Mark read only once the chat's last message is actually loaded, so a newer unseen message keeps the chat unread.
  // A last message deleted "for me" is never loaded; the operator removed it, so it counts as seen once the thread loads.
  const lastHidden = !!current?.last_message_preview?.deleted && messages.isSuccess;
  const lastLoaded = rows.some(message => message.provider_message_id === current?.last_message_id);
  const seenId = lastLoaded || lastHidden ? current?.last_message_id : null;
  useEffect(() => {
    if (!current?.id || !seenId || document.visibilityState !== "visible") return;
    setReadFailed(false);
    void callWhatsAppInbox({ action: "markRead", chatId: current.id, seenMessageId: seenId })
      .then(() => cache.invalidateQueries({ queryKey: ["whatsapp-inbox", "chats"] })).catch(() => setReadFailed(true));
  }, [current?.id, seenId, cache]);
  return <div className="flex h-dvh flex-col gap-3">
    <header className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{t("admin.whatsapp.inbox")}</h1>
      <Button asChild variant="outline" size="sm"><Link to="/admin/whatsapp"><Settings className="me-2 h-4 w-4" />{t("admin.whatsapp.settings")}</Link></Button></header>
    <p className={`text-sm ${connection.data?.connected ? "text-emerald-700" : "text-muted-foreground"}`} role="status">
      {t(connection.data?.connected ? "admin.whatsapp.connected" : "admin.whatsapp.disconnected")}
      {connection.data?.connected && !connection.data.webhookReady && ` · ${t("admin.whatsapp.webhookMissing")}`}
    </p>
    {readFailed && <p role="alert" className="text-sm text-destructive">{t("admin.whatsapp.readFailed")}</p>}
    <div className="flex min-h-[420px] flex-1 overflow-hidden rounded-xl border bg-card shadow-sm">
      <Tabs defaultValue="chats" className={`${selected ? "hidden md:flex" : "flex"} w-full flex-col border-e md:w-80 md:shrink-0`}>
        <TabsList className="m-2 grid grid-cols-2">
          <TabsTrigger value="chats">{t("admin.whatsapp.chatsTab")}</TabsTrigger>
          <TabsTrigger value="contacts">{t("admin.whatsapp.contactsTab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="chats" className="mt-0 min-h-0 flex-1">
          <WhatsAppChatList chats={chatRows} avatars={avatars} isLoading={chats.isPending} failed={!!chats.error}
            selectedId={selected?.id ?? null} onSelect={setSelected} search={search} onSearchChange={setSearch}
            hasMore={!!chats.hasNextPage} loadingMore={chats.isFetchingNextPage} onLoadMore={() => void chats.fetchNextPage()} />
        </TabsContent>
        <TabsContent value="contacts" className="mt-0 min-h-0 flex-1"><WhatsAppContactList /></TabsContent>
      </Tabs>
      <section className={`${selected ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>
        {current ? <>
          <WhatsAppThreadHeader chat={current} avatarUrl={avatars[current.id]} onBack={() => setSelected(null)} />
          <WhatsAppThread key={current.id} chatId={current.id} messages={rows} isLoading={messages.isPending} failed={!!messages.error}
            hasOlder={!!messages.hasNextPage} loadingOlder={messages.isFetchingNextPage} onLoadOlder={() => void messages.fetchNextPage()} />
          <WhatsAppInboxComposer key={current.id} chatId={current.id} disabled={!connection.data?.connected || !!connection.error}
            onSent={() => { void cache.invalidateQueries({ queryKey: ["whatsapp-inbox"] }); }} />
        </> : <div className="m-auto text-center text-muted-foreground"><MessageCircle className="mx-auto mb-3 h-14 w-14" /><p>{t("admin.whatsapp.selectChat")}</p></div>}
      </section>
    </div>
  </div>;
}
