# Shared first-success payment owner

Status: local SQL foundation, application handlers are not connected. No production application migration, activation, merge, shipment or message operation has been performed by this checkpoint.

Both integrations use `private.wa_payment_outcomes` as their single first-success owner. The `wa_` prefix is retained to match the reviewed WhatsApp contract; Shipa does not create a second payment outcome. Applying the schema leaves existing order/payment/settings writers unchanged. New writers refuse to run until explicit app-phase retention activation.

## Attestation and identity

`wa_record_provider_payment_outcome(order_id, attempt_id, provider_status_json, source)` is service-only. The HTTP adapter must derive its arguments from a verified MyFatoorah signature or authenticated provider GET, rather than forwarding a browser document. SQL independently binds the server-created attempt to its invoice, order UUID, positive amount and KWD currency. An ambiguous invoice mapping is rejected. Guest-writable order payment references never select the canonical attempt.

The exact status document contains `invoice_id`, `external_identifier`, `transaction_payment_id`, `invoice_status`, `transaction_status` and `details`. A `verified_callback` additionally requires integer `amount_millis` and `currency`; `admin_verification` requires those plus a real admin `actor_id`. The endpoint must verify that actor through `auth.getUser()` and the actual role, and derive it server-side. The SQL role lookup is an additional defense, not authentication of a browser-supplied UUID. A `signed_webhook` cannot supply unsigned amount fields as evidence.

Only the existing allowlisted payment detail fields are accepted: invoice reference, transaction/reference/track IDs, payment method, card brand/last four, and safe payment error code/message. Unknown fields and invalid shapes fail before order mutation. Raw provider documents and credentials are never copied into the policy snapshot.

## Two separate transactions

The status transaction returns exactly:

```text
outcome_id          nullable for non-success
owner_snapshot     nullable until first success
changed            whether the protected order payment writer ran
payment_status
order_status
verification_pending
```

Only the first success-mapped result creates an outcome. Failed and pending attempts do not occupy its slot. A successful replacement attempt after failure can own the order. Existing paid/refunded/partially-refunded states cannot be downgraded; fulfilment states other than `new` are preserved. Historical paid, cancelled and admin-reverified orders are marked manual-only.

The first outcome retains the canonical attempt/invoice/transaction plus immutable WhatsApp owner/provider/settings/audience/template facts and Shipa environment/mode/decision facts. Replays return the same owner even if configuration changes. Invalid WhatsApp configuration remains a visible snapshot error and does not roll back an otherwise valid signed paid status. The email claim remains outside this transaction and must keep its existing independent behavior during handler wiring.

A signed paid result can commit while provider GET is unavailable. It creates one durable `wa_pending_payment_verifications` row for the canonical tuple. Duplicate status calls do not reset its age, attempt budget, lease or terminal state. An earlier unbound signed tuple can acquire the now-proven order/attempt/outcome binding without losing that recovery history.

`wa_read_payment_owner(order_id, outcome_id_or_null)` returns only the service-owned canonical identity, snapshot and expansion status. The browser has no execution privilege on it.

Strict GET evidence belongs to the separate `wa_apply_verified_payment` transaction. This checkpoint does **not** implement that transaction, GET claim/retry actor, recipient expansion, shipment enqueue or submission. A first-success Shipa snapshot decision of `enqueued` means the recorded automatic policy was eligible at capture; it is not an assertion that a shipment queue row exists. Operational APIs must report actual queue rows separately. These dependencies must be implemented before activation or feature acceptance.

Under WhatsApp cutover 0, the status outcome is sufficient for the legacy notification path; strict GET must not delay or repeat that send. Under cutover 1, a durable notification event requires strict GET evidence. No code may choose another owner by rereading later settings. First-success facts do not authorize a historical paid-order sweep.

## Activation, locks and rollback

`integration_activate_payment_retention(actor_id)` is service-only and requires a real admin. It serializes on the same advisory lock as WhatsApp retention activation, then locks WhatsApp settings before Shipa settings. It activates the existing 19 WhatsApp retention links and five shared invoice/Shipa receipt links, only while the new stores are quiescent. Rerunning a completed activation is idempotent. It does not enable either integration.

Status calls lock WhatsApp settings → Shipa settings → order → attempt → first-success inputs → canonical pending tuple. For automatic Shipa capture, existing integrity checks also take product/item locks and a broad coupon-table SHARE lock. That lock blocks unrelated coupon writes too. Transactions must remain short, contain no HTTP, and perform no later coupon write. The final assembled lock review and contention tests remain mandatory.

The invoice-binding table preserves the first stored amount/currency/attempt identity. Its constraints protect retained history after activation. Deployed legacy attempt writers still need a reviewed, quiesced app-phase transition and protection against concurrent invoice reassignment/duplicate insertion. Local callback/webhook contention is not a production-wide guarantee while old writers remain active.

Rollback before activation leaves the new tables and functions unused. After activation, disable new dispatch and retain audit/payment history and restrictive links; do not delete payment outcomes or lift retention to make a code revert easier. The final app rollback must also preserve the reviewed WhatsApp compatibility mirror and export unsent/uncertain work. This foundation is not a replacement for that release runbook.

## Reproducible local proof

The assembled harness includes the existing guarded fixture and pinned PostgreSQL image. It accepts only a marker-owned local disposable Docker database, never a database URL. The schema-only reference is private and hash checked; it contains no production rows. The harness restores that disposable database and must not be pointed at an ordinary developer or production database.

```powershell
python supabase/tests/whatsapp/fixture_safety_test.py
python supabase/tests/shipa/payment_owner_proof.py --state <private-fixture-state.json> --baseline <private-schema-only-baseline.sql>
```

The proof covers absent and pre-existing `private` schema, adversarial default privileges, two schema applications, unchanged pre-existing owners/ACL/defaults/constraints/triggers/policies, the retained WhatsApp SQL fixtures, actual-role owner scenarios, and a forced callback/webhook lock collision with one first-success result and one replay. It proves database behavior only. It does not execute Deno handlers, MyFatoorah, Shipa or WhatsApp, or claim a deployed journey.
