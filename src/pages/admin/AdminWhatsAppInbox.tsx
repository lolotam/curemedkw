import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { callWhatsAppInbox, type WhatsAppChat } from "@/lib/whatsappInbox";
import { useWhatsAppInbox } from "@/hooks/useWhatsAppInbox";
import { WhatsAppInboxComposer } from "@/components/admin/WhatsAppInboxComposer";
import { WhatsAppInboxMedia } from "@/components/admin/WhatsAppInboxMedia";

export default function AdminWhatsAppInbox() {
  const { t, lang } = useI18n();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<WhatsAppChat | null>(null);
  const [search, setSearch] = useState("");
  const [readFailed, setReadFailed] = useState(false);
  const { chats, messages, connection } = useWhatsAppInbox(selected?.id ?? null, search);
  const chatRows = chats.data?.pages.flat() ?? [];
  const current = chatRows.find(chat => chat.id === selected?.id) ?? selected;
  const rows = [...new Map((messages.data?.pages.flat() ?? []).map(message => [message.id, message])).values()].reverse();
  const end = useRef<HTMLDivElement>(null);
  const latestId = messages.data?.pages[0]?.[0]?.provider_message_id;
  const seenId = rows.some(message => message.provider_message_id === current?.last_message_id) ? current?.last_message_id : null;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [latestId, selected?.id]);
  useEffect(() => {
    if (!current?.id || !seenId || document.visibilityState !== "visible") return;
    setReadFailed(false);
    void callWhatsAppInbox({ action: "markRead", chatId: current.id, seenMessageId: seenId })
      .then(() => cache.invalidateQueries({ queryKey: ["whatsapp-inbox", "chats"] })).catch(() => setReadFailed(true));
  }, [current?.id, seenId, cache]);
  return <div className="space-y-3">
    <header className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{t("admin.whatsapp.inbox")}</h1>
      <Button asChild variant="outline" size="sm"><Link to="/admin/whatsapp"><Settings className="me-2 h-4 w-4" />{t("admin.whatsapp.settings")}</Link></Button></header>
    <p className={`text-sm ${connection.data?.connected ? "text-emerald-700" : "text-muted-foreground"}`} role="status">
      {t(connection.data?.connected ? "admin.whatsapp.connected" : "admin.whatsapp.disconnected")}
      {connection.data?.connected && !connection.data.webhookReady && ` · ${t("admin.whatsapp.webhookMissing")}`}
    </p>
    {readFailed && <p role="alert" className="text-sm text-destructive">{t("admin.whatsapp.readFailed")}</p>}
    <div className="flex h-[calc(100dvh-230px)] min-h-[420px] overflow-hidden rounded-xl border bg-card shadow-sm">
      <aside className={`${selected ? "hidden md:flex" : "flex"} w-full md:w-80 md:shrink-0 flex-col border-e`}>
        <div className="p-3 border-b"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("admin.whatsapp.search")} /></div>
        <div className="flex-1 overflow-y-auto">
          {chats.isPending && <p className="p-4">{t("common.loading")}</p>}
          {chats.error && <p role="alert" className="p-4 text-destructive">{t("admin.whatsapp.loadFailed")}</p>}
          {!chats.isPending && chatRows.length === 0 && <p className="p-4 text-muted-foreground">{t("admin.whatsapp.empty")}</p>}
          {chatRows.map(chat => <button key={chat.id} onClick={() => setSelected(chat)} className={`w-full text-start flex items-center gap-3 p-4 border-b hover:bg-muted/50 ${chat.id === selected?.id ? "bg-emerald-50 dark:bg-emerald-950" : ""}`}>
            <span className="grid place-items-center rounded-full h-10 w-10 shrink-0 bg-muted"><MessageCircle className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{chat.display_name || chat.normalized_phone || t("admin.whatsapp.unknownContact")}</span>
              <span className="block truncate text-xs text-muted-foreground" dir="ltr">{chat.normalized_phone ?? chat.remote_jid}</span></span>
            {chat.unread_count > 0 && <span className="rounded-full px-2 py-0.5 bg-emerald-600 text-white text-xs">{chat.unread_count}</span>}
          </button>)}
          {chats.hasNextPage && <Button className="m-3" variant="ghost" disabled={chats.isFetchingNextPage} onClick={() => void chats.fetchNextPage()}>{t("admin.whatsapp.more")}</Button>}
        </div>
      </aside>
      <section className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-stone-50 dark:bg-stone-950`}>
        {current ? <><header className="flex items-center gap-3 border-b bg-background p-3"><Button className="md:hidden" variant="ghost" size="icon" onClick={() => setSelected(null)} aria-label={t("admin.whatsapp.back")}><ArrowLeft className="h-5 w-5" /></Button>
          <h2 className="font-semibold truncate">{current.display_name || current.normalized_phone || t("admin.whatsapp.unknownContact")}</h2></header>
          <div className="flex-1 overflow-y-auto p-4 space-y-3" role="log" aria-label={t("admin.whatsapp.inbox")}>
            {messages.hasNextPage && <Button variant="outline" disabled={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>{t("admin.whatsapp.older")}</Button>}
            {messages.error && <p role="alert">{t("admin.whatsapp.loadFailed")}</p>}
            {rows.map(message => <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <article className={`max-w-[85%] md:max-w-[75%] rounded-xl px-3 py-2 shadow-sm ${message.direction === "outbound" ? "bg-emerald-100 dark:bg-emerald-900" : "bg-background"}`}>
                {!["text", "unsupported"].includes(message.message_type) && <WhatsAppInboxMedia message={message} />}
                <p dir="auto" className="whitespace-pre-wrap break-words">{message.body || (message.message_type === "unsupported" ? t("admin.whatsapp.unsupported") : "")}</p>
                <div className="mt-1 flex justify-end gap-2 text-[11px] text-muted-foreground"><time dateTime={message.sent_at}>{new Date(message.sent_at).toLocaleString(lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                  {message.direction === "outbound" && <span className={message.ack_state === "read" ? "text-blue-600" : ""}>{t(`admin.whatsapp.ack.${message.ack_state}`)}</span>}</div>
              </article></div>)}<div ref={end} />
          </div><WhatsAppInboxComposer key={current.id} chatId={current.id} disabled={!connection.data?.connected || !!connection.error}
            onSent={() => { void cache.invalidateQueries({ queryKey: ["whatsapp-inbox"] }); }} /></>
          : <div className="m-auto text-center text-muted-foreground"><MessageCircle className="h-14 w-14 mx-auto mb-3" /><p>{t("admin.whatsapp.selectChat")}</p></div>}
      </section>
    </div>
  </div>;
}
