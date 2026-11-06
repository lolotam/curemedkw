import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { useDeleteWhatsAppMessage, type DeleteScope } from "@/hooks/useWhatsAppInbox";
import { useDownloadWhatsAppMedia } from "@/hooks/useWhatsAppMedia";
import { useI18n } from "@/lib/i18n";
import type { WhatsAppMessage } from "@/lib/whatsappInbox";
import { canDeleteForEveryone, groupByDay, inboxLocaleTag } from "@/lib/whatsappInboxView";
import { MessageBubble } from "./MessageBubble";
import { MediaLightbox } from "./messageMedia/MediaLightbox";
import type { LightboxEntry } from "./messageMedia/mediaShared";

interface WhatsAppThreadProps {
  chatId: string;
  /** Messages oldest first. */
  messages: WhatsAppMessage[];
  isLoading: boolean;
  failed: boolean;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
}

/**
 * Scrollable conversation: a date chip per local day, message bubbles, older-page loading, the
 * shared media lightbox and the delete confirmation. Marking the chat read stays with the page,
 * which owns the read contract.
 */
export function WhatsAppThread({ chatId, messages, isLoading, failed, hasOlder, loadingOlder, onLoadOlder }: WhatsAppThreadProps) {
  const { t, lang } = useI18n();
  const download = useDownloadWhatsAppMedia();
  const remove = useDeleteWhatsAppMessage();
  const [lightbox, setLightbox] = useState<LightboxEntry | null>(null);
  const [deleting, setDeleting] = useState<WhatsAppMessage | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const tag = inboxLocaleTag(lang);
  const dayFormatter = useMemo(() => new Intl.DateTimeFormat(tag, { dateStyle: "medium" }), [tag]);
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit" }), [tag]);
  const groups = useMemo(() => groupByDay(messages), [messages]);
  const newestId = messages[messages.length - 1]?.id;

  // Follows new messages and a newly opened chat; loading older pages leaves the scroll position alone.
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [newestId, chatId]);

  function onDownload(message: WhatsAppMessage) {
    download.mutate(message.id, { onError: () => toast.error(t("admin.whatsapp.downloadFailed")) });
  }
  function onConfirmDelete(scope: DeleteScope) {
    if (!deleting) return;
    remove.mutate({ messageId: deleting.id, scope }, {
      onError: failure => toast.error(t(failure.message === "delete_window_expired" ? "admin.whatsapp.deleteWindowExpired" : "admin.whatsapp.deleteFailed")),
    });
    setDeleting(null);
  }
  const forEveryone = !!deleting && canDeleteForEveryone(deleting);
  const mediaProps = { onDownload, onOpen: setLightbox };
  const pendingId = download.isPending ? download.variables : null;

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#efeae2] p-4 dark:bg-[#0b141a]" role="log" aria-label={t("admin.whatsapp.inbox")}>
      {hasOlder && messages.length > 0 && (
        <div className="flex justify-center">
          <Button size="sm" variant="secondary" disabled={loadingOlder} onClick={onLoadOlder}>{t("admin.whatsapp.older")}</Button>
        </div>
      )}
      {isLoading && <p className="text-center text-sm text-muted-foreground">{t("common.loading")}</p>}
      {failed && <p role="alert" className="text-center text-sm text-destructive">{t("admin.whatsapp.loadFailed")}</p>}
      {!isLoading && !failed && messages.length === 0 && <p className="text-center text-sm text-muted-foreground">{t("admin.whatsapp.emptyThread")}</p>}
      {groups.map(group => (
        <section key={group.day} className="space-y-1.5" aria-label={dayFormatter.format(group.date)}>
          <div className="flex justify-center">
            <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm dark:bg-[#182229]">{dayFormatter.format(group.date)}</span>
          </div>
          {group.rows.map(message => (
            <MessageBubble key={message.id} message={message} timeFormatter={timeFormatter} downloadPending={pendingId === message.id}
              onRequestDelete={setDeleting} {...mediaProps} />
          ))}
        </section>
      ))}
      <div ref={bottom} />
      <MediaLightbox entry={lightbox} onClose={() => setLightbox(null)} onDownload={onDownload}
        downloadPending={!!lightbox && pendingId === lightbox.message.id} />
      <AlertDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.whatsapp.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t(forEveryone ? "admin.whatsapp.deleteBothHint" : "admin.whatsapp.deleteForMeHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.whatsapp.cancel")}</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "outline" })} onClick={() => onConfirmDelete("local")}>
              {t("admin.whatsapp.deleteForMe")}
            </AlertDialogAction>
            {forEveryone && (
              <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => onConfirmDelete("everyone")}>
                {t("admin.whatsapp.deleteForEveryone")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
