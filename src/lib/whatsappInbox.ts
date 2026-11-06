import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/clientRuntime";

/** Summary of a chat's last message, kept in step with that message by a database trigger. */
export type ChatPreview = {
  body: string; message_type: WhatsAppMessage["message_type"]; direction: WhatsAppMessage["direction"];
  ack_state: WhatsAppMessage["ack_state"]; deleted: boolean;
}
export type WhatsAppChat = {
  id: string; instance_identity: string; normalized_phone: string | null; remote_jid: string | null;
  display_name: string; last_message_at: string | null; last_message_id: string | null; unread_count: number;
  last_message_preview: ChatPreview | null;
}
export type WhatsAppMessage = {
  id: string; chat_id: string; instance_identity: string; provider_message_id: string;
  direction: "inbound" | "outbound"; message_type: "text" | "image" | "video" | "audio" | "document" | "unsupported";
  body: string; sent_at: string; ack_state: "accepted" | "delivered" | "read" | "rejected"; media_object_id: string | null;
  /** Set once the message was deleted for everyone, from this inbox or from a phone. */
  remote_deleted_at: string | null;
  /** Original WhatsApp attachment payload kept for media download; null for text and locally composed rows. */
  provider_media?: unknown;
}
/** Error codes the inbox screens explain to the operator; every other failure is `inbox_unavailable`. */
const SURFACED_ERRORS = ["webhook_conflict", "send_uncertain", "send_already_attempted", "session_disconnected", "invalid_media",
  "delete_not_allowed", "delete_window_expired"];

export async function callWhatsAppInbox<T>(body: Record<string, unknown>): Promise<T> {
  const { data: envelope, error } = await supabase.functions.invoke("whatsapp-inbox", { body });
  if (error instanceof FunctionsHttpError) {
    try {
      const failure = await error.context.json();
      const code = failure?.error?.code;
      if (SURFACED_ERRORS.includes(code)) throw new Error(code);
    } catch (failure) {
      if (failure instanceof Error && SURFACED_ERRORS.includes(failure.message)) throw failure;
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
