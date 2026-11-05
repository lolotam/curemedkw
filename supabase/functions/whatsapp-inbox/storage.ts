import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { InboxError } from "../_shared/evolution-inbox.ts";

export async function inboxRpc(admin: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data: receipt, error } = await admin.rpc(name, args);
  if (error) throw new InboxError("storage_unavailable", 503);
  return receipt;
}

export async function updateInboxConnection(admin: SupabaseClient, state: string) {
  const connected = state === "open" || state === "connected";
  const { error } = await admin.from("evolution_connections").update({ state: connected ? "connected" : "disconnected",
    updated_at: new Date().toISOString() }).eq("instance_identity", "curemed");
  if (error) throw new InboxError("storage_unavailable", 503);
}

export async function inboxChat(admin: SupabaseClient, id: string) {
  const { data: chat, error } = await admin.from("whatsapp_chats").select("id,remote_jid,normalized_phone")
    .eq("instance_identity", "curemed").eq("id", id).single();
  if (error || !chat) throw new InboxError("chat_not_found", 404);
  return chat;
}
