import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { inboxAck, inboxMessage, InboxError } from "./evolution-inbox.ts";
import { isPlainObject } from "./evolution-pairing.ts";
import { inboxRpc, updateInboxConnection } from "./whatsapp-inbox-storage.ts";

export async function ingestInboxEvent(admin: SupabaseClient, event: string, payload: unknown) {
  if (event === "connection.update") {
    if (!isPlainObject(payload) || typeof payload.state !== "string") throw new InboxError("invalid_request");
    await updateInboxConnection(admin, payload.state);
    return;
  }
  const entries = Array.isArray(payload) ? payload : [payload];
  if (entries.length > 200) throw new InboxError("invalid_request");
  if (event === "messages.upsert") {
    const rows = entries.map(entry => inboxMessage(entry, true)).filter(entry => entry !== null);
    await inboxRpc(admin, "wa_ingest_messages", { p_rows: rows });
    return;
  }
  for (const entry of entries) {
    if (!isPlainObject(entry)) continue;
    const key = isPlainObject(entry.key) ? entry.key : entry;
    const update = isPlainObject(entry.update) ? entry.update : entry;
    const ack = inboxAck(update.status);
    const id = entry.keyId ?? key.id;
    if (ack && (entry.fromMe ?? key.fromMe) === true && typeof id === "string") {
      await inboxRpc(admin, "wa_update_ack", { p_message_id: id, p_state: ack });
    }
  }
}
