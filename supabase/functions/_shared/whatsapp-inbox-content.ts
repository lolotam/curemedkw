import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { InboxError } from "./evolution-inbox.ts";
import { isPlainObject } from "./evolution-pairing.ts";

/**
 * A history re-sync can now recognize content that was previously unsupported.
 * Update only its content; duplicate ingestion must not change unread counters,
 * delivery state, message identity or deletion evidence.
 */
export async function repairUnsupportedInboxContent(admin: SupabaseClient, rows: unknown[]) {
  const supported = rows.filter(isPlainObject).filter(row =>
    row.message_type !== "unsupported" && typeof row.provider_message_id === "string");
  if (!supported.length) return;
  const byId = new Map(supported.map(row => [row.provider_message_id, row]));
  const { data: existing, error } = await admin.from("whatsapp_messages").select("id,provider_message_id")
    .eq("instance_identity", "curemed").eq("message_type", "unsupported")
    .is("remote_deleted_at", null).is("locally_deleted_at", null).in("provider_message_id", [...byId.keys()]);
  if (error) throw new InboxError("storage_unavailable", 503);
  const messages = existing ?? [];
  for (let offset = 0; offset < messages.length; offset += 4) {
    await Promise.all(messages.slice(offset, offset + 4).map(async message => {
      const row = byId.get(message.provider_message_id);
      if (!row) return;
      const { error: updateError } = await admin.from("whatsapp_messages").update({
        message_type: row.message_type, body: row.body, provider_media: row.provider_media,
      }).eq("id", message.id).eq("instance_identity", "curemed").eq("message_type", "unsupported")
        .is("remote_deleted_at", null).is("locally_deleted_at", null);
      if (updateError) throw new InboxError("storage_unavailable", 503);
    }));
  }
}

/**
 * Bookkeeping records (see `inboxIgnoredId`) used to be stored as unsupported bubbles.
 * Hide those copies from the thread the way "delete for me" does, under the repair's
 * guards; unread counters, delivery state and message identity stay untouched.
 */
export async function hideIgnoredInboxContent(admin: SupabaseClient, providerMessageIds: string[]) {
  if (!providerMessageIds.length) return;
  const { error } = await admin.from("whatsapp_messages").update({ locally_deleted_at: new Date().toISOString() })
    .eq("instance_identity", "curemed").eq("message_type", "unsupported")
    .is("remote_deleted_at", null).is("locally_deleted_at", null).in("provider_message_id", providerMessageIds);
  if (error) throw new InboxError("storage_unavailable", 503);
}
