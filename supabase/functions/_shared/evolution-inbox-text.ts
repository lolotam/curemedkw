import { isPlainObject } from "./evolution-pairing.ts";

type Content = Record<string, unknown>;

/** Readable body for WhatsApp content that carries no attachment, plus structured details worth keeping. */
export type StructuredContent = { body: string; provider_media?: Record<string, unknown> };

const MAX_SHARED_CONTACTS = 50;
const MAX_CONTACT_PHONES = 20;
const MAX_CONTACT_NAME = 200;

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Content => isPlainObject(value) ? value : {};
const list = (value: unknown): Content[] => Array.isArray(value) ? value.filter(isPlainObject) : [];
const lines = (...parts: string[]) => parts.filter(Boolean).join("\n");
const bullets = (items: string[]) => items.filter(Boolean).map(item => `• ${item}`);

/** vCard lines with folded continuations joined, split into property name, parameters and value. */
function vcardProperties(vcard: string) {
  return vcard.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).flatMap(line => {
    const separator = line.indexOf(":");
    if (separator < 0) return [];
    const [name, ...params] = line.slice(0, separator).split(";");
    // "item1.TEL" carries an Apple group prefix in front of the property name.
    return [{ name: name.replace(/^[^.]*\./, "").toUpperCase(), params, value: line.slice(separator + 1).trim() }];
  });
}

function contactCard(contact: Content) {
  const properties = vcardProperties(text(contact.vcard));
  const phones = properties.filter(property => property.name === "TEL").map(property => {
    // waid is the number's WhatsApp id, free of the spacing and labels people type into TEL values.
    const waid = property.params.map(param => /^waid=(\d{5,20})$/i.exec(param.trim())?.[1]).find(Boolean);
    return waid ? `+${waid}` : property.value;
  }).filter(Boolean);
  const name = text(contact.displayName) || properties.find(property => property.name === "FN")?.value || "";
  // Cut on code points: a split surrogate pair is invalid in the jsonb column that stores these details.
  return { name: Array.from(name).slice(0, MAX_CONTACT_NAME).join(""), phones: [...new Set(phones)].slice(0, MAX_CONTACT_PHONES) };
}

function sharedContacts(contacts: Content[]): StructuredContent | null {
  const cards = contacts.slice(0, MAX_SHARED_CONTACTS).map(contactCard).filter(card => card.name || card.phones.length);
  if (!cards.length) return null;
  return { body: cards.map(card => lines(`👤 ${card.name}`.trim(), ...card.phones)).join("\n\n"), provider_media: { contacts: cards } };
}

function hydratedTemplate(template: Content) {
  const buttons = list(template.hydratedButtons)
    .map(button => text(record(button.quickReplyButton ?? button.urlButton ?? button.callButton).displayText));
  return lines(text(template.hydratedTitleText), text(template.hydratedContentText), text(template.hydratedFooterText), ...buttons);
}

function nativeFlowLabel(button: Content) {
  try {
    return text(record(JSON.parse(String(button.buttonParamsJson))).display_text);
  } catch (error) {
    if (error instanceof SyntaxError) return "";
    throw error;
  }
}

function mapLink(location: Content) {
  const { degreesLatitude: lat, degreesLongitude: lng } = location;
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) return "";
  return `https://maps.google.com/?q=${lat},${lng}`;
}

function location(content: Content) {
  const body = lines(text(content.name), text(content.address), text(content.caption), mapLink(content));
  return body ? `📍 ${body}` : "";
}

function poll(content: Content) {
  const options = bullets(list(content.options).map(option => text(option.optionName)));
  const question = text(content.name);
  return question || options.length ? lines(`📊 ${question}`.trim(), ...options) : "";
}

/** Business, interactive, location and poll messages reduced to the text a person sees on the phone. */
const TEXT_READERS: Record<string, (content: Content) => string> = {
  templateMessage: content => hydratedTemplate(record(content.hydratedTemplate)) || hydratedTemplate(record(content.hydratedFourRowTemplate)),
  buttonsMessage: content => lines(text(content.text), text(content.contentText), text(content.footerText),
    ...list(content.buttons).map(button => text(record(button.buttonText).displayText))),
  interactiveMessage: content => lines(text(record(content.header).title), text(record(content.header).subtitle),
    text(record(content.body).text), text(record(content.footer).text), ...list(record(content.nativeFlowMessage).buttons).map(nativeFlowLabel)),
  listMessage: content => lines(text(content.title), text(content.description),
    ...bullets(list(content.sections).flatMap(section => list(section.rows).map(row => text(row.title)))),
    text(content.footerText), text(content.buttonText)),
  buttonsResponseMessage: content => text(content.selectedDisplayText),
  templateButtonReplyMessage: content => text(content.selectedDisplayText),
  listResponseMessage: content => lines(text(content.title), text(content.description)),
  interactiveResponseMessage: content => text(record(content.body).text),
  locationMessage: location,
  liveLocationMessage: location,
  pollCreationMessage: poll,
  pollCreationMessageV2: poll,
  pollCreationMessageV3: poll,
};

/** The readable form of a non-media message kind the inbox has no bubble for, or null when there is none. */
export function structuredContent(message: Content): StructuredContent | null {
  if (isPlainObject(message.contactMessage)) return sharedContacts([message.contactMessage]);
  if (isPlainObject(message.contactsArrayMessage)) return sharedContacts(list(message.contactsArrayMessage.contacts));
  const kind = Object.keys(TEXT_READERS).find(key => isPlainObject(message[key]));
  const body = kind ? TEXT_READERS[kind](message[kind] as Content) : "";
  return body ? { body } : null;
}
