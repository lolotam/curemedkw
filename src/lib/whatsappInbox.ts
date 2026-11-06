import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/clientRuntime";

export type WhatsAppChat = {
  id: string; instance_identity: string; normalized_phone: string | null; remote_jid: string | null;
  display_name: string; last_message_at: string | null; last_message_id: string | null; unread_count: number;
}
export type WhatsAppMessage = {
  id: string; chat_id: string; instance_identity: string; provider_message_id: string;
  direction: "inbound" | "outbound"; message_type: "text" | "image" | "video" | "audio" | "document" | "unsupported";
  body: string; sent_at: string; ack_state: "accepted" | "delivered" | "read" | "rejected"; media_object_id: string | null;
  /** Original WhatsApp attachment payload kept for media download; null for text and locally composed rows. */
  provider_media?: unknown;
}
export async function callWhatsAppInbox<T>(body: Record<string, unknown>): Promise<T> {
  const { data: envelope, error } = await supabase.functions.invoke("whatsapp-inbox", { body });
  if (error instanceof FunctionsHttpError) {
    try {
      const failure = await error.context.json();
      const code = failure?.error?.code;
      if (["webhook_conflict", "send_uncertain", "send_already_attempted", "session_disconnected", "invalid_media"].includes(code)) throw new Error(code);
    } catch (failure) {
      if (failure instanceof Error && ["webhook_conflict", "send_uncertain", "send_already_attempted", "session_disconnected", "invalid_media"].includes(failure.message)) throw failure;
    }
  }
  if (error || !envelope?.success) throw new Error(envelope?.error?.code ?? "inbox_unavailable");
  if (body.action === "markRead" && envelope.data?.read !== true) throw new Error("read_not_cleared");
  return envelope.data as T;
}

export function fileToInboxBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}
