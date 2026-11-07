# Order WhatsApp messages

This change adds a WhatsApp tab to the order messages page (`/admin/order-email`). From it, an admin turns on automatic WhatsApp messages to customers, chooses their language, edits their templates and reads a log of recent sends. Messages go out from the WhatsApp number paired in the inbox (Evolution instance `curemed`), so each sent message also appears in the inbox.

The change is prepared locally. It does not constitute production SQL, merge, deployment or customer-message acceptance. It is stacked on PR #34 (`feat/whatsapp-forward-contacts`) and is mergeable only after that PR lands.

## Behavior

There are three messages. Each is sent at most once per order.

| Message | Queued when | Due |
|---|---|---|
| Order confirmation | the order's payment is applied (`apply-payment`) while the tab is enabled | immediately |
| Delivery confirmation | the order's status first becomes `delivered` | immediately |
| Follow-up | the order's status first becomes `delivered` | `follow_up_days` after delivery (default 3, clamped to 1–60) |

- **Enabled switch.** The tab is off by default. While it is on, the Postora `order.paid` message to the customer is not sent; the Postora `admin.new_order` alert to the team and the order email are unchanged. While it is off, the Postora customer message is sent as before, including when the new database function is missing.
- **Per-message switches.** Each message has its own switch, on by default. A queued message whose switch is off when it falls due is recorded as `skipped` with reason `disabled`.
  - When the confirmation switch is off at payment time, no confirmation is queued. The Postora customer message stays stopped while the tab itself is enabled, so the customer gets no confirmation on WhatsApp.
- **Delivery trigger.** The order becomes delivered when an admin sets its status to `delivered`. There is no Shipa webhook. The first transition records `orders.delivered_at`. Marking the order delivered again, after another status, does not queue new messages.
- **Order no longer delivered.** A delivery or follow-up message whose order is no longer `delivered` when it falls due is `skipped` with reason `not_delivered`.
- **Language.** The setting is `order`, `ar` or `en`. `order` follows `orders.language`, which checkout now records from the storefront language. Orders placed before this change have no language and get Arabic.
- **Templates.** Plain text with the placeholders `{{customer_name}}`, `{{order_number}}`, `{{total}}`, `{{currency}}` and `{{order_url}}`.
  - Each message has an Arabic and an English template. A blank template uses the built-in default.
  - An unknown placeholder renders as nothing. Empty lines left behind are collapsed, and the text is capped at 4096 characters.
  - `{{order_url}}` is built from the `storefront_url` of the order email settings; it is empty when that is not set.
  - The preview renders the template with a sample order.
- **Recipient.** The order's `customer_phone`, normalized by the inbox rule (`^[1-9][0-9]{7,14}$`). A number that cannot be normalized is recorded as `skipped` with reason `invalid_phone` and is never sent.
- **Log.** The tab lists the 20 most recently updated rows of `order_whatsapp_messages`, with message, language, recipient, status and the reason for a skip. It is read directly by admins.
- **Saving.** The tab saves its own `site_settings` key, `order_whatsapp`. It cannot overwrite the email settings, which keep their own Save button.
- There is no test-send button.

The page title changed from the email-only title to "Order Messages", with Email and WhatsApp tabs.

## Sending

The `order-whatsapp-dispatch` Edge function sends due messages. A per-minute cron calls it, so a confirmation reaches the customer within about a minute of payment.

1. The caller must present the `x-order-whatsapp-token` header, which is compared in constant time with `ORDER_WHATSAPP_DISPATCH_TOKEN`. A missing or wrong token gets `401` before WhatsApp or the database is touched.
2. When the Evolution session is not `open`, nothing is claimed and messages stay queued.
3. Otherwise it claims up to 10 due messages (`owa_claim_due`; the database caps a claim at 20). Rows are locked with `FOR UPDATE SKIP LOCKED`, so overlapping runs never claim the same message.
4. For each message it renders the template, sends it with `sendText` to `<recipient>@s.whatsapp.net`, and records the outcome with `owa_finish`. It then copies the sent message into the inbox (`wa_ingest_messages`); a failure there does not affect the recorded outcome.
5. A storage failure answers `503 dispatch_unavailable` without echoing database text.

### Message states

`pending` → `sending` → `sent` or `uncertain`; `pending` → `skipped` (with a reason) or `expired`.

- **No retries.** A send that fails or is not confirmed by Evolution is recorded as `uncertain` (`send_uncertain`) and is never sent again, so a customer never receives a duplicate. One failed send does not stop the next message.
- **Stuck sends.** A message left in `sending` for more than 10 minutes (the worker died mid-send) becomes `uncertain` at the next claim.
- **Expiry.** A pending message more than 24 hours past due becomes `expired`, so a long disconnection never ends in a burst of stale messages.
- **Changed delay.** The follow-up's due time is computed at claim from the current `follow_up_days`, so a changed setting applies to follow-ups already queued.
- Delivery and follow-up rows are queued on every first delivery, even while the tab is off. While it stays off, they are recorded as `skipped` (`disabled`) when they fall due, or `expired` if no worker ran for over a day.

## Schema

One migration, `20261106000300_order_whatsapp_messages.sql`, inventoried in `curemed-schema-20261106c.json` (25 migrations). The earlier November 6 inventories remain immutable.

- `orders.language` (`ar`, `en` or null, constraint `orders_language_check`) and `orders.delivered_at`.
- `public.order_whatsapp_messages`: one row per order and message kind (`unique (order_id, kind)`), with status, recipient, language, sent body, reason and the provider message id. RLS is on. Admins can read it. No browser role can write it.
- The trigger `orders_queue_whatsapp_on_delivery` (`BEFORE UPDATE OF order_status`) records `delivered_at` and queues the delivery and follow-up messages.
- `owa_enqueue_confirmation(order_id)`, `owa_claim_due(limit)` and `owa_finish(message_id, status, body, provider_message_id)` are executable by `service_role` only.
- It is safe to re-apply.

The app prerequisite gate now requires all 25 checksums.

**The migration must be applied before the new frontend is published.** Checkout now inserts `orders.language`. A frontend published before the column exists fails every checkout.

## Production cutover

Production is a separate owner decision. The order from `curemed-inbox-shipa-20261105.md` applies:

1. Pause all four deployment triggers and verify they are paused.
2. Merge, after PR #34.
3. Apply and record the migration through the controlled schema process.
4. Deliver the Edge code according to `ops/edge-env.manifest.example.json`: the new `order-whatsapp-dispatch` function, `_shared` (the new `order-whatsapp-template.ts`), and every function that bundles `_shared/apply-payment.ts`: `verify-myfatoorah-payment`, `myfatoorah-webhook` and `shipa-dispatch` (through `_shared/integration-payment.ts`).
5. Add `order-whatsapp-dispatch` to the server-owned `main` router by hand. Never deploy or replace this repository's untracked `supabase/functions/main/`.
6. Obtain `ORDER_WHATSAPP_DISPATCH_TOKEN` through the secret-input mechanism and deliver it through the existing secure environment delivery, never committed files or command arguments. The function also needs `CUREMED_EVOLUTION_URL` and `CUREMED_EVOLUTION_API_KEY`; it never falls back to the Evolution master key.
7. Install `scripts/run-order-whatsapp-dispatch.sh` at `/opt/curemed/run-order-whatsapp-dispatch.sh`. Its curl configuration at `/etc/curemed/order-whatsapp-dispatch.curl` must be root-owned, mode `0600`, a regular non-symlink file, containing the reviewed endpoint and the `x-order-whatsapp-token` header. Schedule `* * * * * /opt/curemed/run-order-whatsapp-dispatch.sh`. The script uses `flock` to prevent overlapping runs. Never echo the configuration or the secret.
8. Publish the frontend, then re-enable the triggers after Dokploy's code directory is on the new `main`.

The tab stays off after the release. Enable it only after the cron is running: an enabled tab stops the Postora customer message, and without the cron the replacement is never sent.

## Rollback

Turning the tab off restores the Postora customer message for new payments. Messages already queued are recorded as `skipped` when they fall due. Stopping the cron stops all sends; queued messages expire after 24 hours. Never replay an `uncertain` message. The migration, its rows and `orders.language` stay in place.

## Verification limits

- **SQL** was verified on the disposable fixture: all 25 migrations applied, then the last two re-applied. It proves:
  - the tab off: no confirmation is queued, and a due delivery message is skipped as `disabled`
  - the confirmation queued once with a normalized number, and an invalid number skipped
  - the claim's language, tokens and templates; no double claim; `owa_finish` succeeding only once
  - an admin marking orders delivered queues two rows each, and marking them delivered again does not
  - Arabic for orders without a language, the `en` override, and `not_delivered` for a cancelled order
  - stale `sending` rows becoming `uncertain`, and overdue rows becoming `expired`
  - a customer reading no rows, browser roles unable to execute the functions, and `authenticated` unable to insert
- **Deno tests** cover the token refusal, the disconnected session, rendering and recording, a failed send becoming `uncertain` without stopping the next one, the storage `503`, the template fallback, and the payment path sending the Postora customer message only while the tab is off.
- **Vitest** covers saving only the `order_whatsapp` key with the delay clamped, the preview with a saved and a default template, and the log's skip reason.

These are not proof that WhatsApp delivers the messages, that a customer's phone number is on WhatsApp, or that the cron runs on the server.
