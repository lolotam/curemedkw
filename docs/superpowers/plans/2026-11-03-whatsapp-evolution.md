> Historical design record (2026-11-03); current behavior is defined by the code on main and docs/integrations/*. All implementation instructions, status assertions, proof receipts and file/symbol references below describe the historical proposal/checkpoint only. They are not current contracts, execution instructions or evidence of deployed state.

# WhatsApp Evolution and Paid-Order Automation Implementation Plan

> **For agentic workers:** Implement this plan task-by-task under the approved Waleed V2 pipeline. MiniMax receives one numbered code/test slice at a time through T3; Codex owns SQL, reviews, validation and commits. Do not invoke another execution workflow or delegate independently.

**Goal:** Deliver the complete applicable Danat WhatsApp experience and paid-order buyer/admin/custom-number automation in CureMed, with selectable Evolution/Postora and a separately approved production rollout.

**Architecture:** CureMed React screens call authenticated Deno Edge Functions. PostgreSQL owns trusted paid-event enqueue, immutable recipient jobs, leases, ingestion and private credentials; one delivery path serves manual messages and automation. A dedicated Evolution stack supplies paired inbox/media operations; Postora remains a selectable text provider.

**Tech Stack:** TypeScript, React 18/Vite/React Router, Tailwind 3/shadcn, Supabase JS, PostgreSQL 15, Deno Web Crypto/fetch, Vitest, Docker and self-hosted Supabase Edge Runtime.

---

## Context and ownership

Approved specification: `docs/superpowers/specs/2026-11-03-whatsapp-evolution-design.md`, user approved 2026-11-03. Draft documents currently reside beneath `F:/Dev/Temp/curemed-whatsapp-evolution/`; they enter the new branch after the four debate rounds.

Target main baseline inspected: `878dde5748548094aab457b54402809d81770668`. Primary checkout has unrelated Shipa commits at `bb494a4dfad8b2de73475e175033aae59f28f061`. Donor parity baseline: `f679f129d110d59dba3183e3c6f161c9a5e63ec6` at `F:/Dev/Projects/Danat-Mostakbal`.

Codex writes plan and SQL. Debater: T3 `claudeAgent`, `claude-opus-5-5`, options `effort=high`, four sequential independent tasks. Code/tests: `acpRegistry_minimax_code`, `m:minimax:MiniMax-M3.1-Flash:v:`. Final independent implementation review: `codex`, `gpt-6-astra`, `reasoningEffort=medium`. No silent substitution; catalog lookup already confirmed these lanes. SQL authorship by Codex was explicitly approved because the skill-preferred Muse lane is disabled.

Terminal state: deployed and verified, including live schema/function/frontend identity, intended gateway/account, scheduler health and approved controlled delivery proof. Production schema, provisioning, scheduler, activation and merge gates remain separate decisions after concrete release preparation. Main pushes/merges can auto-deploy and auto-apply migrations. No CI workflow is authorized.

## Global constraints — quote verbatim in every implementation brief

1. Work only on the numbered task and allowed paths. Do not implement later tasks, commit, push, merge, deploy, apply production SQL, pair WhatsApp or send real messages.
2. Never read .env files, credentials, secrets, private keys, personal memory/config directories or unrelated worktrees. Stop if the manager's initial-checkout sanitation attestation is missing or invalid. No shell-created child worktrees.
3. MiniMax authors code/tests only; Codex authors migrations and SQL fixtures. The manager runs commands, checks every diff and commits exact paths. Do not execute shell/Git/network commands or service/remote MCP actions from an implementation slice; file read/edit tools are allowed only for the explicit allowlist.
4. Preserve unfinished Shipa work, the ministry ordering hold, checkout pricing and existing email configuration/behavior. No historical automatic notification backfill. No unrelated refactors.
5. Use src/integrations/supabase/clientRuntime.ts in changed frontend code; never modify the generated client.ts. Adapt donor TanStack/Node/real-estate imports to CureMed React Router/Deno/user/order types.
6. Secrets remain server-only and encrypted at rest. No credentials in VITE variables, public settings, jobs, raw logs, URLs, command arguments or documents. Never bypass Git secret hooks.
7. Only backend-verified paid events enqueue automation. One active outbound provider; no automatic cross-provider fallback, uncertain resend or false delivered status.
8. Do not replace supabase/functions/main/. New routes/configuration must be additive and proven against the real self-hosted router.
9. Keep new modules focused, preferably below 500 lines. Preserve existing comments and document non-obvious contracts. Tests must prove observable behavior rather than mirror helpers.
10. Report files changed, criteria met and unresolved concerns. State that manager validation is pending; never claim unrun checks passed.

## File and boundary map

| Paths (new unless marked existing) | Responsibility |
| --- | --- |
| `src/lib/whatsapp/{contracts,settings,templates,deliveryPolicy}.ts` | Browser entry point and pure configuration/template/state rules |
| `supabase/functions/_shared/whatsapp/contracts.ts` | Pure shared types/constants, deployed with Edge and reexported by the browser entry point |
| `src/hooks/useWhatsApp{Settings,Inbox,Contacts,Delivery}.ts` | React Query reads/mutations using runtime client |
| `src/pages/admin/AdminWhatsApp.tsx` (existing) | Five-tab WhatsApp route composition |
| `src/components/admin/whatsapp/*` | Ported connection, chat, contact, media, automation and log components |
| `supabase/functions/_shared/whatsapp/{auth,schemas,credentials,evolutionClient,postoraClient,delivery,ingest,chats,media,history,avatars,paymentEvent}.ts` | Focused Deno backend responsibilities |
| `supabase/functions/whatsapp-admin/index.ts` | Admin action router, no direct secret reads in browser |
| `supabase/functions/whatsapp-webhook/index.ts` | Bounded secret-authenticated Evolution events |
| `supabase/functions/reconcile-myfatoorah-payments/index.ts` | Payment-owned bounded verification recovery |
| `supabase/functions/whatsapp-dispatch/index.ts` | Scheduler/service-only bounded worker |
| `supabase/functions/send-whatsapp/index.ts` (existing) | Backward-compatible event/test/diagnose facade using shared delivery |
| `_shared/apply-payment.ts`, payment create/verify/webhook functions (existing) | Trusted outcome binding, atomic payment/event owner, email compatibility |
| `supabase/migrations/20261103000100_whatsapp_core.sql` | Additive settings/private credentials, session/inbox/contacts/jobs and privileges |
| `supabase/migrations/20261103000200_whatsapp_transactions.sql` | Verified enqueue, worker/config locks, ingest/ack/read/delete/sync RPCs |
| `supabase/tests/whatsapp/*`, `supabase/tests/compose.whatsapp.yml` | Isolated actual-role PostgreSQL and concurrency proofs |
| `supabase/functions/_tests/whatsapp/*`, `deno.whatsapp.json` | Deno endpoint/adapter tests and configuration |
| `ops/whatsapp/compose.yml`, `scripts/run-whatsapp-dispatch.sh` | Dedicated gateway and bounded scheduler command |
| `ops/edge-env.manifest.example.json`, `supabase/config.toml`, `SELF_HOSTED.md`, `scripts/README.md` (existing) | Additive deploy inventory and release runbook |
| `docs/integrations/{whatsapp-provider-contract,whatsapp-parity,whatsapp-release}.md` | Pinned provider evidence, feature traceability and release packet |

No broad edits to `src/lib/db.ts`: customer/order lookups use focused hooks. Existing WhatsApp callers and touched admin files switch to `clientRuntime` without repository-wide churn.

## Shared contracts

The following proposed symbols are defined in Task 1 before dependent slices consume them:

```ts
export type WaProvider = 'evolution' | 'postora';
export type WaAudience = 'buyer' | 'admins' | 'custom';
export type WaJobClass = 'automation' | 'legacy_event' | 'manual' | 'test';
export type WaJobState = 'queued' | 'sending' | 'accepted' | 'delivered' |
  'read' | 'failed' | 'needs_review' | 'skipped' | 'cancelled';
export type WaOutcome =
  | {kind:'accepted'; providerMessageId:string | null}
  | {kind:'not_accepted'; code:string; retryable:boolean; retryAfterSeconds?:number}
  | {kind:'uncertain'; code:string};
export interface WaDeliveryRequest {
  jobId:string; attemptToken:string; provider:WaProvider; accountIdentity:string;
  recipient:string; body:string; mediaObjectId?:string;
}
export interface WaActionError {code:string; message:string; correlationId:string}
```

Browser contracts must not import Deno modules or secret-bearing structures. Server request validation uses Zod discriminated unions; unknown fields fail closed. All error responses use safe fixed reason codes and correlation IDs, not raw upstream bodies.

Three independent identifiers are required. `settings_revision` increments on each configuration save and is used for optimistic locking and snapshot audit only. `credential_revision` changes only when a secret changes and binds ciphertext AAD with provider, account identity and encryption-key version. Provider plus `account_identity` identifies the actual sending account and controls job claim/parking. Template edits and credential rotation on the same account do not park jobs or invalidate ciphertext. Blank-key saves preserve the existing credential revision and ciphertext. A changed sender is an account switch even if the provider enum is unchanged; diagnosis must establish that identity before activation.

### SQL ownership and invariants

Create schema private if needed; no PostgREST exposure or browser grants. Private tables: wa_credentials, wa_payment_outcomes (first successful trusted outcome/owner/input snapshot), wa_pending_payment_verifications (signed tuple, bounded verification/review state), wa_payment_evidence (strict GET-confirmed notification evidence), wa_release_state (compatibility activation metadata). Pending tuples have unique invoice/payment identity, unresolved/resolved/evidence_mismatch/superseded/needs_review states, first_seen/last_attempt/next_attempt/attempt_count, lease token/expiry and safe reason. Public tables: whatsapp_settings, evolution_connections, whatsapp_chats/messages/contacts/contact_orders/notification_events/delivery_jobs/delivery_attempts/pending_acks/tombstones/sync_runs/account_dispatch, all with whatsapp_ prefixes except evolution_connections. Expose only safe admin columns/views. Writes/sensitive reads use service-only RPCs; browser reads require actual CureMed admin. Media private.

Schema phase is INERT beside deployed main: only additive new objects/new-table privileges; no active triggers, revokes or new constraints on orders/payment_events/site_settings, no existing credential/settings edits, no altered existing payment functions. Allow only per-object privileges on newly created objects; forbid ALTER DEFAULT PRIVILEGES and schema-level REVOKE on any pre-existing schema, including private. Record whether private already exists. Define the legacy-row guard function but do not attach it in phase1. Its SECURITY DEFINER owner must equal the actual site_settings table owner, proven in the fixture. The fixed trigger filters only key='whatsapp_integration'. The migration/guard RPC takes the required table lock before row locks and arms that trigger atomically with plaintext removal during approved application activation. Apply original main payment/webhook/sender/UI-save fixtures against post-schema DB and prove identical outcomes before schema PR approval.

`whatsapp_settings`: singleton, integration-enabled flag, automation-enabled flag, durable cutover version (`0` legacy/`1` durable), provider, settings_revision, safe account identity, three audience settings/templates, first activation timestamp and real scheduler heartbeat. New automation defaults off; absent settings behaves as cutover 0 with the existing Postora configuration. The verified-payment transaction snapshots the owner decision; Deno cannot reread a later flag to choose a different owner. `private.wa_credentials`: ciphertext, nonce, key version, provider/account binding and credential revision. Public metadata returns only presence/rotation; no secret values.

Jobs contain class (`automation`, `legacy_event`, `manual`, `test`), event ID, paid outcome ID or manual request ID according to class, recipient, audience labels, immutable rendered content/hash, provider/account identity, settings snapshot revision, state, attempt count, due time, lease expiry, attempt token, nullable provider ID and safe failure code. Events additionally persist immutable recipient/template/order snapshots and expansion state (`expanded`, `enqueue_failed`, `skipped`), failure reason and repair-attempt metadata. Provider IDs are scoped by account/instance. Event unique key is `(order_id, event_kind)`; durable recipient key is `(event_id, normalized_recipient, rendered_content_hash)` with audience labels unioned. Paid legacy jobs have no durable event and use UNIQUE `(outcome_id, audience, normalized_recipient, rendered_content_hash)`; they never use a per-request UUID. Manual requests use an admin-generated UUID bound to content/account hash; changed reuse returns 409.

Audit and job order links use restrictive deletion while history exists. Contact user/order association uses explicit admin confirmation; user deletion nulls optional user link, never deletes company messages. Contacts and chat history remain independent. No changes to historical order snapshots.

All SECURITY DEFINER functions fix search_path, reject inappropriate inputs and explicitly revoke EXECUTE from PUBLIC/anon/authenticated before granting service_role. Read RPCs also verify admin authorization at the endpoint; possession of a browser anon key is never sufficient. Fixtures reproduce Supabase's permissive default function/table grants before checking revocation.

### Proposed RPC signatures and lock order

```text
wa_save_settings(expected_revision, safe_patch, encrypted_credential_change, actor_id)
wa_read_settings(actor_id)
wa_read_legacy_migration_source(actor_id)
wa_activate_provider(expected_revision, provider, readiness_proof, actor_id)
wa_apply_verified_payment(order_id, attempt_id, verified_result_json, source)
wa_record_provider_payment_outcome(order_id, attempt_id, provider_status_json, source)
wa_read_payment_owner(order_id, outcome_id_or_null)
wa_list_pending_payment_verifications(order_id_or_null, limit)
wa_claim_pending_payment_verification(order_id_or_null, worker_id)
wa_resolve_pending_payment_verification(pending_id, lease_token, verified_result_json, terminal_state)
wa_set_compatibility_guard(armed, expected_revision, actor_id)
wa_activate_retention_constraints(actor_id)
wa_repair_legacy_outcome(outcome_id, actor_kind, actor_id)
wa_record_pending_payment(order_id, authorized_pending_patch)
wa_claim_delivery(job_id_or_null, actor_kind, request_deadline)
wa_finish_delivery(job_id, attempt_token, outcome_json)
wa_expire_delivery_leases(job_id_or_null)
wa_retry_delivery(job_id, expected_fingerprint, reason, duplicate_risk_confirmed, actor_id)
wa_ingest_messages(instance_identity, session_generation, rows_json, history_run_id_or_null)
wa_apply_ack(instance_identity, message_id, ack_json)
wa_mark_read(chat_number, seen_at, seen_id)
wa_delete_message(instance_identity, message_id, actor_id)
wa_delete_chat(chat_number, cutoff_at, actor_id)
wa_save_contact(contact_json, linked_order_ids, actor_id)
wa_advance_sync(run_id, expected_cursor_json, result_json)
wa_read_credentials(provider, account_identity)
wa_store_credential(expected_revision, encrypted_credential, actor_id)
wa_record_provider_readiness(expected_revision, provider, credential_binding, observed_account, generation_or_null, fallback_verified, legacy_fingerprint_or_null, actor_id)
wa_read_provider_readiness(provider, credential_binding)
wa_read_webhook_credentials(instance_identity)
wa_begin_connection(expected_generation, encrypted_secret_change, actor_id)
wa_commit_connection(generation, safe_state_patch)
wa_disconnect_connection(expected_generation, actor_id)
wa_enqueue_message(job_class, request_id, message_json, actor_id)
wa_record_scheduler_run(run_id, started_at, completed_at, safe_result)
wa_start_sync(instance_identity, actor_id)
wa_register_media(job_or_message_identity, private_object_json)
wa_delete_contact(contact_id, actor_id)
wa_forward_message(source_message_identity, target_number, request_id, actor_id)
wa_migrate_postora_credential(expected_revision, encrypted_credential_change, actor_id)
wa_prepare_baseline_rollback(expected_revision, reviewed_projection, actor_id)
wa_repair_event(event_id, actor_kind, actor_id)
wa_correct_event_expansion(event_id, expected_input_revision, approved_settings_revision, reason, actor_id)
wa_requeue_on_current_provider(job_ids, expected_revision, reason, actor_id)
wa_preview_template(validated_draft, sample_or_order_identity, actor_id)
wa_record_provider_event(trusted_identity, legacy_reference, safe_event)
```

Credential-read wrappers return ciphertext to service role only; no SQL decrypt RPC. Connection wrappers bind secret/generation. Media/register/forward wrappers check account/object identity. Contact delete preserves messages. Postora migration validates encrypted persistence AND a server-only baseline-compatible env fallback before atomically arming the guard and clearing the old database key; retain that env fallback for the initial rollback window. Follow the ordered compatibility state table below. Baseline code rollback retains the guard and the reviewed nonsecret mirror as read-only configuration; it does not restore plaintext or permit stale-tab writes. Requeue accepts never-attempted jobs only, content immutable/audited. Correct-expansion acts only on enqueue_failed event, expected input/settings revision and reason; it cannot edit trusted facts or attempted jobs. First successful paid ownership belongs to wa_payment_outcomes; strict evidence references it. Named read/list/claim/resolve wrappers expose private data only to service-role endpoints. No application handler directly reads private schema through PostgREST.

Settings save/activation uses settings FOR UPDATE; payment/claim/repair/retry use settings FOR SHARE. All paths then lock account-dispatch FOR UPDATE when applicable, then canonical order/attempt for payment, event, jobs in ID order, then messages/contact rows in ID order. Worker reads the order's cancellation/refund snapshot during claim without locking it; a cancellation after claim cannot recall an in-flight send. Expiry/finish/ack paths lock account→job→message, never settings after a job. Read-only credential wrappers take no job locks. Connection/sync operations serialize their own generation/run row and acquire settings first if needed. Retry, requeue and repair follow settings→account→event→jobs. No transaction stays open during HTTP. Concurrency fixtures must prove these orders do not deadlock or permit double claims.

wa_claim_delivery applies gates by class. Automation requires active integration/provider/account, recorded durable owner, audience policy and absence of explicit automation pause; heartbeat freshness is NOT a claim/enqueue gate after enablement. Legacy leftovers under cutover0 use recorded legacy owner and canonical shipped/legacy per-event enablement, not automation/heartbeat flags. Manual/test require admin/provider send readiness, not automation/heartbeat. All classes check account, due time, cancellation/refund where order-linked, attempts and pacing. Claim issues attempt token/45second lease, increments count and reserves one account slot at least1second apart. One in-flight job/account; activation refuses active send and expires stale uncertainty first. Old-provider unsent jobs park, never silently reroute.

`wa_finish_delivery` accepts only the matching attempt token. Late definitive results for the same token may resolve a lease-expired uncertain job. They cannot overwrite a newer explicitly authorized attempt. Acknowledgments arriving first are retained and merged when the send row/ID mapping arrives; read/delivered cannot regress to accepted. Permanent provider rejection stays visible and is not cleared by a late HTTP acceptance.

### Trusted paid event and email boundary

Both provider entry points validate actual provider identity against the service-created attempt's invoice/order binding. Successful callback resolution does not trust request order_id or guest-set payment references. Webhook signature covers Invoice.Id/Status/ExternalIdentifier and Transaction.Status/PaymentId only; Event.Reference and unsigned amounts cannot own identity/deduplication. Amount/currency acceptance uses the matched attempt and authenticated provider GET where required by the documented contract; Task 0 captures exact supported fields rather than inventing them.

Payment has two explicit transactions. Transaction 1, wa_record_provider_payment_outcome, accepts only server-attested signed-webhook status or authenticated callback-GET result, binds the canonical server-created invoice/ExternalIdentifier/attempt, preserves protected states and applies existing allowlisted payment fields. It returns exactly outcome_id (nullable for non-success), owner_snapshot, changed, payment_status, order_status and verification_pending. Only the first SUCCESS-MAPPED outcome per order takes the immutable owner/audience/order/template snapshot; failed or pending attempts never occupy that slot. A later successful attempt after a failed attempt can take it. Signed paid status remains recordable during GET outage. Transaction 2, wa_apply_verified_payment, verifies GET amount/currency/transaction evidence for that same successful outcome and returns exactly evidence_id, event_id (nullable under legacy ownership) and expansion_state. Strict evidence gates cutover-1 durable events only. Under cutover 0 the first successful outcome from transaction 1 immediately owns legacy WhatsApp regardless of GET availability, matching today's behavior; transaction 2 never schedules that legacy send again. Expansion failure leaves enqueue_failed; GET failure leaves verification pending while paid status/email and eligible legacy WhatsApp survive. Existing legacy/admin-premarked-paid orders without a qualifying fresh outcome remain manual-only; no historical sweep. Duplicate callbacks/webhooks repair the same recorded outcome/event and legacy job set without manufacturing a new owner after cutover changes. Operational DB failure preventing commit stays visible; stale final/pending results never downgrade paid/refunded states.

Expansion inputs are append-only versioned snapshots: original order/buyer/payment facts never change; input_revision identifies approved recipient/template settings. Repair uses the latest approved revision. A correction can only rederive recipients/templates from current validated saved settings, passing token/50-recipient/content caps; arbitrary corrected JSON, order/buyer edits and attempted/successful job edits are rejected. Transient expansion failures (specific lock/deadlock/storage availability classes) retry at 1/5 minutes, maximum three repairs then review; deterministic validation failures require explicit corrected revision and never spin in scheduler. `event.repair` and bounded scheduler scans call the same RPC. Existing trusted events need no provider GET for recipient repair; there is no historical-order scan.

After transaction 1 commits, the legacy dispatcher retains its independent email claim. The facade receives outcome_id and honors its recorded owner/provider/recipient/template snapshot; it never requires strict evidence for cutover-0 legacy WhatsApp or rereads a later flag to choose another owner. Cutover 0 (including absent settings) records legacy owner=true and creates idempotent legacy_event jobs keyed by the successful outcome, without a durable paid event. Cutover 1 records legacy owner=false; strict transaction 2 creates the durable event, expanded when automation/integration were enabled in its recorded ownership snapshot, otherwise skipped. First activation timestamp is set once; missing settings cannot fail payment. The email order_notified_at claim remains independent of WhatsApp job identity. Protected invoice/pending writers cannot overwrite paid/refunded outcomes; no price-formula changes.

Record the payment-writer changes as the narrow trusted-enqueue scope required by approved spec §5. Preserve every current allow-listed detail: payment_verified_at, invoice/reference/payment/transaction/reference/track IDs, payment_online_method, card brand/last4, paid_at, failed_at, payment_error_code/message, and protected order/payment status. Regress disabled/missing WhatsApp settings, final/pending outcomes and all field mappings. No unrelated payment redesign.

Webhook first records a valid signed status/successful outcome using canonical invoice/order attempt binding, then makes at most ONE strict-verification GET with a 10-second total timeout, or defers it directly. Never reuse the callback's multi-attempt/sleep loop in the webhook. GET outage after bound signed success returns 200 payment_recorded=true, notification_verification=pending; it does not hold the order unpaid or claim durable jobs scheduled. Missing invoice mapping stores the signed pending tuple and returns 503 up to five minutes then 200 processed=false plus alert; successful attempt-invoice persistence invokes pending-outcome resolution. Admin verify_for_notifications accepts only action+order_id, independently authorizes admin and selects the stored signed tuple or documented server attempt/invoice enquiry. Missing supported enquiry returns visible needs_review without invented transaction IDs. Callback remains owner/guest-scoped. Admin recovery and the payment-owned sweep work with WhatsApp entirely disabled. Strict amount/identity mismatch blocks evidence/event and stays visible without erasing signed paid status; actual refunds/cancellations remain authoritative.

Pending verification recovery is owned by `reconcile-myfatoorah-payments/index.ts`, sharing payment verification code, not a WhatsApp function. The root-owned flock scheduler invokes this authenticated payment sweep before WhatsApp dispatch. wa_claim_pending_payment_verification claims at most one due unresolved row via FOR UPDATE SKIP LOCKED, assigns a unique lease token and a 45-second lease, then commits before I/O. List is read-only, never a claim. Resolve/retry requires the matching token; stale workers cannot overwrite a newer claim. GET is read-only so an expired claim can retry safely, subject to the common attempt budget. The initial webhook GET and sweep/admin GETs claim through the same mechanism; at most six GET attempts total, with failure delays 1/5/15/30/60 minutes. Exhaustion or deterministic mismatch becomes needs_review with a safe reason. A 20-minute outage recovers at the 21-minute retry without any customer callback or admin action. Row age uses database first_seen; after 24 hours, strict evidence may be recorded but its durable event is skipped/review (reason notification_stale), never an automatic late thank-you. No historical order scan. Maximum attempts/age/lease and mismatch states are SQL fields/constants frozen in Task 3. Tests advance fake time, overlap sweeps and expire leases.

Official MyFatoorah V3 guidance supports signature verification→status update→200 for webhook and recommends GET for callback; webhook V2 retry count/delay are merchant-dashboard configuration, not a fixed guarantee. Get Payment Details documents multiple transactions/invoice and returns Amount.BaseCurrency/ValueInBaseCurrency plus Transaction.PaymentId. Capture real fixtures; do not equate creation PaymentId with final transaction or net ReceivableAmount with charged amount. No invoice-amount-immutability assumption is needed to preserve current status recording; strict notification evidence checks actual GET. Sources: [V3 status guidelines](https://docs.myfatoorah.com/docs/v3-updating-payment-status-guidelines), [Get Payment Details](https://docs.myfatoorah.com/docs/get-payment-details).

Provider logging is separate from processing correctness. Live schema confirms a partial unique index `(provider,event_reference) WHERE event_reference IS NOT NULL`. `wa_record_provider_event` uses matching INSERT ON CONFLICT (...) WHERE ... DO NOTHING and returns existing/inserted identity; no PostgREST upsert that cannot infer that partial index. Trusted unresolved/evidence keys do not use unsigned Event.Reference. Duplicate reference cannot prevent re-verification/repair or cause a 500 retry loop; log-write errors are reported distinctly from paid/event commit outcomes.

| Job class | Automation/heartbeat gates | Delivery behavior |
| --- | --- | --- |
| automation | Integration+automation enabled and recorded durable owner at enqueue; no fresh-heartbeat requirement after initial activation; dispatch respects explicit pauses | Bounded worker/nudge; durable recovery |
| legacy_event | Preserves recorded paid owner and selected per-event/enabled settings; no automation/heartbeat dependency | Inline own job set serially; bounded wait/pacing for account slot; leftovers visibly queued/failed in result and logs |
| manual | Admin/provider readiness and integration send enablement; no automation/heartbeat gate | Inline exact job with bounded wait; busy returns visible queued with bounded nudge |
| test | Explicit admin action/test number/provider readiness; no automation/heartbeat gate | Inline exact job; separate audit class |

Before migration legacy text uses site_settings-first/env-second key precedence. Encrypt the effective key/source; keep a protected server-only POSTORA_WHATSAPP_API_KEY copy for baseline rollback, never a masked placeholder in the legacy api_key field. Paid calls carry successful outcome_id through wa_read_payment_owner; UUID fallback is only for old-shaped non-paid/manual/test/shipped calls with a documented replay limit. During deployment skew, no-outcome service-origin legacy request under cutover 0 may use the existing path with explicit legacy_unattested audit, but cannot mint strict evidence. Under cutover 1 no-outcome paid calls fail visibly for repair. Cutover requires verified function identities and bounded requests quiesced; browsers cannot use legacy_unattested as an automation bypass.

### Ordered compatibility activation and rollback

All steps below are app-phase operations, never schema-phase side effects. `private.wa_release_state` records the state and expected settings revision. While compatibility is active, the guard rejects every browser/old-form mutation of whatsapp_integration with an upgrade-required error; only narrow audited service wrappers may update its nonsecret mirror.

| Ordered state | Authoritative configuration / new UI write target | Transition requirements |
| --- | --- | --- |
| Deployed, unmigrated, cutover 0 | Legacy row; new admin endpoint validates and writes that row with expected legacy fingerprint | New backend supports old callers. New-only automation controls unavailable until migration; no silently ignored settings. |
| Atomic migration, still cutover 0 | Copy validated nonsecret fields and effective credential into canonical new stores | Prove server env fallback first. One SQL transaction locks table before rows, checks old fingerprint/revision, stores ciphertext/nonsecret copy, arms fixed guard and clears api_key to empty/absent, then marks migrated. Failure rolls back all these changes. Never retain a masked key. |
| Migrated, cutover 0 | New canonical settings; new UI calls wa_save_settings | Every save atomically updates a validated baseline-compatible nonsecret mirror: enabled, events, language, templates and admin_numbers. Never union custom recipients into admin_numbers. Template projection follows baseline supported tokens; reject an unsafe projection or require integration disabled in rollback projection. |
| Provider activated, cutover 0 | New canonical settings + same nonsecret mirror | wa_activate_provider requires diagnosed actual account, credential/readiness, no active send. Future first outcomes use selected provider; preserve existing jobs. |
| Durable activated, cutover 1 | New canonical settings + same nonsecret mirror | One enable/cutover transaction requires fresh heartbeat, provider readiness and approved audiences. No earlier independent cutover flip. |

Inverse for operational rollback: pause durable claims; snapshot/export unsent/uncertain job IDs and states into protected operator storage; wa_prepare_baseline_rollback validates current settings revision and the reviewed Postora projection, reconciles latest enabled/events/language/templates/admin_numbers, verifies retained Postora env readiness, atomically selects Postora/cutover 0/automation off for future successful outcomes and preserves old ownership. If a safe projection cannot be made, legacy enabled=false until an operator approves one. Existing durable jobs remain parked and listed in the export, never converted to legacy sends. Revert code only after this transaction and baseline fixture proof. Keep the legacy row guarded/read-only through baseline code rollback, so stale old tabs cannot restore removed numbers, plaintext or enablement. Changes during that window use the retained service RPC/operator runbook; the baseline settings form shows upgrade-required. Any later return to writable baseline configuration is a separate reviewed authority transition, not an automatic guard-disarm step. Reprovision a retired fallback privately before rollback; never silently restore plaintext. Resume forward activation in the table's order, preserving owners/jobs.

Inline legacy/manual/test facade requests have a 25second total budget and 10second provider limit; the paid batch prioritizes buyer then admin/custom rather than two competing parallel facade calls. Every leftover is visibly queued. Payment status/outcome is committed first. Use EdgeRuntime.waitUntil for notification side effects only after proving actual post-response lifetime in the target runtime fixture; otherwise use the documented bounded legacy response path until mandatory scheduler/cutover readiness, recording provider timeout limits without promising fast callback completion. No unsafe fire-and-forget. Scheduler installs immediately after functions in the same release packet and before activation/completion; bounded nudges/scheduler are truthful about backlog.

Cutover0→1 is one settings transaction that proves provider/key/readiness plus fresh heartbeat and enables automation; no independent early cutover flip. Heartbeat freshness gates enablement, not event enqueue after enablement: a later scheduler outage queues durable work rather than skipping paid recipients. Explicit automation disable under cutover1 intentionally records future events skipped; this is an admin action, never a migration default. Rollback atomically selects validated Postora, cutover0 and automation off for future first outcomes, preserving existing evidence owner decisions and pausing unsent durable jobs for review. It does not invoke legacy sends for already durable-owned orders.

## Execution order and task acceptance

### Task 0 — Manager: pin evidence and prepare isolated tools

**Files:** create `docs/integrations/whatsapp-provider-contract.md`, `docs/integrations/whatsapp-parity.md`, `deno.whatsapp.json`; record versions in release packet. Static source/registry contract capture first; approved runtime repair/health proof is a separate step and never authorizes pairing/sends.

- [ ] Read pinned upstream 2.3.7 DTO/routes and donor adapter. Record method/path, auth, request/response fixtures, send acceptance versus delivery, errors, rate limits, media/deletion semantics and account identity. Postora evidence is the existing text/diagnose contract; do not invent inbox/media APIs. Capture MyFatoorah provider identity/amount fixture shape from official V3 evidence.
- [ ] Reuse approved existing app w4DS2-k_EauA17sMm-ONL/service curemedkw-evultionapi-wrtdxe, source f1100ad8741fb8af5015fc86b11e78e95d50c353 (2.3.7/Baileys7.0.0-rc14). Record Docker image ID AND RepoDigests separately; local identity be2cbdefd40b2c10e780b05b812fe7a2291525ada4e2af70af64bfabb7c766a5 does not prove remote registry availability. Before reload: immutable local tag curemed-evolution:f1100ad, protected docker-save backup/checksum, disable this app's autoDeploy, inspect exact v0.29.11 reload/image mechanics. Preserve local bytes using no-rebuild reload and assert running container Image ID equality afterward. Do not switch to registry-backed Docker provider assuming a local-only digest can be pulled. If actual managed deployment requires a registry, stop for private-registry approval rather than rebuild or publish. User already approved infrastructure repair; credentials are the missing prerequisite, not permission. No duplicate gateway.
- [ ] Refresh remote main read-only, preserve primary Shipa branch/status. Use T3-managed isolation from the approved main baseline, not shell worktree creation or child-prompt checkout setup. Refresh the initial-checkout guard's exact baseline/brief allowlist; sanitize copied environment files before child access, scan for sensitive files/links and write attestation. Do not change existing commit/push secret hooks.
- [ ] Keep primary Shipa checkout untouched. T3 creates a sanitized bootstrap-only worktree from the host's current parent; initial guard permits exactly that known parent for bootstrap, injects no implementation brief, removes child environment copies and attests. Bootstrap reports identity and stops without application-file reads. Manager verifies no worker edits/running child, then uses normal git switch -c feat/whatsapp-evolution <recorded origin/main SHA> inside the HOST-CREATED checkout (branch must be absent; never -C/reset or discard unrelated work). Resanitize after switching, update attestation and gate HEAD==baseline, empty git log baseline..HEAD, no Shipa tracked files/commits and no environment files. Only then install dependencies/copy docs/dispatch implementation. Primary HEAD/status/untracked files remain identical throughout. A failed base switch leaves a retained bootstrap checkout for safe correction, not an unowned reset or indefinite permission loop.
- [ ] Before delegate launch recheck free commit memory >20 GiB. Install locked dependencies in sanitized checkout through manager; no secret-bearing .env or production config. Locate a pinned portable Deno with official checksum verification; docker availability includes daemon health, not just executable presence.
- [ ] Gate: clean reviewed baseline except intentional environment sanitation deletions; attestation valid; dependency/type resolution uses the new checkout. Missing tools/sandbox targets block their proof, never substitute production.
- [ ] Capture production router bytes/hash into protected ignored fixture storage and document admission per new function. config.toml verify_jwt is not proof: post-deploy does not consume it. If router needs JWT, Evolution webhook headers carry the deployment admission JWT plus the per-generation custom secret; anon JWT admits routing only and never authorizes webhook/worker. Prove header forwarding using exact-router fixture. No secret in URL. Any actual router policy change is a separately reviewed/approved additive runtime action, never replacement of main/index.ts.

### Task 1 — MiniMax: pure settings, template and delivery contracts

**Files:** `src/lib/whatsapp/contracts.ts`, `settings.ts`, `templates.ts`, `deliveryPolicy.ts` and adjacent `.test.ts` files.

- [ ] Define shared types plus audience configuration and safe settings response. Require expected settings_revision/provider enum; define separate credential_revision and account_identity as above. Normalize ASCII/Arabic digits and allowed formatting; default_country=KW converts exactly eight valid Kuwait local digits to 965-prefixed form, while explicit international numbers retain their country code. Enforce 8–15 international digits after normalization; reject extensions/invalid characters rather than silently stripping them. Production aggregate checked two Kuwait-international numbers, no local-eight rows, with no actual numbers returned. Add local/Arabic/explicit-plus/00-prefix regression fixtures.
- [ ] Define template token/input contracts and preview response; SQL is the sole authoritative renderer via service-only wa_preview_template and admin action automation.preview. TypeScript does token-form validation and consumes server preview; it does not independently render/hash jobs. KWD values use SQL decimal-safe three-place formatting. Enforce 4096 Unicode-codepoint rendered limit and 50 recipients. SQL truncates items_summary by whole lines within reserved message budget with localized remaining-item count; a single oversized item line is safely shortened. Validate any remaining non-item overflow as deterministic configuration failure, visible in preview/repair.
- [ ] Define provider capability map and pure retry/state predicates: three attempts total, only proven not accepted auto-retry, 1/5 minute schedule; unknown always review. Settings/configuration and worker budgets are explicit constants shared through safe contracts.
- [ ] Regression examples to author and run through manager:
```ts
expect(nextAction({kind:'uncertain',code:'timeout'}, 1)).toEqual({state:'needs_review'});
expect(providerCapabilities('postora').media).toBe(false);
expect(validateTemplateTokens('Hi {{unknown}}')).toEqual({unsupported:['unknown']});
```
- [ ] Manager proves tests fail against absent behavior, then pass; targeted frontend typecheck/lint. Commit exact four module/test groups after guard review.

### Task 2 — Codex: additive core schema and privileges

**Files:** `20261103000100_whatsapp_core.sql`, `supabase/tests/whatsapp/{bootstrap,privileges}.sql`, `supabase/tests/compose.whatsapp.yml`.

- [ ] Define the tables, scopes, unique keys, constraints, safe views and indexes listed above. Required indexes cover due jobs, account/instance message IDs, `(chat_number,sent_at,id)`, contact phone, event/order and pending ack expiry. Keep operational addresses out of general logs.
- [ ] Create private bucket `whatsapp-media`; browser roles receive no storage access. Admin safe inbox/settings reads use has_role/auth.uid from target schema; no imported Danat permissions. Secrets/session QR columns have no table-wide browser SELECT grant.
- [ ] Fixture uses the production Supabase PostgreSQL image (observed supabase/postgres:15.8.1.060, local image ID sha256:0e2279598bc0224fb5960c3a61eb23270cd60119427f3a7bdec86ba282600dcc; resolve its repository digest before export/use), isolated volume/network and no public DB port. Capture schema-only dump and role/owner/default-grant metadata with no rows or role passwords into protected ignored fixture storage; never print dump contents. Restore in that same image, retaining owner/privilege topology and required extensions. Run migrations as actual runner role postgres, which live inspection confirmed NOSUPERUSER/BYPASSRLS, while supabase_admin is SUPERUSER/BYPASSRLS. auth.users owner is supabase_auth_admin; storage.buckets/objects owner supabase_storage_admin. Supply synthetic users/orders/payment fixtures only. Keep adversarial default-grant sentinel/revocation tests. No unrelated seed data or production secrets enter fixtures; pin fixture source/schema hashes and refresh before final rehearsal.
- [ ] Example invariant for schema/tests:
```sql
REVOKE ALL ON private.wa_credentials FROM PUBLIC, anon, authenticated;
CREATE UNIQUE INDEX wa_paid_event_once
  ON public.whatsapp_notification_events(order_id, event_kind);
```
- [ ] Apply only to disposable DB and check each role, schema rerun expectations, parent-delete restrictions and private-storage grants. No live migration execution. SQL stays Codex-owned.
- [ ] Restore recipe: manager captures schema-only public/private-if-present/auth/storage plus required extension and role/owner/grant metadata, excludes rows/passwords/foreign-user credential mappings and scans protected files without printing them. Start SAME image on an isolated volume/project; verify container/database disposable marker before any drop. As supabase_admin in that fixture only, remove conflicting referenced schemas with CASCADE, ensure required extension/owner roles with observed attributes, restore captured DDL/ownership/grants with ON_ERROR_STOP. No drop on any remote/live target. Before feature SQL, normalize volatile pg_dump restrict/header/session markers and compare referenced schema/ownership catalog digests against captured production baseline; resolve all unexplained differences, then load synthetic data. Apply feature SQL as nonsuperuser postgres. Do not weaken ownership or silently ignore restore collisions. Runtime fixture uses synthetic ecommerce shoppingEnabled=true only locally; production hold remains false.
- [ ] Destructive fixture guard requires all: local Docker context (reject ssh/tcp remote endpoints), manager-created unique compose project/container labels and a database marker in its new isolated volume. Reject external/bind production volumes and arbitrary target URLs. Negative tests prove refusal before SQL execution for production-like context/name/marker mismatches. These drop/restore operations are never run through production SSH.

### Task 3 — Codex: transactional enqueue, dispatch, ingestion and recovery RPCs

The core-schema fixture proved that foreign keys from new tables to existing orders/payment_attempts/auth.users would create active internal triggers on existing parents. To preserve the strict inert-schema rule, phase 1 records nineteen fixed links in private.wa_retention_links without attaching them. Before deploying new writers, the separately approved app preparation calls wa_activate_retention_constraints under quiescence; it installs only those reviewed links, validates them and marks retention_ready. Until then, new feature writers remain upgrade-pending and baseline handlers continue. New-to-new foreign keys remain active in phase 1. Credentials/legacy guard and durable cutover still follow the ordered state table afterward. No SQL freeze or production activation is claimed by the core proof.

Paid legacy expansion has its own outcome snapshot/expansion state. wa_repair_legacy_outcome builds the same unique legacy job set from the recorded first-success snapshot; the bounded worker repairs visible enqueue_failed legacy outcomes independently of strict GET evidence. It never changes owner, rebuilds already-attempted content or creates historical outcomes.

**Files:** `20261103000200_whatsapp_transactions.sql`, `supabase/tests/whatsapp/{enqueue,dispatch,ingest,concurrency}.sql`, `scripts/test-whatsapp-db.ps1`.

- [ ] Implement signatures and lock order above, including allow-listed result fields, settings revision conflicts, explicit activation timestamp, first evidence/legacy paid behavior, template snapshot rendering and recipient coalescing. Reject RPCs by anon/authenticated even if claims forge an admin role.
- [ ] Define transitions: queued→sending; sending→accepted/failed/needs_review; accepted→delivered/read/rejected review; exhausted safe failures→needs_review; paused/invalid order→skipped/cancelled; stale sending→needs_review. Persist safe failure/actor/attempt history in same transaction.
- [ ] Ingestion atomically upserts messages/contact/chat summary and increments unread once. Ack inbox permits event-before-send. Mark-read compares newest observed `(sent_at,id)`; tombstones suppress replay and historical resurrection; contact/order replacement is transactional.
- [ ] Use `FOR UPDATE SKIP LOCKED` only after consistent settings/account locking. Retry requires current fingerprint, reason and duplicate-risk confirmation for uncertain replacement. An accepted success cannot use safe Retry. No external HTTP inside SQL transactions.
- [ ] Actual concurrency tests force two connections past barriers: callback/webhook enqueue race, worker/manual race, switch/claim overlap, read/inbound overlap, ack/finish order and expired-token late response. Assert DB rows/outcomes, not function source text. Manager reviews SQL/fixtures and reruns isolated DB proof before commit.

### Task 4 — MiniMax: Deno auth, credentials and provider adapters

Execution refinement: Task 4A may implement only SQL-independent auth primitives, pure Web Crypto and HTTP adapters against captured provider DTOs/fake boundaries. It cannot call or invent WhatsApp storage RPCs, wire routes, create jobs or change deployment/runtime state. Its frozen dependency is the browser-safe shared contract in supabase/functions/_shared/whatsapp/contracts.ts; the frontend path reexports that module so the deployed Edge bundle does not depend on src files. Task 4B adds credential storage/readiness/action schemas only after the required Task 3 RPC contracts and proofs are frozen. Tasks 5–11 remain dependent on their SQL contracts; this refinement is not an overall SQL freeze or additional Opus approval.

Task 4B1 refinement: the tested credential storage/readiness subset is documented in docs/integrations/whatsapp-credential-rpc-contract.md. It may wire only those service RPCs, pure credential-save validation and actual-provider diagnostics through fake HTTP/SDK boundaries. No route, environment loader, migration/activation, connection writer or send is authorized by this subset. Proof metadata is private. Staging ciphertext does not replace legacy authority before the atomic migration. Task 4B2 and Tasks 5–11 remain gated on their unfinished SQL contracts; this is not a full SQL freeze.

Task 4B2 refinement: the tested settings/migration subset is documented in docs/integrations/whatsapp-settings-rpc-contract.md. It permits internal safe settings mapping/save and previewed legacy migration orchestration against fake SDK/HTTP boundaries. Configured migration requires real account/fallback proof; explicitly disabled keys remain encrypted/unverified, and an empty installation migrates without a Postora dependency or invented account. No route/env loader/provider activation/connection/payment/send is included. Shared settings/template validation is mechanically relocated into the deployed pure module directory with frontend reexports. Full SQL freeze remains pending.

Task 4A encryption AAD is a UTF-8 JSON tuple [1, provider, credentialBindingIdentity, purpose, credentialRevision, keyVersion, generation], with no settings revision. The Evolution binding is the deployment-managed instance namespace; outbound jobs retain the separately diagnosed sender account identity. Crypto receives a versioned server keyring, never a browser key or database decryption RPC. Provider/client methods have no retries/pacing; the durable worker owns those policies.

**Files:** `_shared/whatsapp/{auth,schemas,credentials,evolutionClient,postoraClient}.ts`, `_tests/whatsapp/{auth,credentials,providers}.test.ts`.

- [ ] Admin auth verifies actual signed-in identity and existing admin role. Scheduler verifies constant-time dedicated credential; service invocation verifies server credential; anon alone denied. Endpoint method/action/body-size validation precedes work, and errors use safe reason codes.
- [ ] AES-256-GCM uses random 96-bit nonce, versioned key and AAD binding provider/account_identity/credential_revision/encryption-key version, never settings_revision. Blank key preserves, explicit remove removes; settings reads never decrypt. Legacy Postora key migration uses an admin endpoint with server-side read/encrypt/clear and expected revision; preserve the provider until migration succeeds.
- [ ] Migrate nonsecret settings explicitly: language→audience language defaults; admin_numbers→admins recipients; events.order_paid→buyer switch; events.admin_new_order→admins switch; preserve events.order_shipped for legacy shipped class. Resolve existing template precedence exactly as sender does (event_language override, then nested event/language, then built-in). Preserve endpoint only within current allowlist; custom audience defaults empty/off. Never implicitly bind user_notification_templates. Present a safe diff/preview before committing migration. Live RLS inspection found whatsapp_integration excluded from public storefront reads, so do not claim an observed public key leak; rotate only if exposure evidence or operational key-change approval requires it. Block future plaintext api_key writes after encrypted migration.
- [ ] Fixed deployment-managed Evolution origin and approved Postora HTTPS hosts; redirect:error, bounded streaming response/media size and 10-second timeout. Route methods come from captured pinned contract. Provider acceptance maps to accepted; malformed success/transport ambiguity maps to uncertain. No raw response text in persisted errors.
- [ ] Adapter contract example:
```ts
const outcome = await sendText(request, injectedFetch);
expect(outcome).toEqual({kind:'uncertain',code:'provider_result_invalid'});
```
- [ ] Tests include redirects, wrong/missing secrets, ciphertext AAD/tamper, plaintext omission, 200 success:false, known validation rejection, 429 evidence and HTTP timeout after possible acceptance. Deno checks/tests run by manager against fixtures only.

### Task 5 — MiniMax: trusted payment integration and email cutover

**Files:** `_shared/whatsapp/paymentEvent.ts`, existing `_shared/apply-payment.ts`, create/verify/webhook payment functions, `reconcile-myfatoorah-payments/index.ts`, adjacent Deno tests.

- [ ] Resolve successful provider results via service-created attempt binding, not guest-editable order fields; preserve current guest-owner authorization for callback status disclosure. Add invoice/attempt persistence error and zero-row checks before returning a redirect.
- [ ] Record bound signed/callback status through wa_record_provider_payment_outcome first; complete strict notification evidence through wa_apply_verified_payment only when GET amount/identity is confirmed. All pending/final writers preserve protected state. Never make signed paid recording depend on GET availability. Remove duplicate short-circuit based on unsigned Event.Reference; log conflicts safely without suppressing processing.
- [ ] Refactor combined dispatcher according to returned immutable paid owner; pass successful outcome_id to legacy facade; evidence_id/event_id belong only to transaction 2. Preserve email claim independently, including cutover-switch-during-call/deploy-skew tests. Define admin verify_for_notifications payment recovery for unresolved trusted tuples, independent of WhatsApp infrastructure. Never lose current payment fields or return false processed=true on mismatches; duplicate partial-index event logging is idempotent and checked.
- [ ] Admin verify_for_notifications body is exactly action+order_id. Server selects signed pending transaction if present; otherwise documented invoice enquiry may resolve the attempt's successful transaction. Never use browser-supplied or stale creation PaymentId as authority. A missing supported enquiry/transaction is visible needs_review; no guessed endpoint/ID. Test pending_status_update with no webhook tuple and full admin authorization independent of buyer ownership.
- [ ] Regression: signed paid webhook with GET down20minutes and no callback still records paid/outcome and preserves email; cutover-0 legacy WhatsApp still sends once immediately from its outcome; cutover-1 strict evidence/jobs recover automatically through the bounded payment sweep. Test failed attempt A then successful attempt B and duplicate signed callbacks while GET is down. Callback GET and signed webhook races yield one first outcome; existing admin-marked/historical paid without fresh outcome does not backfill. Test mapping-before/after-webhook recovery and no stale pending downgrade.
- [ ] Preserve ministry gate, cancelled/refunded states and checkout amount formula. No Shipa module imports. Unreachable provider fallback is owner/guest-authorized cosmetic pending only and cannot mint evidence/jobs.
- [ ] Tests simulate transaction failure, missing attempt/invoice binding, paid replay, guest-copied payment IDs, unsigned webhook field tampering, concurrent successful webhook and stale create pending writer, enqueue success/lost nudge and legacy email compatibility. Any payment integrity expansion beyond this boundary is surfaced before implementation.

### Task 6 — MiniMax: shared delivery worker and compatible sender

**Files:** `_shared/whatsapp/delivery.ts`, `whatsapp-dispatch/index.ts`, existing `send-whatsapp/index.ts`, Deno delivery tests.

- [ ] Manual text, media and automation first create durable jobs/idempotent manual requests; every provider send uses claim/finish RPCs and the same per-account slot. Browser request cannot pick a provider URL, claim paid evidence or override snapshots.
- [ ] Worker processes maximum three serial jobs within 50 seconds, per-provider request timeout 10 seconds and per-job lease 45 seconds. Stop before insufficient remaining time. Empty authenticated scheduler run updates heartbeat; service nudges never do. Dedicated token stored outside command arguments.
- [ ] Enforce pause/cancellation/refund checks at claim, safe retry schedule and ambiguous outcome policy. A crash between claim and network is conservatively uncertain. Persist known provider ID before enrichment/cache where possible; enrichment failure cannot authorize resend.
- [ ] Existing send-whatsapp event/test/diagnose shapes route through new validation/provider path. order.shipped is resolved from stored order under admin auth; test/manual UUID prevents accidental replay. Sender reports per-recipient outcomes, not `ok:true` when every recipient failed.
- [ ] Tests cover all claim/timeout/crash/finish permutations, partial failures, provider_changed, manual-versus-worker concurrency and no duplicate email dispatch. Use injected fetch and clock, not real phones.

### Task 7 — MiniMax: session lifecycle and webhook ingestion

**Files:** `_shared/whatsapp/ingest.ts`, `whatsapp-webhook/index.ts`, `whatsapp-admin/index.ts` action router, session/webhook Deno tests.

- [ ] Admin actions: settings.read/save, provider.activate, connection.begin/qr/status/disconnect, diagnose, test.send, automation.preview, event.repair, event.correct and delivery.requeue_on_current_provider; every action independently authorizes admin. Repair/correction acts on durable event ID/input/settings revisions and immutable order facts. Settings uses expected revision; QR uses no-store responses.
- [ ] Create/reuse only dedicated CureMed instance. Configure new secret remotely first, then commit encrypted secret/current generation, accept previous secret for at most five minutes. Failed new-instance setup rolls back only a newly created disposable instance; never delete a pre-existing paired account.
- [ ] Webhook max body 1 MiB before parse; explicitly subscribe only QRCODE_UPDATED, CONNECTION_UPDATE, MESSAGES_UPSERT and MESSAGES_UPDATE, with webhook base64=false and byEvents=false using the exact deployed contract's field names. Do not subscribe to bulk MESSAGES_SET/CONTACTS_SET/CHATS_SET or media base64 payloads. Authenticate expected instance and a unique current/previous generation secret: the matching secret identifies generation; never expect an invented generation field from Evolution. Previous-generation state/QR events cannot overwrite current state; delayed messages may deduplicate under the correct account. Oversized authenticated events increment a safe visible rejection counter.
- [ ] Capture actual deployed gateway webhook retry behavior in Task0. Return 503 on transient ingest failure but do not presume redelivery; record safe failure metrics and schedule bounded history-recovery sync from last successful cursor if no reliable gateway retry exists. Unsupported authenticated events return explicit ignored. Never log base64/secrets or send auto-replies.
- [ ] Fixtures cover wrong instance, invalid/expired old secret, oversized stream, malformed body, out-of-order QR/state, disconnect, replay, outgoing echo and ack-before-send.

### Task 8 — MiniMax: contacts, conversations, deletion and links

**Files:** `_shared/whatsapp/chats.ts`, extend `whatsapp-admin/index.ts`; `src/hooks/useWhatsApp{Inbox,Contacts}.ts`; contact/chat Deno and hook tests.

- [ ] Typed actions: `chat.send`, `chat.read`, `chat.delete`, `message.delete`, `contact.save`, `contact.delete`, `contact.export`. Service RPCs own writes. Read endpoints/hooks select safe columns with admin RLS and stable cursors; escaped bounded search.
- [ ] Normalize numbers once through shared contract; explicit user/order linking requires existing target records and admin confirmation. Saving full order-link selection runs transactionally. No automatic identity match or historical order edits.
- [ ] CSV export pages all rows with UTF-8 BOM/RFC4180 escaping and formula neutralization. Shared unread uses observed cursor. Local deletion writes tombstone; remote delete requires Evolution active and outbound identity; provider refusal remains distinct from local outcome.
- [ ] Tests: same phone shared by users, invalid/cross-order links, rollback of partial link changes, >1000 export rows/formulas, stable pagination, unread race and delete/reimport behavior.

### Task 9 — MiniMax: media, forwarding, avatars and resumable history

**Files:** `_shared/whatsapp/{media,history,avatars}.ts`, admin actions; media/history Deno tests.

- [ ] Typed actions: `media.send`, `media.download`, `message.forward`, `avatars.sync`, `history.start`, `history.step`, `history.status`. Evolution-only sends/deletion are capability-gated server-side; Postora text forwarding uses new rendered text job.
- [ ] Decode-size cap 10 MiB, MIME allowlist, sanitised paths/filenames, bounded base64, private bucket access; no arbitrary remote URL fetch. Persist/cache allowed content; cache/download errors do not silently drop media. Forward refers to authorized stored message/object identity, never arbitrary storage paths.
- [ ] Avatar origins validated or cached with time/size bounds. History run has persisted account-bound cursor, 25-chat/finite-page/time budgets and truthful incomplete/unresolved counters. Each step continues from committed cursor and ingestion dedupe; no unread increments, groups or guessed LID numbers.
- [ ] Test media limits/malformed base64/MIME/redirect/SSRF, private download auth, forwarding missing cache and history restart/page-boundary/tombstone/LID scenarios. Cached files survive gateway restart.

### Task 10 — MiniMax: port the inbox/contact/media UI

**Files:** `src/components/admin/whatsapp/{WhatsAppInbox,WhatsAppChatList,WhatsAppThread,WhatsAppThreadHeader,WhatsAppChatLink,WhatsAppComposer,MessageBubble,WhatsAppContacts,WhatsAppContactDialog,WhatsAppForwardDialog,EvolutionConnectionCard,EvolutionQrDialog,ChatAvatar}.tsx`, `contactSortValue.ts`, `messageMedia/*`, `src/lib/whatsapp/avatar.ts`, settings/inbox hooks, adjacent behavior tests.

- [ ] Port each donor parity row; replace TanStack Link/server calls/permission context/i18n with CureMed equivalents. Keep Deno/provider secrets out of frontend bundles. Explicit contact user/order links replace real-estate fields/routes.
- [ ] Responsive list/thread/back navigation, deep-link `?chat=`, search, keyboard labels/focus, unread, avatars, add/edit/delete and CSV controls. Image/video/audio/PDF/document components preserve previews/playback/download/lightbox and release object URLs.
- [ ] Prevent duplicate submit via idempotent manual request IDs/pending state. Render text safely. Show accepted versus delivered/read, failure/review reasons and Postora capabilities. Composer clearly shows selected provider and safe sending-account identity; if the Postora account differs from the incoming Evolution number, explain that reply sender difference. Record whether Postora returns a usable WhatsApp message-key identity; otherwise never guess an echo match. Incoming data remains readable regardless of selection.
- [ ] Behavior tests drive user actions and response states, not JSX source snapshots: QR no-cache lifecycle, narrow-screen navigation, selecting existing contact, media fail, duplicate click, unread arrival and provider-capability denial.

### Task 11 — MiniMax: automation, settings, logs and existing-route integration

**Files:** `AdminWhatsApp.tsx`, `src/components/admin/whatsapp/{WhatsAppSettings,WhatsAppAutomation,WhatsAppDeliveryLogs}.tsx`, `useWhatsApp{Settings,Delivery}.ts`, existing `AdminOrderEmail.tsx`, `AdminOrders.tsx`, `AdminLayout.tsx`, focused component tests.

- [ ] Compose Inbox/Contacts/Settings/Automation/Delivery Logs tabs. Settings save and provider activation separate; show safe credential metadata, expected-revision conflicts, pairing readiness and explicit disconnect confirmation.
- [ ] Three audience switches/lists/language/templates with sample preview, unsupported tokens, overlap warnings and per-recipient skipped outcomes. Master automation enabled only when runtime secrets/config and scheduler heartbeat within three minutes are valid. Automation defaults off; do not manufacture recipients.
- [ ] Logs filter provider/audience/order/state, expose correlation ID/attempts, safe Retry versus uncertain duplicate-risk confirmation, queue age and scheduler/session health. Enqueue-failed events show transient retry budget or deterministic correction requirement; event.correct previews only rederived validated settings at expected revisions, and event.repair cannot edit trusted order/payment facts. Never reveal keys/raw upstream bodies.
- [ ] Keep `/admin/order-email` valid and link existing email controls into paid-order Automation. Preserve existing shipment WhatsApp behavior, disabled future cart/review explanations and runtime-client imports in touched callers. No unrelated navigation redesign.
- [ ] Tests prove independent audience toggles/template languages, 50-recipient rejection, stale revision, queued old-provider review, hidden successful Retry and retained email settings.

### Task 12 — Manager/MiniMax: additive runtime, gateway and scheduler artifacts

**Files:** `ops/whatsapp/compose.yml`, `scripts/run-whatsapp-dispatch.sh`, manifest/config, release/runbook docs. MiniMax writes non-SQL files; manager validates host operations.

- [ ] Adapt artifacts to reuse existing gateway app/image; compose supplies only approved missing dependencies/network/storage, not a duplicate API. Isolate DB/user/Redis, pin digests/resources/health, no public DB/Redis/manager ports. Persist dedicated internal overlay membership for gateway and Edge through managed definitions. No production key values in templates.
- [ ] Manifest adds reconcile-myfatoorah-payments and whatsapp-admin/webhook/dispatch plus new secret names to top-level requiredSecrets and per-function inventory; preserve payment/email functions and exclude main router. Before application merge, provision those credentials in /etc/curemed/edge-secrets.production.json via private secret file handling and verify presence only; otherwise the current post-deploy script blocks the entire deployment. Keep optional WA runtime errors isolated from payment verification and legacy Postora fallback. UI recognizes missing/not-yet-deployed endpoints, disables new controls with an upgrade-pending message and retains legacy route behavior for one compatibility release; old UI calls stay supported. Record frontend and function identities separately.
- [ ] Rotation runbook accounts for existing compose.env keys being skipped by import_secrets. For scheduler rotation update the protected secrets JSON AND effective compose.env atomically, refresh only functions through the approved runtime operation, verify new credential accepted/old rejected without displaying either. For master encryption rotation do not overwrite V1: a reviewed V2-capable code/schema change adds a new versioned runtime key, migrates ciphertext/AAD versions with V1 retained until verification, then retires V1 in an approved cleanup. Presence/version/decrypt checks use safe metadata. Legacy Postora rollback env is populated before DB plaintext removal through protected server-file handling, preserved in canonical functions environment and tested on baseline sender; it is not a new unconditional required key if Postora was never configured.
- [ ] Scheduler one-shot command uses flock with a root-owned lock file: first one payment-sweep invocation (one GET, 10-second provider timeout, 15-second endpoint deadline), then one WhatsApp invocation with the remaining overall 55-second budget (at most 35 seconds). Standalone WhatsApp nudges retain their 50-second maximum; scheduled calls cap their requested runtime to 35 seconds. Failed payment sweep does not suppress dispatch, and each result/heartbeat is reported separately. Separate root-owned 0600 curl configs hold router admission JWT and endpoint authorization; payment sweep requires service-role server authorization, WA uses its dedicated scheduler credential. MyFatoorah token is read only by payment-owned modules, never WhatsApp dispatch; neither enters argv/URLs/logs. Every authenticated scheduler run records heartbeat after successful runtime/database checks, whether queue is empty or nonempty; service nudges cannot. No unbounded loop or secret-bearing tracked file.
- [ ] Record exact Deno/Edge limits and reduce worker batch if <60-second runtime allowance, preserving timeout < lease and safe deadline. Docker healthcheck alone does not certify WhatsApp delivery.
- [ ] Disposable test uses a protected ignored copy/hash of the actual production router for routing/header parity, never the divergent untracked repository main. Apply Edge overlay membership in canonical Dokploy compose AND resulting host compose file; prove supabase-post-deploy.sh rewrite and redeploy preserve it. Infrastructure repair has now been explicitly approved, excluding application schema/merge/pairing/sends. Runtime contract checks follow that repair; custom webhook headers must be supported by the exact build. If not, stop and request a documented alternative—no secret-in-URL fallback under current constraints.

### Task 13 — Manager: assembled proof, guards and Astra review

**Files:** all delivered diffs; `docs/integrations/whatsapp-parity.md`, release packet and review reports.

- [ ] Before every dispatch record HEAD/status and exact allowed paths. Review actual diff against criteria before delegate report; no-change delivery is failure. Run clean-code-guard/test-guard/docs-guard, fix small findings directly and commit exact paths only after relevant gates.
- [ ] Frontend: `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`; targeted `node node_modules/eslint/bin/eslint.js` paths; targeted `node node_modules/vitest/vitest.mjs run` named new tests `--maxWorkers=1 --no-file-parallelism`. Expected exit 0 and all selected tests passing, not a predetermined fabricated count.
- [ ] Deno: pinned `deno check --config deno.whatsapp.json` new/modified function entrypoints; `deno test --config deno.whatsapp.json --allow-env supabase/functions/_tests/whatsapp` with injected mocks. Grant additional permissions only when specific fixture need is reviewed; never broad production/network access for unit tests.
- [ ] SQL: powershell -NoProfile -File scripts/test-whatsapp-db.ps1; assert actual roles/concurrency on isolated DB. Add fixture-only PostgREST and the target Edge Runtime version to compose with pinned digests. A local integration fixture sends a signed fake-provider webhook through real Deno handler→PostgREST/RPC→event/jobs→worker→fake provider, and asserts actual rows/results; only provider/auth-test boundaries are injected. Fake keys/JWTs are created at test runtime in ignored fixture storage, never tracked or connected to production. Verify literal RPC argument/JSON response compatibility, not just mock expectations. DENO_DIR stays in task-specific F:/Dev/Runtimes cache; allow-read only named fixture paths where needed. Script refuses any target not proved disposable.
- [ ] Mandatory compatibility/revert matrix: export original-main handler/UI-save blobs without environment files into ignored fixture storage; run them against schema-only phase (all original writes/sends still succeed), then against migrated/activated state after reviewed rollback reconciliation, guard retained and server env fallback retained (baseline Postora sends from latest safe mirror, old form fails upgrade-required). Include removed-admin/disabled-integration/stale-tab regressions and protected unsent-job export. New handlers must record signed paid status during GET outage; only strict notification proof stays pending. Test atomic trigger arming/key clearing, scoped filtering and read-only rollback and both existing-table grants and current data mappings. No live controlled sends used for these proofs.
- [ ] Run one full local Vitest suite immediately before PR, one heavy job at a time. Run production build as needed for changed bundle/runtime proof. Resolve failures by classifying implementation defect, incorrect test or environment; never weaken tests merely to pass.
- [ ] Request new T3 Astra/medium review of immutable head/allowed files, with settings-switch/delivery ambiguity/payment evidence/privacy/runtime focus. Manager fixes findings and reruns affected gates; new reviewer re-check requires a new task. Do not claim approval from an unrun re-review.
- [ ] Fill parity matrix with task/commit/test/runtime evidence for every spec row, including explicit provider capability limitations. No unproven row is marked done.

### Task 14 — Manager: PR, concrete production approvals, deploy and verify

**Files:** `docs/integrations/whatsapp-release.md`; exact approved migration/runtime artifacts.

- [ ] Push isolated feature branch only when gates pass; open PR against main and immediately call link_pull_request with full URL. Record merge threshold before requested review: no unresolved P1/P2 correctness/security/data-loss findings; required checks green on exact merge head. Do not add CI to this private repo without spending approval.
- [ ] Present reviewed migration checksums, disposable rehearsal results, live backup/restore commands, exact release head, pinned gateway images/config diff, scheduler/header/routing inventory and rollback. Ask production migration/provisioning approval for this packet; no generic early permission substitutes for it.
- [ ] TWO PR phases: build schema-only branch from recorded main baseline INSIDE the existing host-created worktree while all implementation edits are committed/workers stopped. Normal git switch -c creates that branch; git restore --source=frozen-feature-commit -- exact migration/independent-SQL-test/docs allowlist, never restore an ancestor commit wholesale. Commit normally through hooks and verify each Git blob ID equals reviewed source blob. Gate whole PR diff to that allowlist (no Task1 TS/Edge/frontend/manifest files). Re-sanitize/check no environment files after checkout. Link schema PR immediately. After separately approved schema merge, verify live migration/ledger, return to feature branch and merge origin/main normally, no rebase/force; application PR must show no migration diff. Every PR linked independently.
- [ ] Schema packet inventories ALL project triggers and repo-sync paths first: root and relevant user crontabs, /etc/cron.d, systemd timers, Dokploy deploy hooks and their wrapper/sync scripts, including the known post-deploy and /root/run-curemed-migrations.sh paths. Record sanitized identities/config hashes without secret-bearing command arguments. Re-inventory immediately before merge; prove every inventoried trigger is paused and no runner is active, merges approved schema-only PR, invokes one selected existing runner under a project flock, then checks canonical Git/server bytes, tracker filename/SHA and subsequent skip. Restore exactly the inventoried triggers only after completion; no global cron stop. Run concurrent-wrapper and apply-success/ledger-interruption rehearsals on disposable DB. New DDL/seeds safely rerun, no claimed atomic runner/blank ledger repair. Application merge is a separate later approval. Phase1 stays inert beside current main; only approved app activation arms the legacy guard after backend/credential rollback readiness. No scratch SQL in deploy checkout and no Windows working-copy hash as canonical.
- [ ] Merge only approved exact head with all gates; watch PR if waiting on checks/reviews, and unwatch before handback. Deploy omitted Edge artifacts through approved runbook; inspect actual frontend/function commit identity rather than assuming main implies deployment.
- [ ] Pair CureMed's intended number with user's participation. Request credentials through request_secret, never chat; don't generate/invent secret values. Test recipient and controlled sends need explicit user-supplied numbers/authorization. Keep live customer automations disabled until these proofs pass.
- [ ] Waleed approved staged payment proof/preserve hold. Topology: isolated Supabase-image DB + PostgREST + production-router fixture + Deno handlers; MyFatoorah sandbox token via private secret file, synthetic customer/order and localhost browser callback for real sandbox provider GET; fake WhatsApp transport records jobs without a production sender. Signed webhook fixtures exercise the real handler; genuine provider-originated sandbox webhook requires a separately approved reachable test endpoint and is deferred if absent. Separately authorized production test-class transport/inbound/media checks use approved numbers/account without payment or shopping-hold bypass. Report precisely which proofs passed, fixture versus provider-originated webhook, and that live production payment-trigger proof remains deferred until hold lifted. No synthetic private receipts in production.
- [ ] Enable approved provider/audiences/recipients after health checks. Record applied migrations, deployed SHA, pinned gateway, pairing/controlled-send evidence and remaining limitations. Preserve jobs/schema on rollback; park uncertain sends. Retain worktrees unless approved cleanup conditions hold.

## Specification coverage and debate record

Parity mapping: connection/session→Tasks 4/7/10; inbox/contact/link/delete/CSV→3/8/10; media/forward/avatars/history→3/9/10; ack/delivery→3/6/7; provider/settings→1/3/4/11; paid automation/email→3/5/6/11; privacy/schema→2/3/4; runtime/release→0/12/13/14. All twenty specification acceptance points are covered by these tasks and the final parity evidence table.

Four debate rounds are required before implementation. Each round uses a new Claude Opus 5.5/high T3 review task; findings are ruled accept/partial/reject with concrete reasons and amendments here or in the referenced contract. Do not claim read-only sandboxing: review restrictions are in the brief; the manager verifies document hashes and Git status before/after.

### Round 1 completed — manager verdicts

Dispatch returned claudeAgent/claude-opus-5-5 with effort=high. Original review: `2026-11-03-whatsapp-evolution-round1-findings.md`. Before/after spec SHA256 861D58424C32EE6DD60893F6EE171AA787C58A88547C7B0DFA21EDA77ADE7A7D; plan SHA256 B12698D568C650BC476B0B7936376405D3293F2F6960DAEEBD5FB88A544941A1; primary HEAD/status unchanged. These establish no edits by reviewer, not sandbox enforcement. Reviewer disclosed one broad donor search outside its allowlist, returning no matches; future briefs restrict exact-file reads/searches.

| Finding | Severity | Verdict | Amendment/reason |
| --- | --- | --- | --- |
| R1-F1 Payment rollback on recipient failure | P1 | Accept | Paid/evidence/durable event commit independently of nested job expansion; enqueue_failed is repairable from snapshots and never falsely scheduled. |
| R1-F2 Legacy Postora/shipment outage at cutover | P1 | Accept | Explicit job classes/gate matrix, inline legacy/manual/test path and bounded server-only legacy key fallback until migration. Add exact regression. |
| R1-F3 Live payment proof conflicts with hold | P1 conditional | Accept | Hold verified live. Waleed approved staged payment proof plus separately authorized live transport/config checks, explicitly deferring live payment-trigger proof. No hold bypass/false live proof. |
| R1-F4 Cutover owner race | P2 | Accept | Immutable first-outcome owner decision returned by payment RPC; Deno never rereads flags to pick sender. Explicit state table. |
| R1-F5 Payment scope/field loss | P2 | Partial | Atomic owner is required by approved spec §5; register narrow writer changes and preserve all existing fields/outcomes. No new pricing/payment-feature redesign. |
| R1-F6 No repair trigger | P2 | Accept | event.repair action and bounded scheduler expansion repair; trusted events need no new guest/admin payment-verify bypass. |
| R1-F7 Incomplete service wrappers | P2 | Accept | Named credential/session/message/heartbeat/sync/media/contact/forward/migration/repair/requeue RPC signatures added before implementation. |
| R1-F8 Migration runner replay/checksum conflict | P2 | Accept | Superseded by R2-F3: approved schema-only PR first, existing runner, canonical Git bytes, rerun/interruption proof and ledger verification before application PR; no invented atomic runner or raw pre-merge psql. |
| R1-F9 Main baseline not proven | P2 | Accept | Superseded by R2-F15: primary stays untouched; manager switches only sanitized HOST-CREATED bootstrap checkout to recorded main baseline, resanitizes and verifies before implementation. |
| R1-F10 Local Kuwait phone compatibility | P2 | Accept | Explicit KW eight-digit default and international normalization tests; live aggregate showed two international rows, no private numbers read. |
| R1-F11 Donor allowed paths missing | P2 | Accept | ChatLink/Avatar/sort/avatar helper and backend chats/avatars explicitly allowed. |
| R1-F12 Bulk webhook/retry assumptions | P2 | Accept | Exact four-event subscription, no base64/bulk sets, size rejection metric, actual retry evidence and bounded history recovery. |
| R1-F13 Generation unavailable in payload | P2 | Accept | Per-generation secret identifies generation; no invented gateway payload property. |
| R1-F14 Never-attempted provider-change recovery | P2 | Accept | Explicit bounded audited retarget action only for attempt_count=0/no token/no provider ID/uncertainty. Never auto-reroute. |
| R1-F15 Manual latency and throughput | P2 | Partial | Inline manual claim, queued/busy result and bounded nudge. Reject unbounded drain; document three/minute scheduler-only baseline/backlog rather than promise instantaneous delivery. |
| R1-F16 DB fixture/runtime integration undefined | P2 | Accept | Superseded by R2-F11: same Supabase image/schema-only fixture and actual non-superuser runner/owners, real roles/default grants, real Edge→PostgREST→SQL→worker with fake provider. |
| R1-F17 Legacy plaintext/exposure | P2 conditional | Partial | Live RLS excludes integration row from public reads; no public leak claim. Still encrypt/migrate, preserve fallback only until success and reject old-browser plaintext writes. |
| R1-F18 Webhook amount GET failure undefined | P2 | Accept | Authenticated GET required before success evidence; unavailable/missing mapping records unresolved and returns 503, bounded replay/repair, never unsigned amount trust. |
| R1-F19 Lock order details | P3 | Accept | Read/share versus write locks and retry/expiry/ack paths specified; cancellation checked at claim, not a recall promise. |
| R1-F20 Scheduler/runtime details | P3 | Accept | Every successful scheduler run heartbeat, flock, fixture read/cache permissions, disposable pre-merge routing and actual post-deploy production proof. |
| R1-F21 Existing settings/templates migration | P3 | Accept | Explicit keys/precedence/audience migration and unrelated template-store isolation tests. |
| R1-F22 Postora sending identity | P3 | Accept | Composer shows provider/account identity and sender mismatch; capture real Postora message-key support rather than infer echoes. |

Additional deployment steering: Waleed has already deployed an existing gateway; use its inspected custom 2.3.7/rc14 build and diagnose/repair it, not a duplicate upstream install. Proposed repair and pending explicit infrastructure approval are in `existing-evolution-readiness.md` outside application checkouts. Its crash-loop and network/config/storage gaps are a release prerequisite, not permission to run production mutations during debate.

Round 2 reviews the amended contracts and these objections. Four total rounds remain mandatory. Unresolved blocking findings or pending necessary user decisions prevent dependent implementation/release; a round cap never lowers correctness requirements.

### Round 2 completed — manager verdicts

Original result: `2026-11-03-whatsapp-evolution-round2-findings.md`. Dispatch returned claude-opus-5-5/effort high. Reviewer and manager confirmed reviewed hashes spec 1D4BC3F9C8B6F35957587E282643B92B662C888F725076E1B43985FF66BB999D and plan AF4FCA73B796CC2062BAB7F430BED9359E250E09C4822E98686838556154CF9B. Primary Git status unchanged. Two rounds remain. During review Waleed explicitly approved gateway infrastructure repair and staged proof with shopping hold preserved; no application migration/merge/pairing/sends are authorized by that approval.

| Finding | Severity | Verdict | Amendment/reason |
| --- | --- | --- | --- |
| R2-F1 No pre-scheduler legacy drainer | P1 | Accept | Bounded inline own-job serial wait/pacing and visible leftovers; scheduler mandatory in same post-function release packet; concurrent legacy/no-heartbeat regression. |
| R2-F2 Payment GET recovery tied to WhatsApp | P1 | Accept | Superseded/refined by R3-F3: signed bound status commits without GET; strict WA evidence waits GET, payment-owned admin recovery independent of gateway. Missing mapping remains bounded unresolved. |
| R2-F3 Inconsistent pre-merge migration protocol | P1 | Accept | Choose simpler schema-only first PR using existing runner/canonical Git bytes, then application PR after live ledger checks. Safe-rerun/interruption rehearsal; no claimed atomicity or scratch SQL in deploy checkout. |
| R2-F4 Cutover/readiness/rollback gaps | P2 | Accept | Atomic enable+cutover0→1 after readiness, stale heartbeat queues after enablement, explicit disable intentional, rollback restores validated Postora/legacy ownership for future first outcomes only. |
| R2-F5 Owner lost in facade call | P2 | Accept | Return/pass evidence ID; facade honors persisted owner snapshot; old workers resolve existing trusted order evidence, never create second ownership. |
| R2-F6 Mutable inputs/repair classification | P2 | Accept | Append-only input revisions; correction rederives only validated recipient/template settings, trusted facts immutable; bounded transient repairs versus deterministic correction. |
| R2-F7 Attempt/PaymentId and GET mismatch | P2 | Accept | Match invoice+external order to service attempt, transaction PaymentId separately verified; terminal mismatch/superseded outcome distinct from unavailable GET. |
| R2-F8 Duplicate partial-index logging | P2 | Accept | Live unique partial index confirmed. Service RPC uses matching partial-index ON CONFLICT predicate; logging does not suppress trusted processing or make replay500. |
| R2-F9 Missing secrets/skew order | P2 | Accept | Pre-code-merge provision all top-level required secrets privately; UI upgrade-pending fallback, old caller compatibility, separate frontend/function identity checks. |
| R2-F10 Env-only Postora key | P2 | Accept | Migrate effective original-precedence source; new code uses encrypted read, but retain server-only env fallback for tested baseline rollback during initial release. No immediate env removal. |
| R2-F11 Fixture ownership differs from production | P2 | Accept | Same Supabase image/schema-only metadata fixture, actual postgres NOSUPERUSER/BYPASSRLS and auth/storage owners verified; adversarial grants retained. |
| R2-F12 Existing gateway pin/runtime/header evidence | P2 | Accept | Refined by R3-F6: record imageID/RepoDigests, immutable local tag, protected save/checksum and autoDeploy off; verify actual reload uses reviewed bytes. No registry-pull assumption; approval needed for registry if required. Headers mandatory or stop. |
| R2-F13 Staging topology missing | P2 | Accept | Concrete isolated DB/PostgREST/router/Deno topology, sandbox-token callback/GET, signed webhook fixtures, fake staging WhatsApp, separately approved real transport; provider-originated webhook only with separately approved public endpoint. |
| R2-F14 Dual renderers/long order summary | P2 | Accept | SQL-only renderer and admin preview RPC; deterministic items-summary truncation with remaining count and explicit overflow errors. |
| R2-F15 Primary checkout disruption | P2 | Accept | Never detach primary. Sanitize T3 bootstrap; manager normal -c checkout at recorded main only inside host-created child, verify/resanitize before source access. Never -C/reset existing work. |
| R2-F16 Current public policy characterization | P3 | Reject current-policy claim | Older migration is denylist, but live pg_policies inspection proved a later explicit storefront allowlist. Document both; no new WhatsApp secrets/settings placed in public-readable rows. Test live-shaped policy. |
| R2-F17 Legacy row writes/source of truth | P3 | Accept | After migration new settings alone are canonical and legacy row rejects browser writes with upgrade message; compatibility supports reads/diagnostics/sends, not plaintext old-form mutation. |
| R2-F18 Legacy request identity | P3 | Accept | Server UUID for old-shaped manual/test/shipped calls; job-class identity constraints; explicitly no replay dedupe promise without supplied request identity. Paid sends bind trusted evidence. |
| R2-F19 Stale gateway spec text | P3 | Accept | Spec now consistently says repair/reuse existing deployment; no duplicate provision or not-yet-provisioned claim. |
| R2-F20 Persistent Edge network/router parity | P3 | Accept | Managed compose+host definition and post-deploy rewrite persistence proof; production-router bytes/hash in protected ignored fixture, never overwrite live router. |

Historical round2 credential state: no keys received. Subsequent approved preparation retained the reviewed image under local tag curemed-evolution:f1100ad, saved a protected archive/checksum, and confirmed app autoDeploy=false; no gateway env/dependency/network/reload/pair/send has occurred. Two private cards expired without values. Safe transport uses a protected server-generated ephemeral RSA key and local public-key encryption of a delivered private file; no SSH password or secret in command arguments/logs. Credential input is still necessary; it does not block static plan rounds3/4.

### Round 3 completed — manager verdicts

Original result: `2026-11-03-whatsapp-evolution-round3-findings.md`. Dispatch returned claude-opus-5-5/effort high. Before edits manager reverified spec 7B3BE991FEA0FC1B406ADDE8BACA35B2689D3E8DB75829F90467E74757C201C3 and plan F7AE59916145F3BC69F7E2E47E77BCF133A42045C5A6D7EB9F906DA2F0F333DF, primary HEAD bb494a4/status unchanged. No unconditional P1; manager resolves conditional P1 via explicitly inert schema phase. Round4 is the final requested plan debate. Historical tables record their reviewed versions; current contract sections and latest verdicts supersede earlier wording.

| Finding | Severity | Verdict | Amendment/reason |
| --- | --- | --- | --- |
| R3-F1 Schema phase compatibility | P2/P1 conditional | Accept | New objects/privileges only; no active existing-table enforcement or existing settings changes. Guard attachment is explicit app activation via fixed service RPC. Required original-main callback/webhook/sender/UI-save matrix on post-schema DB. |
| R3-F2 Baseline rollback loses Postora key | P2 | Accept | Prove/retain protected server env fallback before clearing DB plaintext, do not retire it during initial release; refined by R4-F2: code revert retains guard/read-only mirror, reconciles current nonsecret settings and tests original sender against migrated schema. |
| R3-F3 GET outage blocks paid recording | P2 | Accept, preserve existing status policy | Separate signed canonical payment-status/outcome commit from strict GET notification evidence. GET outage cannot hold a bound signed success unpaid; email preserved, WA proof pending. Official V3 webhook guidance supports signature→status→200; no unsupported fixed-amount assumption. |
| R3-F4 Secret rotation skipped by importer | P3 | Accept | Effective compose.env plus JSON update/restart and safe version checks; encryption V2 requires reviewed versioned migration retaining V1, never overwrite V1 in place. |
| R3-F5 Webhook router admission | P3 | Accept | Capture exact router policy and fixture; include admission JWT plus dedicated generation secret in custom headers if required. verify_jwt manifest alone is insufficient; router changes need separate approval. |
| R3-F6 Local image pinning/retention | P2/P3 conditional | Accept | Record imageID/RepoDigests without registry assumption, immutable local tag and protected save/checksum, autoDeploy=false confirmed. Do not convert to registry-pull source blindly; assert exact running Image ID after no-rebuild reload or request registry approval if needed. |
| R3-F7 Inline callback latency | P3 optional | Partial | Commit payment first, buyer-priority single batch, total facade budget; background lifetime only after actual Edge proof, otherwise bounded compatibility path and visible leftovers. No unverified fire-and-forget or instantaneous-callback promise. |
| R3-F8 Schema ref includes app ancestors | P3 | Accept | Normal branch from main inside host-created worktree, restore exact frozen schema/test/docs blobs only, normal hook-protected commit, compare blob IDs/allowlist; merge main back normally before app PR, require zero migration diff. |
| R3-F9 Two migration runners overlap | P3 | Accept | Refined by R4-F6: schema release packet inventories and pauses every actual project trigger, waits existing application to finish, invokes one runner under project flock, verifies skip/ledger then restores schedules. Concurrent/fault rehearsal, no global cron stop or atomicity fiction. |
| R3-F10 Text/gate conflicts | P3 | Accept | Repair approval marked received; enqueue ignores later stale heartbeat; claim gate matrix explicit per class including cutover0 legacy leftovers. |
| R3-F11 Admin recovery input | P3 | Accept | action+order_id only; server selects signed tuple or documented attempt enquiry, no stale client PaymentId authority. No tuple/enquiry result is explicit review, never guessed evidence. |
| R3-F12 Missing private wrappers/skew behavior | P3 | Accept | Named payment outcomes/pending stores and service read/list/resolve RPCs; narrowly audited no-evidence service legacy fallback only under cutover0, blocked after durable activation. |
| R3-F13 Restore recipe collision | P3 | Accept | Same-image isolated fixture only, guarded schema cleanup as supabase_admin, exact owner/extension DDL restore ON_ERROR_STOP, normalized schema/ownership parity before feature migrations as nonsuperuser runner. |

Actual approved gateway preparation: local image tag curemed-evolution:f1100ad; archive /root/curemed-evolution-repair-20261103/evolution-f1100ad.tar (394936320 bytes), SHA256 35f0fc21d6b3dbfc88c62a2c46c968decfdb7707ae29b0e3a241c56428616944; image identity unchanged be2c...; Dokploy app readback autoDeploy=false/sourceType=github. Registry availability unverified, no API readiness claim. These are preparation steps, not complete repair.

### Round 4 completed — final manager verdicts

Original result: `2026-11-03-whatsapp-evolution-round4-findings.md`. Fourth and final requested Opus 5.5/high debate; no fifth round. Before manager edits, spec SHA256 DB3669D09E7B1B3BC5706B1E13E812CDC308923DE63FBD562C62D12E1DA3BFC3 and plan SHA256 4E5C350E0081246567A9AFDAC5F3D4A162C674E746852CB76B51FDC032E7F304 matched dispatch. Primary HEAD/status unchanged. Reviewer found no P1 and three P2 SQL-freeze blockers. The following are manager amendments, not a subsequent Opus approval. Task 1 may start; SQL freezes only after Codex implements/proves these contracts and the actual-role fixture.

| Finding | Severity | Verdict | Amendment/reason |
| --- | --- | --- | --- |
| R4-F1 Outcome/evidence split and legacy identity | P2 | Accept | Exact per-RPC return shapes; first success-mapped outcome owns legacy immediately without GET; outcome/audience/recipient/content unique key; failed/pending never take owner slot. Test GET outage/replay/failed-then-paid. |
| R4-F2 Activation and rollback authority | P2 | Accept | Ordered source-of-truth/UI-target table; guard+plaintext clear atomic; empty key only; every canonical save mirrors validated nonsecret baseline fields. Reviewed reconcile/export before baseline revert; keep guard read-only to prevent stale-tab reintroduction. Unsafe projections disable sends pending review. |
| R4-F3 No strict verification retry actor | P2 | Accept | Payment-owned reconcile endpoint, shared lease/token claims and six-GET budget, bounded backoff/needs_review/24-hour stale cutoff; same flock script invokes payment then WA. Webhook one GET at most10 seconds; fake-time webhook-only outage proof required. |
| R4-F4 Inert mechanisms/guard owner | P3 | Accept | Per-new-object grants only; no ALTER DEFAULT PRIVILEGES or existing-schema REVOKE; capture private existence and site_settings owner, scoped trigger and table-before-row lock proof. |
| R4-F5 Revision identity conflation | P3 | Accept | settings_revision for conflicts/audit; credential_revision for AAD; provider+account_identity for parking. Template/secret changes on same account neither park jobs nor invalidate preserved ciphertext. |
| R4-F6 Migration trigger inventory | P3 | Accept | Enumerate root/user cron, cron.d, systemd, Dokploy hooks and repo-sync/wrappers; re-inventory, pause and prove idle before schema merge, restore exact inventory. Actual runtime inventory remains a release gate, not claimed completed. |
