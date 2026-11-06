import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { inboxAck, inboxMessage, InboxError, inboxRevokedId } from "./evolution-inbox.ts";
import { isPlainObject } from "./evolution-pairing.ts";
import { inboxRpc, updateInboxConnection } from "./whatsapp-inbox-storage.ts";

export async function ingestInboxEvent(admin: SupabaseClient, event: string, payload: unknown) {
  if (event === "connection.update") {
    if (!isPlainObject(payload) || typeof payload.state !== "string") throw new InboxError("invalid_request");
    await updateInboxConnection(admin, payload.state);
    return;
  }
  // Baileys names deleted messages as `{ keys: [...] }`; every other event is one entry or a list of them.
  const entries = isPlainObject(payload) && Array.isArray(payload.keys) ? payload.keys
    : Array.isArray(payload) ? payload : [payload];
  if (entries.length > 200) throw new InboxError("invalid_request");
  if (event === "messages.upsert") {
    // A phone-side "delete for everyone" arrives as a protocol message that names the revoked id.
    const revoked = entries.map(inboxRevokedId).filter(id => id !== null);
    const rows = entries.filter(entry => inboxRevokedId(entry) === null)
      .map(entry => inboxMessage(entry, true)).filter(entry => entry !== null);
    if (rows.length) await inboxRpc(admin, "wa_ingest_messages", { p_rows: rows });
    for (const id of revoked) await inboxRpc(admin, "wa_apply_remote_revoke", { p_provider_message_id: id });
    return;
  }
  for (const entry of entries) {
    if (!isPlainObject(entry)) continue;
    const key = isPlainObject(entry.key) ? entry.key : entry;
    const update = isPlainObject(entry.update) ? entry.update : entry;
    const id = entry.keyId ?? key.id;
    if (typeof id !== "string" || !id || id.length > 250) continue;
    if (event === "messages.delete" || String(update.status).toUpperCase() === "DELETED") {
      await inboxRpc(admin, "wa_apply_remote_revoke", { p_provider_message_id: id });
      continue;
    }
    const ack = inboxAck(update.status);
    if (ack && (entry.fromMe ?? key.fromMe) === true) {
      await inboxRpc(admin, "wa_update_ack", { p_message_id: id, p_state: ack });
    }
  }
}
