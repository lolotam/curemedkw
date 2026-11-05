import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvolutionPairingCard } from "@/components/admin/EvolutionPairingCard";
import { callWhatsAppInbox } from "@/lib/whatsappInbox";
import { useI18n } from "@/lib/i18n";

export function WhatsAppDirectSettings() {
  const { t } = useI18n();
  const cache = useQueryClient();
  const connection = useQuery({ queryKey: ["whatsapp-inbox", "connection"],
    queryFn: () => callWhatsAppInbox<{ connected: boolean; webhookReady: boolean }>({ action: "status" }), refetchInterval: 15_000 });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function synchronize() {
    setBusy(true); setError(false);
    try {
      await callWhatsAppInbox({ action: "webhook.ensure" });
      let complete = false;
      while (!complete && active.current) {
        const receipt = await callWhatsAppInbox<{ complete: boolean; processed: number }>({ action: "sync" });
        complete = receipt.complete; setProgress(receipt.processed);
      }
      await cache.invalidateQueries({ queryKey: ["whatsapp-inbox"] });
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <EvolutionPairingCard />
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <p role="status" className="text-sm">{t(connection.data?.connected ? "admin.whatsapp.connected" : "admin.whatsapp.disconnected")}
        {connection.data?.connected && !connection.data.webhookReady && ` · ${t("admin.whatsapp.webhookMissing")}`}</p>
      <p className="text-sm text-muted-foreground">{t("admin.whatsapp.historyNote")}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void synchronize()} disabled={busy}><RefreshCw className={`me-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />{t("admin.whatsapp.sync")}</Button>
        <Button asChild variant="outline"><Link to="/admin/whatsapp/inbox"><MessageCircle className="me-2 h-4 w-4" />{t("admin.whatsapp.inbox")}</Link></Button>
      </div>
      {progress !== null && <p role="status">{t("admin.whatsapp.processed")}: {progress}</p>}
      {error && <p role="alert" className="text-destructive">{t("admin.whatsapp.syncFailed")}</p>}
    </div>
  </div>;
}
