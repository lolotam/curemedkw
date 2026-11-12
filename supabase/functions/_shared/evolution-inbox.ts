import { EVOLUTION_ALLOWED_ORIGIN, EVOLUTION_INSTANCE, isPlainObject, readBoundedText } from "./evolution-pairing.ts";
import { structuredContent } from "./evolution-inbox-text.ts";

const paths = {
  status: ["GET", "instance/connectionState"],
  webhook: ["POST", "webhook/set"],
  webhookStatus: ["GET", "webhook/find"],
  contacts: ["POST", "chat/findContacts"],
  chats: ["POST", "chat/findChats"],
  messages: ["POST", "chat/findMessages"],
  text: ["POST", "message/sendText"],
  media: ["POST", "message/sendMedia"],
  audio: ["POST", "message/sendWhatsAppAudio"],
  download: ["POST", "chat/getBase64FromMediaMessage"],
  avatar: ["POST", "chat/fetchProfilePictureUrl"],
  revoke: ["DELETE", "chat/deleteMessageForEveryone"],
} as const;

export class InboxError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

export function createEvolutionInboxClient(config: { origin: string; apiKey: string; fetchImpl?: typeof fetch }) {
  if (config.origin.replace(/\/$/, "") !== EVOLUTION_ALLOWED_ORIGIN || !config.apiKey.trim()) {
    throw new InboxError("not_configured", 503);
  }
  return async (action: keyof typeof paths, payload?: unknown): Promise<unknown> => {
    const [method, path] = paths[action];
    const signal = AbortSignal.timeout(15_000);
    try {
      const response = await (config.fetchImpl ?? fetch)(`${EVOLUTION_ALLOWED_ORIGIN}/${path}/${EVOLUTION_INSTANCE}`, {
        method, headers: { ["apikey"]: config.apiKey, "Content-Type": "application/json" },
        ...(method === "GET" ? {} : { body: JSON.stringify(payload ?? {}) }), redirect: "error", signal,
      });
      if (!response.ok) throw new InboxError("provider_unavailable", 502);
      const text = await readBoundedText(response.body, action === "download" ? 15_000_000 : 4_194_304,
        response.headers.get("content-length"), signal);
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof InboxError) throw error;
      throw new InboxError("provider_unavailable", 502);
    }
  };
}
export type EvolutionInboxClient = ReturnType<typeof createEvolutionInboxClient>;

export function inboxIdentity(raw: unknown) {
  if (!isPlainObject(raw)) return null;
  const key = isPlainObject(raw.key) ? raw.key : raw;
  const jid = key.remoteJid ?? raw.remoteJid ?? raw.id;
  if (typeof jid !== "string" || !/^\d{5,30}@(s\.whatsapp\.net|lid)$/.test(jid)) return null;
  const alternate = key.remoteJidAlt ?? raw.remoteJidAlt ?? key.senderPn ?? raw.senderPn;
  // The alternate jid lets SQL resolve a lid chat and its phone-jid chat to one alias set.
  const alt = typeof alternate === "string" && alternate !== jid && /^\d{5,30}@(s\.whatsapp\.net|lid)$/.test(alternate)
    ? alternate : undefined;
  const phoneJid = jid.endsWith("@s.whatsapp.net") ? jid : alt;
  const phone = typeof phoneJid === "string" && /^[1-9]\d{7,14}@s\.whatsapp\.net$/.test(phoneJid)
    ? phoneJid.split("@")[0] : null;
  return { remote_jid: jid, ...(alt === undefined ? {} : { remoteJidAlt: alt }), normalized_phone: phone,
    display_name: String((key.fromMe === true ? undefined : raw.pushName) ?? raw.name ?? raw.notify ?? "").slice(0, 200) };
}

/** Unwraps the containers WhatsApp puts around disappearing, view-once and album-child content. */
function innerMessage(raw: Record<string, unknown>) {
  let message = isPlainObject(raw.message) ? raw.message : {};
  for (let depth = 0; depth < 8; depth++) {
    const wrapper = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension", "documentWithCaptionMessage",
      "associatedChildMessage"].map(key => message[key]).find(value => isPlainObject(value) && isPlainObject(value.message));
    if (!isPlainObject(wrapper) || !isPlainObject(wrapper.message)) break;
    message = wrapper.message;
  }
  return message;
}

/** The id a "delete for everyone" protocol message revokes, or null for any other message. */
export function inboxRevokedId(raw: unknown): string | null {
  if (!isPlainObject(raw)) return null;
  const protocol = innerMessage(raw).protocolMessage;
  if (!isPlainObject(protocol) || !["REVOKE", 0, "0"].includes(protocol.type as string | number)) return null;
  const id = isPlainObject(protocol.key) ? protocol.key.id : null;
  return typeof id === "string" && id.length >= 1 && id.length <= 250 ? id : null;
}

/** Bookkeeping WhatsApp stores as messages: protocol notices and edits, album headers, placeholders, key exchange. */
const NEVER_A_BUBBLE = new Set(["protocolMessage", "editedMessage", "albumMessage", "placeholderMessage",
  "senderKeyDistributionMessage", "messageContextInfo"]);

/** True when the message holds bookkeeping only; any other content, known or not, still gets a bubble. */
function isNeverABubble(message: Record<string, unknown>) {
  const kinds = Object.keys(message).filter(kind => message[kind] != null);
  return kinds.length > 0 && kinds.every(kind => NEVER_A_BUBBLE.has(kind));
}

/** A record with a valid inbox identity and provider id, with its content unwrapped. */
function inboxRecord(raw: unknown) {
  const identity = inboxIdentity(raw);
  if (!identity || !isPlainObject(raw) || !isPlainObject(raw.key)) return null;
  const id = raw.key.id;
  if (typeof id !== "string" || !id || id.length > 250) return null;
  return { raw, id, fromMe: raw.key.fromMe === true, identity, message: innerMessage(raw) };
}

/**
 * The id of a valid record that must never render as a chat bubble, or null for any other record.
 * `inboxMessage` skips exactly these records, so callers can tell them apart from invalid ones.
 */
export function inboxIgnoredId(raw: unknown): string | null {
  const record = inboxRecord(raw);
  return record && isNeverABubble(record.message) ? record.id : null;
}

/**
 * Normalize an Evolution message for ingestion, retaining native attachment payloads
 * for later downloads. Invalid identities or timestamps, and bookkeeping records
 * (see `inboxIgnoredId`), are excluded from the batch.
 */
export function inboxMessage(raw: unknown, countUnread: boolean) {
  const record = inboxRecord(raw);
  if (!record || isNeverABubble(record.message)) return null;
  const { id, fromMe, identity, message } = record;
  const mediaType = ["image", "audio", "video", "document", "sticker"].find(kind => isPlainObject(message[`${kind}Message`]));
  const media = mediaType ? message[`${mediaType}Message`] as Record<string, unknown> : null;
  const extended = isPlainObject(message.extendedTextMessage) ? message.extendedTextMessage.text : null;
  const reaction = isPlainObject(message.reactionMessage) ? message.reactionMessage : null;
  const structured = media ? null : structuredContent(message);
  const body = Array.from(String(message.conversation ?? extended ?? media?.caption ?? structured?.body ?? reaction?.text ?? ""))
    .slice(0, 4096).join("");
  const timestamp = isPlainObject(record.raw.messageTimestamp) ? record.raw.messageTimestamp.low : record.raw.messageTimestamp;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 253402300799) return null;
  const details = structured?.provider_media ?? (reaction && body ? { reaction: { text: body } } : null);
  return { ...identity, provider_message_id: id, direction: fromMe ? "outbound" : "inbound",
    message_type: mediaType === "sticker" ? "image" : mediaType ?? (body ? "text" : "unsupported"), body, sent_at: new Date(seconds * 1000).toISOString(),
    count_unread: countUnread, provider_media: media ? { key: { id, remoteJid: identity.remote_jid, fromMe },
      message: { [`${mediaType}Message`]: media } } : details };
}

export function inboxAck(raw: unknown): "accepted" | "delivered" | "read" | "rejected" | null {
  const status = String(raw).toUpperCase();
  if (["READ", "PLAYED", "4", "5"].includes(status)) return "read";
  if (["DELIVERY_ACK", "3"].includes(status)) return "delivered";
  if (["ERROR", "0"].includes(status)) return "rejected";
  if (["SERVER_ACK", "2"].includes(status)) return "accepted";
  return null;
}
