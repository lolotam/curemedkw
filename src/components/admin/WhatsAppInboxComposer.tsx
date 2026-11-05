import { useEffect, useRef, useState } from "react";
import { Mic, Paperclip, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { callWhatsAppInbox, fileToInboxBase64 } from "@/lib/whatsappInbox";
import { useI18n } from "@/lib/i18n";

export function WhatsAppInboxComposer({ chatId, disabled, onSent }: { chatId: string; disabled: boolean; onSent: () => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [recording, setRecording] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      recorder.current?.stream.getTracks().forEach(track => track.stop());
    };
  }, []);
  function changeFile(next: File | null) {
    if (next && next.size > 10 * 1024 * 1024) { setFailed(true); return; }
    setFile(next); requestId.current = crypto.randomUUID(); setFailed(false);
  }
  async function send() {
    if (busy || disabled || (!draft.trim() && !file)) return;
    setBusy(true); setFailed(false);
    try {
      await callWhatsAppInbox({ action: file ? "media.send" : "send", chatId, requestId: requestId.current, text: draft.trim(),
        ...(file ? { media: { base64: await fileToInboxBase64(file), mime: file.type, fileName: file.name } } : {}) });
      setDraft(""); setFile(null); requestId.current = crypto.randomUUID(); onSent();
    } catch (error) {
      setUncertain(error instanceof Error && ["send_uncertain", "send_already_attempted"].includes(error.message));
      setFailed(true);
    }
    finally { setBusy(false); }
  }
  async function record() {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const voice = new MediaRecorder(stream);
      recorder.current = voice;
      const chunks: Blob[] = [];
      let bytes = 0;
      const timer = window.setTimeout(() => { if (voice.state === "recording") voice.stop(); }, 120_000);
      voice.ondataavailable = event => { chunks.push(event.data); bytes += event.data.size; if (bytes >= 10 * 1024 * 1024 && voice.state === "recording") voice.stop(); };
      voice.onstop = () => {
        window.clearTimeout(timer); voice.stream.getTracks().forEach(track => track.stop());
        if (mounted.current) { setRecording(false); changeFile(new File(chunks, "voice-message.webm", { type: voice.mimeType })); }
      };
      voice.start(500); setRecording(true);
    } catch { stream?.getTracks().forEach(track => track.stop()); setFailed(true); }
  }
  return <div className="border-t bg-background p-3 space-y-2">
    {failed && <p role="alert" className="text-sm text-destructive">{t(uncertain ? "admin.whatsapp.sendUncertain" : "admin.whatsapp.sendFailed")}</p>}
    {file && <div className="flex items-center gap-2 text-sm"><span className="truncate">{file.name}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => changeFile(null)}>×</Button></div>}
    <div className="flex items-end gap-2">
      <input ref={input} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,audio/*,video/mp4,video/webm,application/pdf,text/plain,.doc,.docx,.xlsx" onChange={event => { changeFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
      <Button variant="ghost" size="icon" aria-label={t("admin.whatsapp.attach")} disabled={disabled || busy || recording} onClick={() => input.current?.click()}><Paperclip className="h-5 w-5" /></Button>
      <Textarea rows={1} maxLength={4096} value={draft} disabled={disabled || busy || recording} className="min-h-10 max-h-32 resize-none"
        placeholder={t("admin.whatsapp.compose")} onChange={event => { setDraft(event.target.value); requestId.current = crypto.randomUUID(); }}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
      <Button variant="ghost" size="icon" aria-label={t(recording ? "admin.whatsapp.stopRecording" : "admin.whatsapp.record")}
        disabled={disabled || busy} onClick={() => recording ? recorder.current?.stop() : void record()}>{recording ? <Square className="text-red-500 h-5 w-5" /> : <Mic className="h-5 w-5" />}</Button>
      <Button size="icon" aria-label={t("admin.whatsapp.send")} disabled={disabled || busy || recording || (!draft.trim() && !file)} onClick={() => void send()}><Send className="h-5 w-5" /></Button>
    </div>
  </div>;
}
