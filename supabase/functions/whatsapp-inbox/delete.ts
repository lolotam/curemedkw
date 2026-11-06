import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type EvolutionInboxClient, InboxError } from "../_shared/evolution-inbox.ts";
import { inboxChat, inboxRpc } from "./storage.ts";

/** WhatsApp only honours "delete for everyone" for about two and a half days after sending. */
export const REVOKE_WINDOW_MS = 60 * 60 * 60 * 1000;

export type InboxDeleteScope = "local" | "everyone";

/**
 * "local" hides a message in this inbox only. "everyone" revokes an outbound message on WhatsApp first
 * and records it only after the provider accepted the revoke.
 */
export async function deleteInboxMessage(admin: SupabaseClient, provider: EvolutionInboxClient,
  input: { messageId: string; scope: InboxDeleteScope }, actorId: string, now = Date.now()) {
  if (input.scope === "everyone") {
    const { data: message, error } = await admin.from("whatsapp_messages")
      .select("chat_id,provider_message_id,direction,sent_at,remote_deleted_at")
      .eq("id", input.messageId).eq("instance_identity", "curemed").single();
    if (error || !message) throw new InboxError("message_not_found", 404);
    if (message.direction !== "outbound" || message.remote_deleted_at) throw new InboxError("delete_not_allowed", 409);
    if (now - Date.parse(message.sent_at) > REVOKE_WINDOW_MS) throw new InboxError("delete_window_expired", 409);
    const chat = await inboxChat(admin, message.chat_id);
    await provider("revoke", { id: message.provider_message_id, fromMe: true,
      remoteJid: chat.remote_jid ?? `${chat.normalized_phone}@s.whatsapp.net` });
  }
  // If WhatsApp accepted the revoke but this write fails, the message still looks undeleted here and a retry
  // sends the revoke again. How Evolution answers a repeated revoke is unverified; a refusal surfaces as
  // provider_unavailable.
  const deleted = await inboxRpc(admin, "wa_delete_inbox_message", { p_message_id: input.messageId,
    p_scope: input.scope, p_actor_id: actorId });
  if (deleted !== true) throw new InboxError("message_not_found", 404);
  return { deleted: true };
}
