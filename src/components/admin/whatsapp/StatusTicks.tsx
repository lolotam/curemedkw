import { AlertCircle, Check, CheckCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { WhatsAppMessage } from "@/lib/whatsappInbox";

const MUTED = "text-black/45 dark:text-white/50";
const TICK_COLOR: Record<WhatsAppMessage["ack_state"], string> = {
  accepted: MUTED, delivered: MUTED, read: "text-[#53bdeb]", rejected: "text-red-500",
};

/** WhatsApp delivery ticks for an outbound message; the state is spelled out for screen readers. */
export function StatusTicks({ ack }: { ack: WhatsAppMessage["ack_state"] }) {
  const { t } = useI18n();
  const Icon = ack === "rejected" ? AlertCircle : ack === "accepted" ? Check : CheckCheck;
  return <Icon role="img" aria-label={t(`admin.whatsapp.ack.${ack}`)} className={cn("size-3.5 shrink-0", TICK_COLOR[ack])} />;
}
