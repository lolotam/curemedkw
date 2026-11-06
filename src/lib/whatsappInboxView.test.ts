// Kuwait is UTC+3 all year: local midnight differs from the UTC date, which day grouping must respect.
process.env.TZ = "Asia/Kuwait";

import { describe, expect, it } from "vitest";
import type { WhatsAppChat, WhatsAppMessage } from "@/lib/whatsappInbox";
import {
  canDeleteForEveryone, chatInitials, chatPhone, chatTitle, chunk, groupByDay, lastMessageTime, previewText, providerMediaMeta, resolveMediaKind, toAspectRatio,
} from "./whatsappInboxView";

const chat = (overrides: Partial<WhatsAppChat>): WhatsAppChat => ({
  id: "chat-1", instance_identity: "curemed", normalized_phone: "96550000000", remote_jid: "96550000000@s.whatsapp.net",
  display_name: "", last_message_at: null, last_message_id: null, unread_count: 0, last_message_preview: null, ...overrides,
});
const lidChat = chat({ normalized_phone: null, remote_jid: "123456789012345@lid" });

const message = (overrides: Partial<WhatsAppMessage>): WhatsAppMessage => ({
  id: "m-1", chat_id: "chat-1", instance_identity: "curemed", provider_message_id: "P1", direction: "inbound",
  message_type: "text", body: "", sent_at: "2026-11-05T10:00:00.000Z", ack_state: "accepted", media_object_id: null,
  remote_deleted_at: null, ...overrides,
});
const documentWith = (payload: Record<string, unknown>) =>
  message({ message_type: "document", provider_media: { key: { id: "P1" }, message: { documentMessage: payload } } });

describe("chat identity", () => {
  it("titles a chat by contact name, then by its number, and never invents a number for an @lid chat", () => {
    expect(chatTitle(chat({ display_name: "  Sara Ali " }), "WhatsApp contact")).toBe("Sara Ali");
    expect(chatTitle(chat({}), "WhatsApp contact")).toBe("+96550000000");
    expect(chatTitle(lidChat, "WhatsApp contact")).toBe("WhatsApp contact");
    expect(chatPhone(lidChat)).toBeNull();
  });

  it("takes the first letter of the first two name words, keeping an emoji whole", () => {
    expect(chatInitials(chat({ display_name: "sara ali hassan" }))).toBe("SA");
    expect(chatInitials(chat({ display_name: "محمد أحمد" }))).toBe("مأ");
    expect(chatInitials(chat({ display_name: "😀 Team" }))).toBe("😀T");
  });

  it("falls back to the last two digits of the number, or of the @lid address", () => {
    expect(chatInitials(chat({}))).toBe("00");
    expect(chatInitials(lidChat)).toBe("45");
  });
});

describe("lastMessageTime", () => {
  const now = new Date("2026-11-05T12:00:00.000Z");
  it("shows the clock time for a message from today and the short date otherwise", () => {
    expect(lastMessageTime("2026-11-05T06:30:00.000Z", "en", now)).toBe("09:30");
    expect(lastMessageTime("2026-11-01T06:30:00.000Z", "en", now)).toBe("01/11/26");
  });

  it("uses Latin digits in Arabic and shows nothing for a chat without messages", () => {
    expect(lastMessageTime("2026-11-01T06:30:00.000Z", "ar", now)).toMatch(/^[0-9/\s‏]+$/);
    expect(lastMessageTime(null, "en", now)).toBe("");
  });
});

describe("groupByDay", () => {
  it("splits at local midnight even when both messages share a UTC date", () => {
    const lateEvening = message({ id: "a", sent_at: "2026-11-05T20:30:00.000Z" }); // 23:30 in Kuwait
    const afterMidnight = message({ id: "b", sent_at: "2026-11-05T21:10:00.000Z" }); // 00:10 next day in Kuwait
    const groups = groupByDay([lateEvening, afterMidnight]);
    expect(groups.map(group => group.rows.map(row => row.id))).toEqual([["a"], ["b"]]);
    expect(groups[1].date.getDate()).toBe(6);
  });

  it("keeps consecutive messages of the same local day together", () => {
    const groups = groupByDay([message({ id: "a", sent_at: "2026-11-05T05:00:00.000Z" }), message({ id: "b", sent_at: "2026-11-05T18:00:00.000Z" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map(row => row.id)).toEqual(["a", "b"]);
  });
});

describe("attachments", () => {
  it("reads the file name and MIME type WhatsApp sent with the attachment", () => {
    expect(providerMediaMeta(documentWith({ fileName: " invoice.pdf ", mimetype: "application/pdf" })))
      .toEqual({ fileName: "invoice.pdf", mimeType: "application/pdf" });
    expect(providerMediaMeta(message({ message_type: "document", provider_media: null }))).toEqual({ fileName: null, mimeType: null });
    expect(providerMediaMeta(message({ message_type: "document", provider_media: { message: { documentMessage: "oops" } } })))
      .toEqual({ fileName: null, mimeType: null });
  });

  it("lets the MIME type decide between a PDF preview and a download chip, whatever the name says", () => {
    expect(resolveMediaKind(documentWith({ fileName: "scan", mimetype: "application/pdf; charset=binary" }))).toBe("pdf");
    expect(resolveMediaKind(documentWith({ fileName: "fake.pdf", mimetype: "application/zip" }))).toBe("document");
    expect(resolveMediaKind(documentWith({ fileName: "report.docx" }), "application/pdf")).toBe("pdf");
  });

  it("treats a document without a known type as a PDF candidate only when it is nameless or named .pdf", () => {
    expect(resolveMediaKind(documentWith({}))).toBe("pdf");
    expect(resolveMediaKind(documentWith({ fileName: "Contract.PDF" }))).toBe("pdf");
    expect(resolveMediaKind(documentWith({ fileName: "sheet.xlsx" }))).toBe("document");
  });

  it("maps image, video and audio straight through and gives text no attachment view", () => {
    expect(resolveMediaKind(message({ message_type: "image" }))).toBe("image");
    expect(resolveMediaKind(message({ message_type: "audio" }))).toBe("audio");
    expect(resolveMediaKind(message({ message_type: "text" }))).toBeNull();
    expect(resolveMediaKind(message({ message_type: "unsupported" }))).toBeNull();
  });

  it("builds a CSS aspect ratio only from real video dimensions", () => {
    expect(toAspectRatio(1280, 720)).toBe("1280 / 720");
    expect(toAspectRatio(0, 720)).toBeNull();
    expect(toAspectRatio(Number.NaN, 720)).toBeNull();
  });
});

describe("chat list previews", () => {
  const t = (key: string) => `[${key}]`;
  it("shows the first line of the text, or the attachment type when there is no caption", () => {
    expect(previewText({ body: "  Hello\nsecond line", message_type: "text", deleted: false }, t)).toBe("Hello");
    expect(previewText({ body: "", message_type: "image", deleted: false }, t)).toBe("[admin.whatsapp.preview.image]");
    expect(previewText({ body: "See attached", message_type: "document", deleted: false }, t)).toBe("See attached");
    expect(previewText({ body: "", message_type: "unsupported", deleted: false }, t)).toBe("[admin.whatsapp.unsupported]");
  });

  it("labels a deleted last message instead of showing what was left of it", () => {
    expect(previewText({ body: "", message_type: "image", deleted: true }, t)).toBe("[admin.whatsapp.deletedMessage]");
  });

  it("offers delete for everyone only for our own undeleted messages inside the 60-hour window", () => {
    const now = Date.parse("2026-11-08T10:00:00.000Z");
    const sentAt = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();
    const cases: [Partial<WhatsAppMessage>, boolean][] = [
      [{ direction: "outbound", sent_at: sentAt(59.9) }, true],
      [{ direction: "outbound", sent_at: sentAt(60) }, false],
      [{ direction: "inbound", sent_at: sentAt(1) }, false],
      [{ direction: "outbound", sent_at: sentAt(1), remote_deleted_at: sentAt(0) }, false],
    ];
    for (const [overrides, offered] of cases) expect(canDeleteForEveryone(message(overrides), now)).toBe(offered);
  });

  it("batches ids into slices of at most the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 50)).toEqual([]);
  });
});
