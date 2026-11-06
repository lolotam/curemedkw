# WhatsApp inbox: profile pictures, message deletion and chat previews

This change adds contact profile pictures, deleting messages (for this inbox only, or for everyone), and a last-message preview kept on each chat row. It is prepared locally. It does not constitute production SQL, merge, deployment or customer-message acceptance.

## Behavior

- **Profile pictures.** The `avatars.get` action of `whatsapp-inbox` accepts up to 50 chat ids per call.
  - It looks up at most 6 chats per call whose picture was never checked, or was last checked more than 7 days ago. It uses `chat/fetchProfilePictureUrl` with the chat's full `remote_jid`.
  - It downloads pictures only over HTTPS from `pps.whatsapp.net`, with redirects refused, a 5 second timeout and a 1 MiB cap. Only JPEG, PNG and WebP are accepted.
  - The bytes are stored in the private `whatsapp-media` bucket under `curemed/avatars/<sha256>`. The action returns signed URLs valid for one hour, on the public storage origin.
  - "No picture" is recorded too, so it is not looked up again within the 7 days. A failed lookup leaves the previous picture in place.
  - `pending` stays true only while stale chats remain and the last round made progress. The browser asks again every 5 seconds while it is true.
- **Delete for me** (`message.delete`, scope `local`) hides a message in this inbox only. The row and its content are kept, with `locally_deleted_at` set. The thread query excludes such rows.
- **Delete for everyone** (scope `everyone`) is limited to outbound messages that are less than 60 hours old and not already revoked.
  - It first sends `DELETE chat/deleteMessageForEveryone` to Evolution. Only after Evolution accepts does it set `remote_deleted_at` and clear the body, the provider media payload and the media link.
  - Customer messages, expired messages and repeats are refused with `409` without contacting Evolution.
  - If Evolution accepts the revoke but the database write fails, a retry sends the revoke again. Evolution's answer to a repeated revoke is unverified.
- **Deletes made on a phone** are applied in each shape Evolution may use:
  - a `messages.delete` event (a key, or `{ keys: [...] }`)
  - a `REVOKE` protocol message inside `messages.upsert`, including inside disappearing or view-once wrappers
  - a `DELETED` status inside `messages.update`

  A revoke for a message that has not been ingested yet is ignored. `webhook.ensure` now also subscribes to `MESSAGES_DELETE`.
- **Chat previews.** `whatsapp_chats.last_message_preview` is a jsonb summary of the message `last_message_id` points at: body (first 160 characters, or empty once deleted), type, direction, ack state and `deleted`.
  - A trigger refreshes it whenever `last_message_id` moves (ingest, send echo, LID merge).
  - A second trigger refreshes it when that message's ack, body or deletion changes.
  - The migration backfills existing chats. The chat list no longer issues a second query for previews.
- Media of a message deleted for everyone is no longer served (`media_unavailable`).

## Schema

One migration, `20261106000100_whatsapp_inbox_features.sql`, inventoried in `curemed-schema-20261106.json` (23 migrations). The November 5 inventory remains immutable.

- It adds `whatsapp_chats.avatar_checked_at` and `whatsapp_chats.last_message_preview`.
- It grants `service_role` update on `avatar_object_path` and `avatar_checked_at` only.
- It adds the two preview triggers, `wa_delete_inbox_message` (admin actor required) and `wa_apply_remote_revoke`. Both functions are executable by `service_role` only.
- It is safe to re-apply.

The app prerequisite gate now requires all 23 checksums.

## Production cutover

The order from `curemed-inbox-shipa-20261105.md` applies unchanged:

1. Pause all four deployment triggers.
2. Merge.
3. Apply and record the migration through the controlled schema process.
4. Deliver the Edge code (`whatsapp-inbox`, `whatsapp-pairing-webhook`, `_shared`).
5. Re-enable the triggers after verification.

After delivery, run `webhook.ensure` once (Sync in the Direct API tab) so Evolution starts sending `MESSAGES_DELETE`. It never resets, logs out or re-pairs the `curemed` session.

## Verification limits

- **SQL** was verified on the disposable fixture: all 23 migrations applied, then the last two re-applied. It proves previews on ingest, late history and acks; local and for-everyone deletion rules; phone revokes; the backfill trigger branch; the column-level grant; and that `authenticated` cannot execute either function.
- **Deno tests** cover:
  - each revoke shape
  - delete ordering and refusals, including that the revoke is sent as a `DELETE` with a body
  - the picture host restriction and the `pending` rule
  - webhook acceptance of `messages.delete`
- **Vitest** covers the deleted placeholder, the delete-scope dialog and the 60-hour offer rule.

These are not proof of WhatsApp-side revoke delivery, picture availability for every contact, or the exact `messages.delete` payload Evolution 2.3.7 forwards.
