import { EVOLUTION_ALLOWED_ORIGIN, EVOLUTION_INSTANCE, isPlainObject, readBoundedText } from "./evolution-pairing.ts";

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
        ...(method === "POST" ? { body: JSON.stringify(payload ?? {}) } : {}), redirect: "error", signal,
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
  const alternate = key.remoteJidAlt ?? raw.remoteJidAlt ?? raw.senderPn;
  const phoneJid = jid.endsWith("@s.whatsapp.net") ? jid : alternate;
  const phone = typeof phoneJid === "string" && /^[1-9]\d{7,14}@s\.whatsapp\.net$/.test(phoneJid)
    ? phoneJid.split("@")[0] : null;
  return { remote_jid: jid, normalized_phone: phone,
    display_name: String((key.fromMe === true ? undefined : raw.pushName) ?? raw.name ?? raw.notify ?? "").slice(0, 200) };
}

export function inboxMessage(raw: unknown, countUnread: boolean) {
  const identity = inboxIdentity(raw);
  if (!identity || !isPlainObject(raw) || !isPlainObject(raw.key) || typeof raw.key.id !== "string") return null;
  if (!raw.key.id || raw.key.id.length > 250) return null;
  let message = isPlainObject(raw.message) ? raw.message : {};
  for (const wrapper of ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2"]) {
    const nested = message[wrapper];
    if (isPlainObject(nested) && isPlainObject(nested.message)) message = nested.message;
  }
  const mediaType = ["image", "audio", "video", "document"].find(kind => isPlainObject(message[`${kind}Message`]));
  const media = mediaType ? message[`${mediaType}Message`] as Record<string, unknown> : null;
  const extended = isPlainObject(message.extendedTextMessage) ? message.extendedTextMessage.text : null;
  const body = Array.from(String(message.conversation ?? extended ?? media?.caption ?? "")).slice(0, 4096).join("");
  const timestamp = isPlainObject(raw.messageTimestamp) ? raw.messageTimestamp.low : raw.messageTimestamp;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 253402300799) return null;
  return { ...identity, provider_message_id: raw.key.id, direction: raw.key.fromMe === true ? "outbound" : "inbound",
    message_type: mediaType ?? (body ? "text" : "unsupported"), body, sent_at: new Date(seconds * 1000).toISOString(),
    count_unread: countUnread, provider_media: media ? { key: { id: raw.key.id, remoteJid: identity.remote_jid, fromMe: raw.key.fromMe === true },
      message: { [`${mediaType}Message`]: media } } : null };
}

export function inboxAck(raw: unknown): "accepted" | "delivered" | "read" | "rejected" | null {
  const status = String(raw).toUpperCase();
  if (["READ", "PLAYED", "4", "5"].includes(status)) return "read";
  if (["DELIVERY_ACK", "3"].includes(status)) return "delivered";
  if (["ERROR", "0"].includes(status)) return "rejected";
  if (["SERVER_ACK", "2"].includes(status)) return "accepted";
  return null;
}
