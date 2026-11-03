# Shipa dispatch-result state subset

Dependency update, 2026-11-04: shared first-success/strict evidence SQL and receipt-owned automatic/manual intents are now implemented locally. See `shared-payment-owner-contract.md` and `shipa-intent-rpc-contract.md`. Submission begin, its final durable marker/worker and end-to-end runtime remain unfinished. The sections below retain the original state/result checkpoint and its proof boundaries.

2026-11-03. Locally tested state/result dependency, not a complete dispatch implementation. This migration does not create a payment receipt writer, enqueue/manual-request writer, submission owner, status poller, reconciliation endpoint or scheduler. No code can infer permission to book from these objects alone.

## Ownership and schema

`private.order_payment_verifications` holds the eventual immutable first-success receipt/dispatch decision, bound to an outcome, order, attempt, invoice/payment, integer KWD millis and source. Browser and service_role direct table access is revoked. Only a later trusted payment-owner function may write real receipts. Fixture-owner inserts are synthetic test setup and do not prove payment validation.

`public.shipments` retains a unique order/provider/environment intent and unique merchant reference per integration/environment. Its states are queued, submitting, created, rejected, needs_review and unknown. In-flight/unknown/created rows retain token, attempt count, payload/hash, configuration revision, exact credential fingerprint and timing. A provider reference is unique per integration/environment. Attempts/retry counts are bounded and are never reset by result handling. Created means provider-accepted booking, not delivered.

`public.shipment_events` records only known event types, fixed internal codes, current attempt identity and an idempotent event key. No raw provider body, credential or arbitrary error text is accepted. Admins can read shipments/events through RLS; other customers/guests cannot. Service mutations must use wrappers.

Foreign keys refer only to newly created integration/receipt/shipment tables in this schema phase. References to existing orders/payment attempts and their deletion-retention behavior are a required later application-phase dependency, not installed or claimed by this migration. No existing table trigger/constraint is changed by schema application.

## Implemented service-only wrappers

```text
shipa_complete(_shipment_id uuid, _attempt_token uuid, _result jsonb) -> safe summary
shipa_expire_leases(_shipment_id uuid | SQL null = null) -> {expired,more_due}
shipa_read_shipment(_shipment_id uuid, _actor_id uuid) -> safe summary | SQL null (MUTATING)
```

All wrappers revoke browser execution. The first two are internal worker operations; later endpoint authorization must distinguish real scheduler/service invocations from browser calls. `shipa_read_shipment` is a MUTATING operation: it expires a targeted lease before returning a summary, and is not a read-only operational/health probe. Call it through the authorized POST RPC path, not a GET/head health check. It requires a nonnull shipment id and cannot invoke the global sweep by omitting that id.

The supplied actor UUID is not authentication. The service endpoint must obtain the user's identity from a verified `auth.getUser` result and real role lookup, then supply that service-derived id. It must reject browser actor/id authority fields; looking up whether an arbitrary browser-supplied UUID belongs to an admin is insufficient. SQL independently rechecks the supplied actor's admin row, but that does not prove the HTTP caller is that actor. Full handler identity-provenance tests remain a required endpoint dependency and are not claimed by the SQL role fixture.

Safe summary keys: shipment_id, state, changed, conflict, shipa_ref, provider_status, attempt_count, retry_count, retry_at, last_error_code, updated_at. Read adds order_id, environment, source, customer_ref, created_at, reviewed_fingerprint and input_fingerprint. It does not return payloads or credentials. `changed` describes shipment state/metadata, not whether a conflict audit was inserted.

## Exact result contract

- Accepted: exactly `{outcome:'accepted',shipaRef:<safe nonempty reference>,orderStatus:<bounded string or null>}`.
- Uncertain: exactly `{outcome:'uncertain',code:<one of the current ShipaFailureCode values>}`.
- Local rejection: exactly `{outcome:'rejected_local',code:<one of the current ShipaLocalRejectionCode values>}`. Strip the adapter's UI field/message members before invoking this internal RPC. The adapter reports zero fetch for that particular validation call; this does not prove that the persisted attempt never dispatched. A matching token or service_role alone provides no such evidence.

The row is locked before mutation, and the token must equal its current attempt. A stale token returns40001/shipa_stale_attempt. Accepted from submitting/unknown records the reference once; an identical replay is unchanged. A later ambiguous observation cannot displace known acceptance. A conflicting accepted reference retains the known reference and records an alert. A reference already owned by a different shipment leaves this attempt unknown with remote_reference_conflict, not queued or stranded by an unhandled unique violation.

Uncertain results become unknown with no retry time. Exact replay does not append another event. Once a submission marker exists, local validation results cannot establish non-dispatch. For submitting plus rejected_local, SQL records unknown/no_dispatch_unproven and a fixed conflict audit. For unknown plus rejected_local, it preserves the original uncertainty, timestamp, token, payload, counters and null retry time; it only records an idempotent conflict audit. It never turns either case into needs_review/new creation authority. A known created result remains created.

| Persisted state | Incoming observation | Disposition |
| --- | --- | --- |
| submitting | rejected_local | unknown; no retry; non-dispatch remains unproven |
| unknown after network uncertainty or expiry | rejected_local, including replay | unknown remains sticky; original uncertainty and attempt context retained |
| created | rejected_local or uncertain | created unchanged |
| submitting/unknown | matching accepted reference | created, subject to reference-conflict protection |
| before submission marker | local validation failure | A later dedicated validation/enqueue owner may hold for review before any dispatch; shipa_complete provides no such pre-marker transition |

No provider no-creation/retry guarantee exists in the captured contract, so this subset implements no provider-driven retry authorization. Later conclusive reconciliation must obey the recorded vendor evidence and current token, rather than infer absence from404. Manual review alone may not requeue any possibly dispatched attempt; enqueue/begin predicates must inspect durable submission/reconciliation evidence rather than use needs_review or a local-error code as permission to create again.

Expiry processes at most100expired submitting rows per invocation under FOR UPDATE SKIP LOCKED, retains token/payload/counters, makes them unknown, and reports remaining due work. Re-running the sweep does not requeue or duplicate expired events. A late matching accepted result remains recordable after expiry.

## Actual local proof and remaining requirements

`supabase/tests/shipa/dispatch_state.sql` passed actual anon/non-admin/service-role denial tests, current-token fencing, accepted/unknown replay, terminal acceptance preservation, conflicting remote identities, zero automatic rebooking, retained unknown context and bounded100+5expiry with106lease events including the targeted read. SA's follow-up regression first failed on expiry-to-local-rejection; after the fix it proves sticky unknown for both expired and network-uncertain attempts, no retry/creation authority, retained original error/outcome and idempotent local-result audit. It also checks submitting-to-local-rejection is conservative unknown. The migration remains unapplied in production and unfrozen; these changes supersede the earlier c04ed418 source contract, not its immutable historical review receipt.

Manager's guarded exact-image proof applied both Shipa migrations twice with private absent and twice with a preexisting private schema/permissive fixture grants, preserving baseline owners/ACLs/defaults/constraints/triggers/policies. Two competing settings writers produced one commit/one conflict. Two competing result writers were forced to contend on the same row: one state change, one idempotent result and one event. The final terminal-ambiguity regression failed before correction and passed after applying the corrected function. These are local database tests, not provider or end-to-end booking proof.

The manager proof currently imports the existing marker-guarded WhatsApp fixture module and lives under the task's temporary artifacts. The committed, self-contained assembled fixture/harness remains a pre-PR deliverable. No production SQL, customer data, HTTP booking, message, deployment or merge was used here.

Required next dependencies remain: one trusted payment outcome owner and GET evidence; immutable first-success policy; retention activation; authoritative integrity/payload fingerprinting; manual approval/enqueue; atomic begin-submission and credential/configuration race gates; safe credential rotation/removal with pending attempts; provider reconciliation/status; scheduler/endpoint auth; admin UI and complete journey acceptance. Full SQL freeze and operational readiness remain unproven.
