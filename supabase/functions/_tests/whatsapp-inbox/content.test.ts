import { assertEquals } from "jsr:@std/assert@1.0.19";
import { inboxIgnoredId, inboxMessage } from "../../_shared/evolution-inbox.ts";

// Synthetic Evolution records shaped after Baileys' WAProto field names; no customer data.
const key = { remoteJid: "96550000001@s.whatsapp.net", id: "content-1", fromMe: false };
const record = (message: Record<string, unknown>) => ({ key, messageTimestamp: 1793872800, message });
const vcard = (...lines: string[]) => ["BEGIN:VCARD", "VERSION:3.0", ...lines, "END:VCARD"].join("\n");
const contextInfo = { messageContextInfo: { deviceListMetadataVersion: 2 } };
const button = (displayText: string) => ({ quickReplyButton: { displayText, id: displayText } });

type Expected = { message_type: string; body: string } | null;

const cases: [string, Record<string, unknown>, Expected][] = [
  // Behaviour that existed before this change.
  ["plain text", { conversation: "Hello" }, { message_type: "text", body: "Hello" }],
  ["text sent with key-exchange bookkeeping", { conversation: "Hi", senderKeyDistributionMessage: { groupId: "x" }, ...contextInfo },
    { message_type: "text", body: "Hi" }],
  ["sticker", { stickerMessage: { mimetype: "image/webp" } }, { message_type: "image", body: "" }],
  ["captioned image", { imageMessage: { mimetype: "image/jpeg", caption: "Rx" } }, { message_type: "image", body: "Rx" }],
  ["reaction", { reactionMessage: { text: "❤️", key: { id: "original" } } }, { message_type: "text", body: "❤️" }],
  ["empty message", {}, { message_type: "unsupported", body: "" }],
  ["unknown kind stays visible", { pollUpdateMessage: { vote: {} } }, { message_type: "unsupported", body: "" }],

  // Album children carry their image inside a wrapper.
  ["album child image", { associatedChildMessage: { message: { imageMessage: { mimetype: "image/jpeg", caption: "1/2" } } } },
    { message_type: "image", body: "1/2" }],

  // Shared contacts.
  ["contact with WhatsApp id", { contactMessage: { displayName: "Ahmad",
    vcard: vcard("FN:Ahmad", "item1.TEL;waid=96550000002:+965 5000 0002", "item1.X-ABLabel:Mobile") } },
    { message_type: "text", body: "👤 Ahmad\n+96550000002" }],
  ["contact without display name or WhatsApp id", { contactMessage: { vcard: vcard("FN:Sara", "TEL;type=CELL:+965 5000 0003",
    "TEL;type=WORK:+965 2200 0000") } }, { message_type: "text", body: "👤 Sara\n+965 5000 0003\n+965 2200 0000" }],
  ["several contacts", { contactsArrayMessage: { displayName: "2 contacts", contacts: [
    { displayName: "A", vcard: vcard("TEL;waid=96550000004:+965 5000 0004") },
    { displayName: "B", vcard: vcard("TEL;waid=96550000005:+965 5000 0005") },
  ] } }, { message_type: "text", body: "👤 A\n+96550000004\n\n👤 B\n+96550000005" }],
  ["contact with nothing readable", { contactMessage: { vcard: vcard() } }, { message_type: "unsupported", body: "" }],

  // Business and interactive messages.
  ["hydrated template", { templateMessage: { hydratedTemplate: { hydratedTitleText: "Order", hydratedContentText: "Shipped",
    hydratedFooterText: "CureMed", hydratedButtons: [button("Track"), { urlButton: { displayText: "Open", url: "https://example.test" } }] } } },
    { message_type: "text", body: "Order\nShipped\nCureMed\nTrack\nOpen" }],
  ["four-row hydrated template", { templateMessage: { hydratedFourRowTemplate: { hydratedContentText: "Your code is 1234" } } },
    { message_type: "text", body: "Your code is 1234" }],
  ["unhydrated template", { templateMessage: { fourRowTemplate: { content: { namespace: "ns", elementName: "otp" } } } },
    { message_type: "unsupported", body: "" }],
  ["buttons", { buttonsMessage: { contentText: "Confirm?", footerText: "Reply below",
    buttons: [{ buttonId: "y", buttonText: { displayText: "Yes" } }, { buttonId: "n", buttonText: { displayText: "No" } }] } },
    { message_type: "text", body: "Confirm?\nReply below\nYes\nNo" }],
  ["interactive with native flow buttons", { interactiveMessage: { header: { title: "Offer" }, body: { text: "20% off" },
    footer: { text: "Today" }, nativeFlowMessage: { buttons: [{ name: "quick_reply", buttonParamsJson: "{\"display_text\":\"Claim\"}" },
      { name: "cta_url", buttonParamsJson: "not json" }] } } },
    { message_type: "text", body: "Offer\n20% off\nToday\nClaim" }],
  ["list", { listMessage: { title: "Menu", description: "Pick one", buttonText: "Open menu", footerText: "Thanks",
    sections: [{ title: "Main", rows: [{ title: "Vitamins", rowId: "1" }, { title: "Skin care", rowId: "2" }] }] } },
    { message_type: "text", body: "Menu\nPick one\n• Vitamins\n• Skin care\nThanks\nOpen menu" }],
  ["button reply", { buttonsResponseMessage: { selectedButtonId: "y", selectedDisplayText: "Yes" } }, { message_type: "text", body: "Yes" }],
  ["template button reply", { templateButtonReplyMessage: { selectedId: "t", selectedDisplayText: "Track" } },
    { message_type: "text", body: "Track" }],
  ["list reply", { listResponseMessage: { title: "Vitamins", singleSelectReply: { selectedRowId: "1" } } },
    { message_type: "text", body: "Vitamins" }],

  // Locations and polls.
  ["location", { locationMessage: { degreesLatitude: 29.33, degreesLongitude: 48.07, name: "Clinic", address: "Salmiya" } },
    { message_type: "text", body: "📍 Clinic\nSalmiya\nhttps://maps.google.com/?q=29.33,48.07" }],
  ["live location with out-of-range coordinates", { liveLocationMessage: { degreesLatitude: 200, degreesLongitude: 48, caption: "On my way" } },
    { message_type: "text", body: "📍 On my way" }],
  ["poll", { pollCreationMessageV3: { name: "Best time?", options: [{ optionName: "Morning" }, { optionName: "Evening" }] } },
    { message_type: "text", body: "📊 Best time?\n• Morning\n• Evening" }],

  // Bookkeeping never becomes a bubble.
  ["ephemeral setting", { protocolMessage: { type: 3, ephemeralExpiration: 86400 } }, null],
  ["revoke envelope", { protocolMessage: { type: "REVOKE", key: { id: "m-1" } } }, null],
  ["edit as a protocol message", { protocolMessage: { type: 14, key: { id: "m-1" }, editedMessage: { conversation: "Fixed" } } }, null],
  ["edit wrapper", { editedMessage: { message: { protocolMessage: { type: 14, editedMessage: { conversation: "Fixed" } } } } }, null],
  ["album header", { albumMessage: { expectedImageCount: 2 }, ...contextInfo }, null],
  ["placeholder", { placeholderMessage: { type: 0 } }, null],
  ["key exchange only", { senderKeyDistributionMessage: { groupId: "x" } }, null],
  ["context info only", contextInfo, null],
  ["bookkeeping next to empty fields", { conversation: null, protocolMessage: { type: 3 } }, null],
  ["bookkeeping inside a disappearing-message wrapper", { ephemeralMessage: { message: { protocolMessage: { type: 3 } } } }, null],
];

Deno.test("each Evolution message kind becomes the expected bubble, or none", () => {
  for (const [name, message, expected] of cases) {
    const row = inboxMessage(record(message), true);
    assertEquals(row && { message_type: row.message_type, body: row.body }, expected, name);
    assertEquals(inboxIgnoredId(record(message)), expected === null ? key.id : null, name);
  }
});

Deno.test("shared contacts keep their names and numbers as structured details", () => {
  const row = inboxMessage(record({ contactMessage: { displayName: "Ahmad", vcard: vcard("TEL;waid=96550000002:+965 5000 0002") } }), false);
  assertEquals(row?.provider_media, { contacts: [{ name: "Ahmad", phones: ["+96550000002"] }] });
});

Deno.test("an album child keeps the download payload of the image it wraps", () => {
  const image = { mimetype: "image/jpeg", directPath: "/fixture-album-child" };
  const row = inboxMessage(record({ associatedChildMessage: { message: { imageMessage: image } } }), false);
  assertEquals(row?.provider_media, { key, message: { imageMessage: image } });
});

Deno.test("a large shared-contact list stays within the 4096-character body limit", () => {
  const contacts = Array.from({ length: 60 }, (_, index) =>
    ({ displayName: "N".repeat(200), vcard: vcard(`TEL;waid=9655${String(index).padStart(7, "0")}:x`) }));
  const row = inboxMessage(record({ contactsArrayMessage: { contacts } }), false);
  assertEquals(row?.message_type, "text");
  assertEquals(Array.from(row?.body ?? "").length, 4096);
});

Deno.test("bookkeeping from an identity the inbox cannot address is invalid, not ignored", () => {
  const group = { key: { ...key, remoteJid: "12345@g.us" }, messageTimestamp: 1793872800, message: { protocolMessage: { type: 3 } } };
  assertEquals(inboxIgnoredId(group), null);
  assertEquals(inboxMessage(group, false), null);
  assertEquals(inboxIgnoredId({ ...record({ protocolMessage: { type: 3 } }), key: { ...key, id: "" } }), null);
});
