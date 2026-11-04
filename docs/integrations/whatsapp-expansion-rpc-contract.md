# Paid WhatsApp expansion and approved corrections

Migration `20261103002000_whatsapp_expansion.sql` turns recorded paid ownership into immutable recipient jobs. It does not claim a job, contact a provider, activate the integration or modify deployed legacy payment writers. It changes only new feature objects. The shared first-success owner remains the source of truth for WhatsApp and Shipa.

Durable ownership requires the same strict GET evidence already bound by the shared payment owner. `private.integration_verified_event` inserts the event/input revision and invokes expansion inside its strict transaction. The nested expansion block rolls back partial job inserts on recognized validation/resource failures and records `enqueue_failed`; signed paid status is already committed separately. Unexpected database errors still propagate. An old event is repaired from its recorded input revision without a new provider GET.

Legacy cutover-0 ownership uses `wa_repair_legacy_outcome` after transaction 1, without strict GET evidence or a durable event. Identity is `(outcome_id, audience, normalized_recipient, rendered_content_hash)`. First success, not a request UUID, owns this job set. A lost inline nudge is recoverable: the bounded due list includes untouched pending/failed legacy outcomes as well as scheduled transient repairs. A deterministic failure leaves the list after its first classification, rather than spinning indefinitely.

## Service-only operations

| RPC | Behavior |
| --- | --- |
| `wa_repair_event(event_id, actor_kind, actor_id)` | Locks and expands/repairs the existing durable event; returns the existing set on replay. |
| `wa_repair_legacy_outcome(outcome_id, actor_kind, actor_id)` | Initial legacy expansion or bounded repair of that same immutable successful outcome. |
| `wa_correct_event_expansion(event_id, expected_input_revision, approved_settings_revision, reason, actor_id)` | Real admin, current newer settings revision, same provider/account, failed event and never-attempted jobs required. Appends one approved input revision and re-expands. |
| `wa_list_due_expansions(limit=25)` | Read-only, maximum 100, oldest due work first across durable and legacy classes. Listing is not a lease, claim or send authorization. Repair rechecks due/budget under the target lock. |

Repair actors are exactly `admin` with a real admin row, or `worker` with null actor ID. These SQL checks do not authenticate an HTTP caller; future routes must derive actor kind/ID from verified session or worker credentials. Browser execution and direct private helper execution are revoked, including under permissive defaults.

Repair/correction returns `outcome_id`, nullable `event_id`, `state`, `safe_reason`, nullable `input_revision`, `repair_attempt_count`, `next_repair_at`, `summary`, `job_ids`. Job IDs identify only this recorded set and do not authorize sending. Summary contains job/unique-recipient/coalesced counts and fixed audience warnings, or a fixed failure code. No body, key, ciphertext, arbitrary upstream error or caller facts are returned.

## Rendering, overlap and failures

The SQL renderer is shared with preview. Recipient normalization and settings/template validation use existing private validators. The buyer uses the immutable first-success phone. An absent/invalid buyer phone emits a fixed visible warning; valid admin/custom jobs continue. Empty enabled admin/custom lists also produce warnings. The cap is 50 unique normalized phones including the buyer across audiences, even when templates differ. Different rendered content to the same phone remains separate; identical durable phone/content coalesces and unions audience labels. Legacy paid jobs retain their audience identity. SHA256 is over SQL-rendered UTF-8 content, never a JavaScript serialization/hash.

Original order/buyer/amount/payment/provider/account/ownership facts never change. Current provider/account changes park new old-account work instead of rerouting it. An explicit current durable integration/automation pause parks jobs; stale scheduler heartbeat is not an enqueue gate. Legacy expansion has no automation/heartbeat dependency. Later claim must still recheck current class-specific enablement, account, cancellation/refund and readiness.

An unresolved recorded provider account yields visible `provider_account_unresolved`, with no job. A later configured account cannot fill that missing identity. Existing configured legacy credentials/account must be identified through the agreed migration/activation procedure before the new legacy delivery path activates; the baseline path remains necessary until that sequence is satisfied. This migration supplies no hidden rebinding or historical-owner creation.

Manual/historical, disabled-at-first-success, cancelled/refunded or more-than-24-hour-old owner work is skipped. Validation failures require an explicit corrected revision, not scheduler retries. Recognized serialization/deadlock/lock/resource failures receive a one-minute initial delay, then five minutes between repairs, at most three repairs. Exhaustion records `expansion_repair_exhausted`, clears due time and requires review. Failure never authorizes a provider retry.

Invalid configuration no longer masquerades as an intentional disable: the first-success snapshot preserves its configured integration/automation switches while withholding invalid configuration and recording `notification_configuration_invalid`. This permits an approved recipient/template correction of an eligible failed event. Truly disabled snapshots remain disabled. No pre-existing owner is rewritten or promoted.

## Correction and locking

Correction accepts no arbitrary corrected JSON. It re-derives only recipient/template fields from the current validated settings, preserves original enablement/owner/facts/provider/account and writes append-only `wa_event_input_revisions` audit with actor/reason. A stale expected revision conflicts. A changed provider/account, attempted job, token, provider ID, delivery-attempt row or active-account reference refuses correction. Only never-attempted queued jobs may be rebuilt; original owner/input revision remains retained.

Expansion takes settings SHARE then event/outcome lock; it neither locks an order nor reserves an account slot. Correction takes settings SHARE, the applicable account row, event, then jobs in ID order. Future claims must take account before event/outcome before jobs, and may inspect cancellation/refund without locking the order. No transaction performs HTTP. The existing Shipa coupon-table SHARE contention cost remains a separate part of the shared-payment transaction and its final assembled lock-order review.

## Evidence boundary

Actual-role SQL fixtures exercise owner/evidence creation, coalescing versus distinct content, invalid/missing buyer warning, 50-phone total cap, legacy no-GET identity, unresolved identity, explicit pause/provider switch, cancellation, partial-insert rollback, bounded repairs, lost-nudge recovery and approved correction without fact/history mutation. A simulated SQLSTATE `40P01` tests transient classification; it is not an actual deadlock receipt. The harness separately forces two corrections to contend on the same event: one revision/job set wins, the stale correction conflicts and a repair replay preserves it.

Claims/finish/acknowledgments, delivery leases, manual/test/shipped message enqueue, runtime/admin UI, payment endpoint/sweep/writer integration, scheduler, final Astra and approved release/native proofs remain unfinished. Ministry hold and separate production migration/merge/live-operation gates remain unchanged.
