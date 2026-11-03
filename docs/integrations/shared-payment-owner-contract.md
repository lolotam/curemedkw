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

Strict GET evidence belongs to the separate `wa_apply_verified_payment` transaction, implemented in migration `20261103001400`. It creates one evidence row, one Shipa payment receipt and, under durable ownership only, one WhatsApp event/input revision. Recipient expansion, shipment enqueue/submission and the runtime GET/sweep actor remain outstanding. A first-success Shipa snapshot or payment receipt decision of `enqueued` means the recorded automatic policy was eligible; it does not assert that a shipment queue row exists. Operational APIs must report actual queue rows separately.

Under WhatsApp cutover 0, the status outcome is sufficient for the legacy notification path; strict GET must not delay or repeat that send. Under cutover 1, a durable notification event requires strict GET evidence. No code may choose another owner by rereading later settings. First-success facts do not authorize a historical paid-order sweep.

## Strict evidence and recovery RPCs

`wa_claim_pending_payment_verification(order_id_or_null, worker_id)` takes one due, bound, unresolved signed tuple with `FOR UPDATE SKIP LOCKED`. It increments the common per-tuple GET attempt count, records the worker, and issues a random token/45-second lease. Its transaction must commit before the recovery GET. A second worker can skip that locked tuple and claim another; it cannot share the same lease. Listing never claims and never exposes the token.

`wa_apply_verified_payment(order_id, attempt_id, verified_result_json, source)` takes the same complete attestation as an authenticated callback GET, plus `pending_id` and `lease_token`. Supported source tags are `signed_webhook`, `verified_callback`, `payment_sweep` and `admin_verification`; every source here means a server-authenticated GET result, never the unsigned webhook amount. Admin source also requires a service-derived, verified real admin. The transaction rechecks canonical first-success identity and amount against both the attempt and current/frozen order total, then checks the pending tuple/lease. It returns exactly `evidence_id`, nullable `event_id`, and `expansion_state`.

The durable event initially reports `enqueue_failed`/`expansion_pending` while its recipient-expansion dependency is absent. That visible status is not send success. Disabled, manual/historical, cancelled/refunded or 24-hour-stale outcomes produce skipped events; deterministic bad template configuration requires explicit correction. Under legacy ownership it returns `event_id=null, expansion_state=legacy_owned`, creates no durable event and never schedules the legacy send again. Replays of the same completed lease return the same evidence/event; the completed token is retained for that idempotent receipt.

`wa_resolve_pending_payment_verification(pending_id, lease_token, verified_result_json, terminal_state)` applies successful sweep evidence through that same transaction. For a failed GET, the result is exactly `{code}` from the fixed safe vocabulary. Transient retry uses 1/5/15/30/60-minute delays, with at most six claimed attempts per pending tuple. Deterministic identity/amount mismatch cannot request automatic retry. Exhaustion, an expired sixth claim or stale failed recovery stops at review. Failure clears its lease; an older worker cannot overwrite a subsequent claim. GET is read-only, but these leases do not authorize any message or shipment retry.

No HTTP handler or scheduler currently consumes these RPCs. Initial callback discovery/binding, missing-invoice signed-tuple recording/resolution, authenticated operator recovery after a terminal review state, and the real payment-owned sweep still require implementation and assembled contract tests before SQL freeze. The SQL attempt budget is not proof that the unwired application already enforces a global provider-call budget.

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

The proof covers absent and pre-existing `private` schema, adversarial default privileges, two schema applications, unchanged pre-existing owners/ACL/defaults/constraints/triggers/policies, retained WhatsApp SQL fixtures, actual-role owner/strict-evidence scenarios, forced callback/webhook lock collision, concurrent GET claim skip-locking, and contended strict completions with one evidence/Shipa receipt. It proves database behavior only. It does not execute Deno handlers, MyFatoorah, Shipa or WhatsApp, or claim a deployed journey.
