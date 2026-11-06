import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForwardTargets, useForwardWhatsAppMessage } from "@/hooks/useWhatsAppInbox";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { WhatsAppMessage } from "@/lib/whatsappInbox";
import { chatPhone, chatTitle } from "@/lib/whatsappInboxView";

const FAILURE_KEYS: Record<string, string> = {
  send_uncertain: "admin.whatsapp.sendUncertain",
  send_already_attempted: "admin.whatsapp.sendUncertain",
  session_disconnected: "admin.whatsapp.disconnected",
  forward_not_supported: "admin.whatsapp.forwardNotSupported",
};

interface ForwardMessageDialogProps {
  /** The message to forward; the dialog is closed while this is null. */
  message: WhatsAppMessage | null;
  onClose: () => void;
}

/**
 * Picks a chat and forwards the message there as a new message. Each target keeps its own requestId
 * for as long as the dialog is open, so pressing Forward again after an unclear failure is refused by
 * the server rather than delivering a second copy; another target gets a fresh one.
 */
export function ForwardMessageDialog({ message, onClose }: ForwardMessageDialogProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const targets = useForwardTargets(search);
  const forward = useForwardWhatsAppMessage();
  const options = targets.data?.filter(chat => chat.id !== message?.chat_id);

  function close() {
    setSearch(""); setTargetId(null); requestIds.current.clear(); forward.reset(); onClose();
  }
  function submit() {
    if (!message || !targetId) return;
    const requestId = requestIds.current.get(targetId) ?? crypto.randomUUID();
    requestIds.current.set(targetId, requestId);
    forward.mutate({ messageId: message.id, chatId: targetId, requestId }, {
      onSuccess: () => { toast.success(t("admin.whatsapp.forwarded")); close(); },
      onError: failure => toast.error(t(FAILURE_KEYS[failure.message] ?? "admin.whatsapp.forwardFailed")),
    });
  }

  return (
    <Dialog open={!!message} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.whatsapp.forwardTitle")}</DialogTitle>
          <DialogDescription>{t("admin.whatsapp.forwardHint")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("admin.whatsapp.search")}
            aria-label={t("admin.whatsapp.search")} className="h-9 ps-8" />
        </div>
        <ul className="max-h-72 overflow-y-auto rounded-md border" role="listbox" aria-label={t("admin.whatsapp.forwardTo")}>
          {targets.isPending && <li className="p-3 text-sm text-muted-foreground">{t("common.loading")}</li>}
          {targets.error && <li role="alert" className="p-3 text-sm text-destructive">{t("admin.whatsapp.loadFailed")}</li>}
          {options?.length === 0 && <li className="p-3 text-sm text-muted-foreground">{t("admin.whatsapp.noMatches")}</li>}
          {options?.map(chat => (
            <li key={chat.id} role="option" aria-selected={chat.id === targetId}>
              <button type="button" onClick={() => setTargetId(chat.id)}
                className={cn("flex w-full flex-col items-start border-b px-3 py-2 text-start hover:bg-muted/60", chat.id === targetId && "bg-muted")}>
                <span className="truncate text-sm font-medium" dir="auto">{chatTitle(chat, t("admin.whatsapp.unknownContact"))}</span>
                {chat.display_name.trim() && chatPhone(chat) && <span className="text-xs text-muted-foreground" dir="ltr">{chatPhone(chat)}</span>}
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={close}>{t("admin.whatsapp.cancel")}</Button>
          <Button onClick={submit} disabled={!targetId || forward.isPending}>{t("admin.whatsapp.forward")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
