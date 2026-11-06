import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type EvolutionInboxClient, InboxError } from "../_shared/evolution-inbox.ts";
import { isPlainObject } from "../_shared/evolution-pairing.ts";
import { readBoundedBytes } from "../_shared/evolution-pairing-io.ts";
import { browserReachableUrl, inboxDigest } from "./media.ts";

/** WhatsApp lets people change their picture; a week-old check (including "no picture") is refreshed. */
const AVATAR_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
/** Provider lookups per request; the caller asks again while `pending` is true. */
const AVATAR_REFRESHES_PER_CALL = 6;
const AVATAR_MAX_BYTES = 1024 * 1024;
const AVATAR_URL_TTL_SECONDS = 3600;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Profile pictures are only ever downloaded from WhatsApp's picture CDN. */
const AVATAR_HOST = "pps.whatsapp.net";

type AvatarChat = { id: string; remote_jid: string | null; normalized_phone: string | null;
  avatar_object_path: string | null; avatar_checked_at: string | null };

type AvatarFetch = (url: string, init: RequestInit) => Promise<Response>;

async function downloadAvatar(admin: SupabaseClient, url: string, fetchImpl: AvatarFetch) {
  const source = URL.canParse(url) ? new URL(url) : null;
  if (source?.protocol !== "https:" || source.hostname !== AVATAR_HOST) return null;
  const signal = AbortSignal.timeout(5_000);
  const response = await fetchImpl(source.toString(), { redirect: "error", signal });
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!response.ok || !AVATAR_TYPES.has(mime)) {
    void response.body?.cancel().catch(() => {});
    return null;
  }
  const bytes = await readBoundedBytes(response.body, AVATAR_MAX_BYTES, response.headers.get("content-length"), signal);
  if (bytes.length === 0) return null;
  const path = `curemed/avatars/${await inboxDigest(bytes)}`;
  const { error } = await admin.storage.from("whatsapp-media").upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw new InboxError("media_storage_unavailable", 503);
  return path;
}

/** Looks the picture up again and records the outcome; a provider failure leaves the old picture in place. */
async function refreshAvatar(admin: SupabaseClient, provider: EvolutionInboxClient, chat: AvatarChat, fetchImpl: AvatarFetch) {
  // An @lid chat has a picture only under its full jid; bare digits answer "no picture".
  const answer = await provider("avatar", { number: chat.remote_jid ?? `${chat.normalized_phone}@s.whatsapp.net` });
  const url = isPlainObject(answer) && typeof answer.profilePictureUrl === "string" ? answer.profilePictureUrl : null;
  const path = url ? await downloadAvatar(admin, url, fetchImpl) : null;
  const { error } = await admin.from("whatsapp_chats").update({ avatar_object_path: path, avatar_checked_at: new Date().toISOString() })
    .eq("id", chat.id).eq("instance_identity", "curemed");
  if (error) throw new InboxError("storage_unavailable", 503);
  chat.avatar_object_path = path;
}

/** Signed, browser-reachable URL per stored picture path. */
async function signedAvatarUrls(admin: SupabaseClient, paths: string[], publicOrigin: string) {
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  const { data: signed, error } = await admin.storage.from("whatsapp-media").createSignedUrls(paths, AVATAR_URL_TTL_SECONDS);
  if (error || !signed) throw new InboxError("media_unavailable", 503);
  for (const entry of signed) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, browserReachableUrl(entry.signedUrl, publicOrigin));
  }
  return urls;
}

/**
 * Browser-reachable picture URLs for the given chats (null when a chat has none), refreshing at most a
 * few stale chats per call. `pending` tells the caller that more stale chats are left to refresh.
 */
export async function getInboxAvatars(admin: SupabaseClient, provider: EvolutionInboxClient, chatIds: string[],
  options: { publicOrigin: string; fetchImpl?: AvatarFetch }) {
  const { data, error } = await admin.from("whatsapp_chats").select("id,remote_jid,normalized_phone,avatar_object_path,avatar_checked_at")
    .eq("instance_identity", "curemed").in("id", chatIds);
  if (error || !data) throw new InboxError("storage_unavailable", 503);
  const chats = data as AvatarChat[];
  const now = Date.now();
  const stale = chats.filter(chat => !chat.avatar_checked_at || now - Date.parse(chat.avatar_checked_at) > AVATAR_RECHECK_MS);
  const batch = stale.slice(0, AVATAR_REFRESHES_PER_CALL);
  const outcomes = await Promise.allSettled(batch.map(chat => refreshAvatar(admin, provider, chat, options.fetchImpl ?? fetch)));
  const paths = chats.map(chat => chat.avatar_object_path).filter((path): path is string => !!path);
  const urls = await signedAvatarUrls(admin, paths, options.publicOrigin);
  const avatars = Object.fromEntries(chats.map(chat => [chat.id, chat.avatar_object_path ? urls.get(chat.avatar_object_path) ?? null : null]));
  // When every lookup failed (for example a closed session), asking again at once would only repeat them.
  const progressed = outcomes.some(outcome => outcome.status === "fulfilled");
  return { avatars, pending: progressed && stale.length > batch.length };
}
