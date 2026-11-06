import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type EvolutionInboxClient, InboxError } from "../_shared/evolution-inbox.ts";
import { isPlainObject } from "../_shared/evolution-pairing.ts";

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const mimeKinds: Record<string, "image" | "video" | "audio" | "document"> = {
  "image/jpeg": "image", "image/png": "image", "image/webp": "image",
  "video/mp4": "video", "video/webm": "video", "audio/ogg": "audio", "audio/mpeg": "audio",
  "audio/mp4": "audio", "audio/webm": "audio", "audio/wav": "audio", "application/pdf": "document",
  "text/plain": "document", "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
};

export function decodeInboxMedia(encoded: string, mime: string) {
  const kind = mimeKinds[mime.split(";")[0]];
  if (!kind || encoded.length > Math.ceil(MEDIA_MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new InboxError("invalid_media");
  }
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0)); }
  catch { throw new InboxError("invalid_media"); }
  if (bytes.length === 0 || bytes.length > MEDIA_MAX_BYTES) throw new InboxError("invalid_media");
  return { bytes, kind, mime: mime.split(";")[0] };
}

export async function inboxDigest(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function storeInboxMedia(admin: SupabaseClient, input: { encoded: string; mime: string; fileName: string; actorId: string | null }) {
  const media = decodeInboxMedia(input.encoded, input.mime);
  const hash = await inboxDigest(media.bytes);
  const path = `curemed/${hash}`;
  const { data: existing, error: readError } = await admin.from("whatsapp_media_objects").select("id").eq("object_path", path).maybeSingle();
  if (readError) throw new InboxError("storage_unavailable", 503);
  if (existing) return existing.id as string;
  const { error: uploadError } = await admin.storage.from("whatsapp-media").upload(path, media.bytes, { contentType: media.mime, upsert: true });
  if (uploadError) throw new InboxError("media_storage_unavailable", 503);
  const { data: stored, error } = await admin.from("whatsapp_media_objects").upsert({ instance_identity: "curemed", object_path: path,
    mime_type: media.mime, file_name: input.fileName.slice(0, 200), byte_size: media.bytes.length,
    content_hash: hash, created_by: input.actorId }, { onConflict: "object_path" }).select("id").single();
  if (error || !stored) throw new InboxError("media_storage_unavailable", 503);
  return stored.id as string;
}

/**
 * Self-hosted Supabase signs storage URLs on the gateway the function itself talks to (`http://kong:8000`),
 * which no browser can reach. Re-root the signed path on the public API origin; without one, keep it as is.
 */
function browserReachableUrl(signedUrl: string, publicOrigin: string) {
  if (!publicOrigin.trim()) return signedUrl;
  const signed = new URL(signedUrl);
  return new URL(`${signed.pathname}${signed.search}`, publicOrigin).toString();
}

export async function getInboxMedia(admin: SupabaseClient, provider: EvolutionInboxClient, messageId: string, publicOrigin: string) {
  const { data: message, error } = await admin.from("whatsapp_messages").select("id,media_object_id,provider_media")
    .eq("id", messageId).eq("instance_identity", "curemed").single();
  if (error || !message) throw new InboxError("message_not_found", 404);
  let objectId = message.media_object_id;
  if (!objectId) {
    if (!message.provider_media) throw new InboxError("media_unavailable", 404);
    const download = await provider("download", { message: message.provider_media, convertToMp4: false });
    if (!isPlainObject(download) || typeof download.base64 !== "string" || typeof download.mimetype !== "string") throw new InboxError("media_unavailable", 502);
    objectId = await storeInboxMedia(admin, { encoded: download.base64, mime: download.mimetype,
      fileName: String(download.fileName ?? "attachment"), actorId: null });
    const { error: attachError } = await admin.from("whatsapp_messages").update({ media_object_id: objectId }).eq("id", message.id);
    if (attachError) throw new InboxError("storage_unavailable", 503);
  }
  const { data: media, error: mediaError } = await admin.from("whatsapp_media_objects").select("object_path,mime_type,file_name")
    .eq("id", objectId).eq("instance_identity", "curemed").single();
  if (mediaError || !media) throw new InboxError("media_unavailable", 404);
  const { data: signed, error: signError } = await admin.storage.from("whatsapp-media").createSignedUrl(media.object_path, 600);
  if (signError || !signed) throw new InboxError("media_unavailable", 503);
  return { url: browserReachableUrl(signed.signedUrl, publicOrigin), mime: media.mime_type, fileName: media.file_name };
}
