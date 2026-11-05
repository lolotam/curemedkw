import { useState } from "react";
import { Button } from "@/components/ui/button";
import { callWhatsAppInbox, type WhatsAppMessage } from "@/lib/whatsappInbox";
import { useI18n } from "@/lib/i18n";

export function WhatsAppInboxMedia({ message }: { message: WhatsAppMessage }) {
  const { t } = useI18n();
  const [media, setMedia] = useState<{ url: string; fileName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function load() {
    setBusy(true); setFailed(false);
    try { setMedia(await callWhatsAppInbox({ action: "media.get", messageId: message.id })); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }
  if (!media) return <div><Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>{t("admin.whatsapp.loadMedia")}</Button>{failed && <p role="alert">{t("admin.whatsapp.mediaFailed")}</p>}</div>;
  const expired = () => { setMedia(null); setFailed(true); };
  if (message.message_type === "image") return <a href={media.url} target="_blank" rel="noreferrer"><img className="max-h-80 rounded-lg" src={media.url} alt={media.fileName} onError={expired} /></a>;
  if (message.message_type === "audio") return <audio className="max-w-full" controls src={media.url} onError={expired} />;
  if (message.message_type === "video") return <video className="max-h-80 rounded-lg" controls src={media.url} onError={expired} />;
  return <a className="underline" href={media.url} target="_blank" rel="noreferrer" download={media.fileName}>{media.fileName}</a>;
}
