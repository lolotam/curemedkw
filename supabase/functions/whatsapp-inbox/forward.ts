import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type EvolutionInboxClient, InboxError } from "../_shared/evolution-inbox.ts";
import { ensureInboxMediaObject, inboxMediaObject } from "./media.ts";
import { sendInboxMessage } from "./send.ts";

const FORWARDABLE_MEDIA = new Set(["image", "video", "audio", "document"]);

function encodeBase64(bytes: Uint8Array) {
  // String.fromCharCode takes its bytes as arguments, so encode in slices well below the argument limit.
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/**
 * Sends a copy of an existing message to another chat as a new message: the text, or the stored
 * attachment with its caption. It goes through the ordinary send path under the caller's new requestId,
 * so a retried forward is refused like a retried send.
 */
export async function forwardInboxMessage(admin: SupabaseClient, provider: EvolutionInboxClient,
  input: { messageId: string; chatId: string; requestId: string }, actorId: string) {
  const { data: message, error } = await admin.from("whatsapp_messages")
    .select("id,message_type,body,media_object_id,provider_media,remote_deleted_at")
    .eq("id", input.messageId).eq("instance_identity", "curemed").single();
  if (error || !message) throw new InboxError("message_not_found", 404);
  if (message.remote_deleted_at) throw new InboxError("forward_not_supported", 409);
  const send = { chatId: input.chatId, requestId: input.requestId, text: message.body ?? "" };
  if (message.message_type === "text") {
    if (!send.text.trim()) throw new InboxError("forward_not_supported", 409);
    return await sendInboxMessage(admin, provider, send, actorId);
  }
  if (!FORWARDABLE_MEDIA.has(message.message_type)) throw new InboxError("forward_not_supported", 409);
  const media = await inboxMediaObject(admin, await ensureInboxMediaObject(admin, provider, message));
  const { data: file, error: downloadError } = await admin.storage.from("whatsapp-media").download(media.object_path);
  if (downloadError || !file) throw new InboxError("media_unavailable", 503);
  const base64 = encodeBase64(new Uint8Array(await file.arrayBuffer()));
  return await sendInboxMessage(admin, provider, { ...send, media: { base64, mime: media.mime_type, fileName: media.file_name } }, actorId);
}
