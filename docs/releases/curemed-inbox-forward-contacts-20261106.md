# WhatsApp inbox: message forwarding and contact editing

This change adds forwarding a message to another chat and a Contacts tab for editing contacts. It is prepared locally. It does not constitute production SQL, merge, deployment or customer-message acceptance.

## Behavior

- **Forward** (`message.forward` with `messageId`, `chatId` and `requestId`) sends a copy of an existing message to another chat as a new message through the ordinary send path.
  - A text message is sent as its text. A refusal comes back when the text is blank.
  - An image, video, voice message or document is sent as its stored attachment with its caption. When the attachment has not been fetched yet, it is downloaded from Evolution first and stored, as `media.get` does.
  - A message deleted for everyone, a blank text and an unsupported message are refused with `409 forward_not_supported` before Evolution is contacted.
  - The caller's `requestId` reserves the send. The inbox keeps one `requestId` per target chat while the dialog is open, so pressing Forward again after an unclear failure is refused by the server instead of sending a second copy.
  - The message's own chat is not offered as a target.
- **Contacts tab.** The inbox sidebar has Chats and Contacts tabs. Contacts are read directly by admins, up to 200 per search, matched on name, business name or number.
- **Contact edit** (`contact.update` with `contactId` and `patch`):
  - Name, business name, email and notes are always editable. Only changed fields are sent.
  - A phone number can be attached only to a contact that has none and has an `@lid` address. The number is stored on the contact, and on its chat when the chat has no number.
  - Once a contact has a number it cannot be changed (`phone_locked`). A number already held by another contact or chat is refused (`phone_in_use`), so chats are never merged or moved from the inbox.
  - A number that fails `^[1-9][0-9]{7,14}$` is refused (`invalid_phone`). The form turns a bare 8-digit number into a Kuwaiti one (`965` prefix), the format checkout stores.
  - An edited name is also written to the contact's chat. Incoming messages already leave a non-empty chat name alone.
  - An edited name now also survives Sync. Before this change, an address-book name from Sync replaced the contact name.

## Schema

One migration, `20261106000200_whatsapp_contact_edit.sql`, inventoried in `curemed-schema-20261106b.json` (24 migrations). The earlier November 6 inventory remains immutable.

- It adds `whatsapp_contacts.name_edited_at`.
- It adds the trigger `whatsapp_contact_keep_edited_name`. Once `name_edited_at` is set, only an update that also changes it can change `display_name`. Ingest and Sync never touch that column, so they cannot overwrite an edited name.
- It adds `wa_update_inbox_contact(contact_id, patch, actor_id)`.
  - It requires an admin actor.
  - It returns `{ok: false, code}` for refusals and `{ok: true, contact}` on success.
  - It maps a concurrent unique violation to `phone_in_use`.
  - It is executable by `service_role` only.
- It is safe to re-apply.

The app prerequisite gate now requires all 24 checksums.

## Production cutover

The order from `curemed-inbox-shipa-20261105.md` applies unchanged:

1. Pause all four deployment triggers.
2. Merge.
3. Apply and record the migration through the controlled schema process.
4. Deliver the Edge code (`whatsapp-inbox`; `_shared` is unchanged).
5. Re-enable the triggers after Dokploy's code directory is on the new `main`.

No webhook change is needed.

## Verification limits

- **SQL** was verified on the disposable fixture: all 24 migrations applied, then the last two re-applied. It proves:
  - profile edits
  - the chat rename
  - that ingest and Sync keep an edited name, while an unedited contact still takes the address-book name
  - attaching a free number to an `@lid` contact without changing the chat set
  - `phone_in_use`, `phone_locked`, `invalid_phone`, `invalid_contact_patch` and `contact_not_found`
  - the non-admin refusal, and that `authenticated` cannot execute the function
- **Deno tests** cover:
  - an image forward sent through `sendMedia` with base64, MIME type, file name and caption, under the caller's request id and target chat
  - a text forward through `sendText`
  - the refusals that make no Evolution call
  - the contact refusal-code mapping
- **Vitest** covers:
  - the forward picker and the same-request-id retry
  - the forward rules
  - phone normalization
  - the contact form sending only changed fields
  - the hidden number field for contacts that have one
  - the refusal messages

These are not proof that WhatsApp delivers a forwarded attachment of every type and size, or that the owner of an attached number is the person behind the `@lid` chat. Attaching a number is an operator's assertion.
