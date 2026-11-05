import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type EvolutionInboxClient, inboxMessage, InboxError } from "../_shared/evolution-inbox.ts";
import { isPlainObject } from "../_shared/evolution-pairing.ts";
import { decodeInboxMedia, inboxDigest, storeInboxMedia } from "./media.ts";
import { inboxChat, inboxRpc } from "./storage.ts";

export interface InboxSend {
  chatId: string; requestId: string; text: string;
  media?: { base64: string; mime: string; fileName: string };
}

export async function sendInboxMessage(admin: SupabaseClient, provider: EvolutionInboxClient, input: InboxSend, actorId: string) {
  const chat = await inboxChat(admin, input.chatId);
  const status = await provider("status");
  if (!isPlainObject(status) || !isPlainObject(status.instance) || status.instance.state !== "open") {
    throw new InboxError("session_disconnected", 409);
  }
  let mediaId: string | null = null;
  let kind: string = "text";
  if (input.media) {
    kind = decodeInboxMedia(input.media.base64, input.media.mime).kind;
    mediaId = await storeInboxMedia(admin, { encoded: input.media.base64, mime: input.media.mime, fileName: input.media.fileName, actorId });
  }
  const contentHash = await inboxDigest(new TextEncoder().encode(JSON.stringify(input)));
  const reserved = await inboxRpc(admin, "wa_reserve_inbox_send", { p_request_id: input.requestId, p_chat_id: input.chatId,
    p_actor_id: actorId, p_content_hash: contentHash });
  if (reserved !== true) throw new InboxError("send_already_attempted", 409);
  // The durable reservation is never released after an uncertain provider response.
  const number = chat.remote_jid ?? `${chat.normalized_phone}@s.whatsapp.net`;
  let answer: unknown;
  try {
    answer = input.media
      ? await provider(kind === "audio" ? "audio" : "media", kind === "audio"
        ? { number, audio: input.media.base64, encoding: true }
        : { number, mediatype: kind, mimetype: input.media.mime, media: input.media.base64, fileName: input.media.fileName, caption: input.text })
      : await provider("text", { number, text: input.text });
    const row = inboxMessage(answer, false);
    if (!row) throw new InboxError("send_uncertain", 502);
    const stored = await inboxRpc(admin, "wa_ingest_messages", { p_rows: [{ ...row, remote_jid: chat.remote_jid ?? row.remote_jid, normalized_phone: chat.normalized_phone ?? row.normalized_phone, direction: "outbound", body: input.text, message_type: kind }] });
    // inserted may be 0 when the webhook echo stored it first; a skipped row means it was never stored.
    if (!isPlainObject(stored) || Number(stored.skipped) !== 0) throw new InboxError("send_uncertain", 502);
    if (mediaId) {
      const { error } = await admin.from("whatsapp_messages").update({ media_object_id: mediaId })
        .eq("instance_identity", "curemed").eq("provider_message_id", row.provider_message_id);
      if (error) throw new InboxError("send_uncertain", 502);
    }
    return { sent: true };
  } catch { throw new InboxError("send_uncertain", 502); }
}
