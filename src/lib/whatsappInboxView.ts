import type { Lang } from "@/lib/i18n";
import type { ChatPreview, WhatsAppChat, WhatsAppMessage } from "@/lib/whatsappInbox";

/** Intl tag for inbox dates: Kuwaiti Arabic with Latin digits, or day-first English. */
export function inboxLocaleTag(lang: Lang): string {
  return lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB";
}

/** `+<digits>` for a chat with a known number; `@lid` chats have none and must not fake one. */
export function chatPhone(chat: Pick<WhatsAppChat, "normalized_phone">): string | null {
  return chat.normalized_phone ? `+${chat.normalized_phone}` : null;
}

/** Name shown for a chat: its contact name, else its number, else the caller's fallback label. */
export function chatTitle(chat: Pick<WhatsAppChat, "display_name" | "normalized_phone">, fallback: string): string {
  return chat.display_name.trim() || chatPhone(chat) || fallback;
}

/**
 * Up to two initials of the contact name for the avatar, else the last two digits of the chat address.
 *
 * `Array.from` keeps a name that starts with an emoji or another astral character whole instead of
 * cutting its surrogate pair in half.
 */
export function chatInitials(chat: Pick<WhatsAppChat, "display_name" | "normalized_phone" | "remote_jid">): string {
  const name = chat.display_name.trim();
  if (name) return name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? "").join("").toUpperCase();
  const address = chat.normalized_phone ?? chat.remote_jid?.split("@")[0] ?? "";
  return address.slice(-2) || "#";
}

/** WhatsApp-style list time: the clock time for today, otherwise the short date. */
export function lastMessageTime(value: string | null, lang: Lang, now: Date = new Date()): string {
  if (!value) return "";
  const date = new Date(value);
  const tag = inboxLocaleTag(lang);
  return date.toDateString() === now.toDateString()
    ? new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
}

export type DayGroup = { day: string; date: Date; rows: WhatsAppMessage[] };

/**
 * Groups chronologically ordered messages under one separator per calendar day.
 *
 * The day is the viewer's local day, not the UTC date in `sent_at`: in Kuwait (UTC+3) a message
 * sent at 01:00 is stamped with the previous UTC date and would land under yesterday's separator.
 */
export function groupByDay(messages: WhatsAppMessage[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of messages) {
    const date = new Date(row.sent_at);
    const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const last = groups[groups.length - 1];
    if (last?.day === day) last.rows.push(row);
    else groups.push({ day, date, rows: [row] });
  }
  return groups;
}

export type MediaKind = "image" | "video" | "audio" | "pdf" | "document";
type MediaMessage = Pick<WhatsAppMessage, "message_type" | "provider_media">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * File name and MIME type WhatsApp sent with an attachment, read from the stored provider payload.
 *
 * Synced and webhook messages keep the original `<type>Message` object, so the name and type are
 * known before the file itself is fetched. Messages without that payload return nulls.
 */
export function providerMediaMeta(message: MediaMessage): { fileName: string | null; mimeType: string | null } {
  const content = isRecord(message.provider_media) && isRecord(message.provider_media.message) ? message.provider_media.message : null;
  const payload = content?.[`${message.message_type}Message`] ?? content?.stickerMessage;
  if (!isRecord(payload)) return { fileName: null, mimeType: null };
  return { fileName: nonEmpty(payload.fileName), mimeType: nonEmpty(payload.mimetype) };
}

/** WhatsApp carries GIF playback on video messages and stickers as animated WebP. */
export function isGifPlayback(message: MediaMessage): boolean {
  if (!isRecord(message.provider_media) || !isRecord(message.provider_media.message)) return false;
  const video = message.provider_media.message.videoMessage;
  return isRecord(video) && video.gifPlayback === true;
}

function isPdfMime(mimeType: string): boolean {
  return mimeType.split(";")[0].trim().toLowerCase() === "application/pdf";
}

/**
 * Chooses how an attachment renders. A known MIME type decides between a PDF preview and a
 * download chip; without one, a nameless document or a `.pdf` name is treated as a PDF candidate
 * and the type returned with the fetched file settles it.
 */
export function resolveMediaKind(message: MediaMessage, fetchedMimeType?: string | null): MediaKind | null {
  if (message.message_type === "image" || message.message_type === "video" || message.message_type === "audio") {
    return message.message_type;
  }
  if (message.message_type !== "document") return null;
  const meta = providerMediaMeta(message);
  const mimeType = fetchedMimeType ?? meta.mimeType;
  if (mimeType) return isPdfMime(mimeType) ? "pdf" : "document";
  return !meta.fileName || meta.fileName.toLowerCase().endsWith(".pdf") ? "pdf" : "document";
}

/** CSS `aspect-ratio` from a video's natural size, or null while the size is unknown or degenerate. */
export function toAspectRatio(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return `${width} / ${height}`;
}

/** Translation key that labels a message with no text in the chat list. */
const PREVIEW_KEYS: Record<WhatsAppMessage["message_type"], string> = {
  text: "admin.whatsapp.unsupported",
  unsupported: "admin.whatsapp.unsupported",
  image: "admin.whatsapp.preview.image",
  video: "admin.whatsapp.preview.video",
  audio: "admin.whatsapp.preview.audio",
  document: "admin.whatsapp.preview.document",
};

/** One-line preview of a chat's last message: its first text line, or a label for a deletion or an attachment. */
export function previewText(preview: Pick<ChatPreview, "body" | "message_type" | "deleted">, t: (key: string) => string): string {
  if (preview.deleted) return t("admin.whatsapp.deletedMessage");
  const firstLine = preview.body.trim().split("\n")[0];
  return firstLine || t(PREVIEW_KEYS[preview.message_type]);
}

/** Mirrors the server's revoke window (`REVOKE_WINDOW_MS` in the whatsapp-inbox function), which stays authoritative. */
const REVOKE_WINDOW_MS = 60 * 60 * 60 * 1000;

/** Whether "delete for everyone" is offered: only for our own messages, once, and within WhatsApp's window. */
export function canDeleteForEveryone(message: Pick<WhatsAppMessage, "direction" | "sent_at" | "remote_deleted_at">, now = Date.now()): boolean {
  return message.direction === "outbound" && !message.remote_deleted_at && now - Date.parse(message.sent_at) < REVOKE_WINDOW_MS;
}

const FORWARDABLE_MEDIA = new Set<WhatsAppMessage["message_type"]>(["image", "video", "audio", "document"]);

/** Mirrors the server's forward rules: text with content, or an attachment, and never a deleted message. */
export function canForward(message: Pick<WhatsAppMessage, "message_type" | "body" | "remote_deleted_at">): boolean {
  if (message.remote_deleted_at) return false;
  return message.message_type === "text" ? message.body.trim() !== "" : FORWARDABLE_MEDIA.has(message.message_type);
}

/**
 * Digits of a number typed into the contact form. A bare 8-digit number is a Kuwaiti one, the format
 * checkout stores, so it gains the 965 country code; the server still checks the result.
 */
export function normalizeContactPhone(input: string): string {
  const digits = input.replace(/\D/g, "").replace(/^00/, "");
  return digits.length === 8 ? `965${digits}` : digits;
}

/** Splits `items` into consecutive slices of at most `size` items. */
export function chunk<T>(items: T[], size: number): T[][] {
  const slices: T[][] = [];
  for (let start = 0; start < items.length; start += size) slices.push(items.slice(start, start + size));
  return slices;
}
