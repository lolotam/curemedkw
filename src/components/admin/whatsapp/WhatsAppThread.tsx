import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { ForwardMessageDialog } from "./ForwardMessageDialog";
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

/** How close to the end, in pixels, still counts as reading the newest messages. */
const BOTTOM_SLACK_PX = 48;

function isNearBottom(log: HTMLElement): boolean {
  return log.scrollHeight - log.scrollTop - log.clientHeight <= BOTTOM_SLACK_PX;
}

/** Scrolls only the log itself: scrollIntoView would also move the admin layout and the window. */
function scrollToEnd(log: HTMLElement) {
  log.scrollTop = log.scrollHeight;
}

/**
 * Scrollable conversation: a date chip per local day, message bubbles, older-page loading, the
 * shared media lightbox, the forward picker and the delete confirmation. Marking the chat read stays with the page,
 * which owns the read contract.
 */
export function WhatsAppThread({ chatId, messages, isLoading, failed, hasOlder, loadingOlder, onLoadOlder }: WhatsAppThreadProps) {
  const { t, lang } = useI18n();
  const download = useDownloadWhatsAppMedia();
  const remove = useDeleteWhatsAppMessage();
  const [lightbox, setLightbox] = useState<LightboxEntry | null>(null);
  const [deleting, setDeleting] = useState<WhatsAppMessage | null>(null);
  const [forwarding, setForwarding] = useState<WhatsAppMessage | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // Whether the operator was reading the newest messages before the latest layout change.
  const atBottom = useRef(true);
  // Distance from the scroll position to the end of the log, kept while an older page loads.
  const olderAnchor = useRef<number | null>(null);
  const tag = inboxLocaleTag(lang);
  const dayFormatter = useMemo(() => new Intl.DateTimeFormat(tag, { dateStyle: "medium" }), [tag]);
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit" }), [tag]);
  const groups = useMemo(() => groupByDay(messages), [messages]);
  const newestId = messages[messages.length - 1]?.id;
  const oldestId = messages[0]?.id;

  // A newly opened chat and every new newest message show the end of the conversation.
  useLayoutEffect(() => {
    if (!log.current) return;
    scrollToEnd(log.current);
    atBottom.current = true;
  }, [newestId, chatId]);

  // Media finishing loading grows the log, and a shorter window shrinks the viewport; either way keep the end
  // in view, unless the operator scrolled up to read.
  useEffect(() => {
    const scroller = log.current;
    const inner = content.current;
    if (!scroller || !inner || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { if (atBottom.current) scrollToEnd(scroller); });
    observer.observe(inner);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // An older page is prepended above the visible messages; keep the same messages on screen.
  useLayoutEffect(() => {
    const node = log.current;
    if (olderAnchor.current === null || loadingOlder || !node) return;
    node.scrollTop = node.scrollHeight - olderAnchor.current;
    olderAnchor.current = null;
    atBottom.current = isNearBottom(node);
  }, [oldestId, loadingOlder]);

  function onLogScroll(node: HTMLElement) {
    atBottom.current = isNearBottom(node);
    // The operator moved while an older page loads: restore where they are now, not where they clicked.
    if (olderAnchor.current !== null) olderAnchor.current = node.scrollHeight - node.scrollTop;
  }

  function loadOlder() {
    const node = log.current;
    if (node) olderAnchor.current = node.scrollHeight - node.scrollTop;
    onLoadOlder();
  }

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
    <div ref={log} role="log" tabIndex={0} aria-label={t("admin.whatsapp.inbox")}
      onScroll={event => onLogScroll(event.currentTarget)}
      className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-[#efeae2] dark:bg-[#0b141a]">
      <div ref={content} className="space-y-2 p-4">
        {hasOlder && messages.length > 0 && (
          <div className="flex justify-center">
            <Button size="sm" variant="secondary" disabled={loadingOlder} onClick={loadOlder}>{t("admin.whatsapp.older")}</Button>
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
                onRequestDelete={setDeleting} onRequestForward={setForwarding} {...mediaProps} />
            ))}
          </section>
        ))}
      </div>
      <MediaLightbox entry={lightbox} onClose={() => setLightbox(null)} onDownload={onDownload}
        downloadPending={!!lightbox && pendingId === lightbox.message.id} />
      <ForwardMessageDialog message={forwarding} onClose={() => setForwarding(null)} />
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
