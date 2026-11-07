> Historical design record (2026-11-02); current behavior is defined by the code on main and docs/integrations/*. All implementation instructions, status assertions, proof receipts and file/symbol references below describe the historical proposal/checkpoint only. They are not current contracts, execution instructions or evidence of deployed state.

# Shipa Delivery Design Debate Record

Date: 2026-11-02
Maximum rounds authorized: 3.
Author/orchestrator: Codex GPT-6.1 Sol, high reasoning effort.
Independent challenger: Claude Code `claude-opus-5-5`, effort `high`.
Implementation model selected by Waleed: MiniMax `m:minimax:MiniMax-M3.1-Flash:v:`.
Post-implementation reviewer selected by Waleed: Codex `gpt-6-astra`, reasoning effort `medium`, before PR.

This record concerns documents only. No application code, SQL migration, provider booking or production configuration was changed by the planning/debate work.

## Round 1

Completed review: <t3-thread://v2/438824e0-fe19-4a22-bb31-f81eff7b7322/thread:delegated-task:command%3Amcp%3A96de57f5-b6d8-4f44-a15e-1fb6da8190ae%3Adelegate-task%3Afdb3e256-7d5d-4220-832e-1f6f6d3269d4>

Verdict: revise before implementation; architecture is fundamentally suitable and does not need a new queue platform or provider-interface hierarchy.

| Finding | Author response and document change |
| --- | --- |
| Verified payment does not certify browser-supplied prices; automatic shipping amplifies the risk. | Accepted. Added catalog/coupon/amount integrity checks and needs_review. Waleed explicitly chose pausing mismatches for staff review without changing the charge. No checkout-pricing rewrite is smuggled into this task. |
| Unforgeable payment evidence had no concrete storage boundary. | Accepted. Added private.order_payment_verifications with service-only writes, invoice/payment-attempt/amount/currency binding and immutable dispatch decision. A browser-writable order column is not sufficient. |
| pending_status_update still bypasses the concurrency-safe owner; webhook duplicate precheck is racy. | Accepted. All provider-result writers use the locked RPC; intent correctness is independent of payment_events prechecks. Preserve cancelled/refunded states on late success. |
| Legacy paid orders lack receipts and have no recovery path. | Accepted problem; rejected automatic production backfill as the preferred fix. Existing legacy events did not prove all the new identity checks. Add explicit admin MyFatoorah re-verification yielding manual-only evidence and no auto enqueue. Offline-payment/COD delivery remains an explicit initial-scope assumption. |
| Manual default mode should not depend on a scheduler. | Accepted. Manual admin action runs shared processShipment inline with bounded timing and the same durable states. Scheduler is needed for automatic recovery, not a normal staff click. |
| Missing late-result handling, lease timing and precise lock order. | Accepted. Defined integrations -> orders -> shipments; integration SHARE lock for submitting vs UPDATE for saves; concrete 10/15/45/50-second budgets; matching-token late result may resolve unknown. |
| Disposable-DB proof and implementation contracts were too vague. | Accepted. Added a single Postgres harness, hard PR gate if unavailable, exact RPC signatures, state-transition predicates and frontend/Edge proof separation. No heavy test ran in this documentation phase. |
| Generic persisted paused state adds mass-transition complexity. | Accepted. Derive waiting eligibility from saved config/order state; queued rows remain durable. Use needs_review only for explicit per-order correction/integrity review. Filter eligible candidates before LIMIT. |
| Remove the immediate nudge to avoid distributing secrets/dependencies to payment handlers. | Partially accepted. Scheduler is the mandatory path with explicit one-minute target. An optional nudge uses the payment function's existing service-role credential and only if background request lifetime is proven; no Shipa adapter, encryption key or scheduler token is added to payment functions. This preserves a possible immediate start without adding a new credential dependency. |
| Heartbeat semantics missing. | Accepted. Added worker_last_ok_at, three-minute activation threshold, success only after scheduler-authenticated key-load and DB access, empty queue included. Nudge cannot impersonate scheduler heartbeat. |
| Private-schema access/decryption/default function grants need precision. | Accepted. Public service-only ciphertext wrappers; explicit revocation from PUBLIC/anon/authenticated; no SQL decrypt RPC. V1 encryption key plus version column and controlled documented rotation. |
| Free-text destination mapping may fail provider validation. | Accepted. Task 1 captures region/address contract; per-order destination failure requires review, not provider retries. No invented address codes. |
| Lease audit chatter and redundant snapshots add avoidable complexity. | Accepted. Audit meaningful submit/result/admin actions; one editable review_snapshot and one immutable submitted_payload/hash. Status/label operations appear only if confirmed non-mutating by the vendor contract. |

## Decisions and remaining boundaries after round 1

- Confirmed by Waleed: price/coupon mismatches pause automatic dispatch for staff review without repricing the customer charge.
- Still requires vendor evidence: exact Shipa V2 API and addressing/idempotency/status/label contract; MyFatoorah normalized amount/reference bindings.
- Still requires Waleed's final document review: initial prepaid MyFatoorah-only domestic/one-parcel scope and the one-minute recovery target when background nudging is unavailable.
- Production SQL/auto-applying merges/scheduler activation/live enablement remain separate explicit decisions; none were requested or performed here.

## Round 2

Completed review: <t3-thread://v2/438824e0-fe19-4a22-bb31-f81eff7b7322/thread:delegated-task:command%3Amcp%3A96de57f5-b6d8-4f44-a15e-1fb6da8190ae%3Adelegate-task%3Ab4ec666a-7326-4410-8976-12efcecc81b8>

Verdict: seven concrete text-level gaps; architecture remains sound and no redesign is needed. No edits/tests/builds by reviewer.

| Finding | Author disposition |
| --- | --- |
| Webhook amount/currency/Event.Reference are unsigned; guest-presettable order references can divert findOrder. | Accepted. Resolve through service-created attempt by signed invoice ID and require signed order reference. Use attempt amount/currency, authenticated provider GET for provider-reported values; never unsigned fields or guest order IDs. Add copied-reference and altered-unsigned-field regressions. Report suspected pre-existing copied-payment-ID issue separately as unverified; no live reproduction. |
| First receipt and first paid transition are different. | Accepted. Insert receipt ON CONFLICT DO NOTHING independently of current paid status; only actual insertion decides dispatch. Premarked-paid orders get already_paid_manual_only, never auto. |
| Integrity predicates/retry transitions disagree with prose. | Accepted. One SQL integrity function at payment and submission; current fingerprint-bound staff acknowledgement; queued to needs_review on mismatch. Define documented safe-no-booking retries with retry_count and 1/5/15-minute delays, max three retries/four sends; validation/config correction and unknown outcomes are distinct. No provider code is retryable without contract evidence. |
| Crashed inline manual call cannot recover without scheduler. | Accepted. Admin read/reconcile expires the same shipment's stale submitting lease before showing recovery. Test both pre-HTTP-after-marker and post-HTTP crash with scheduler absent. |
| Static scheduler bearer token can fail global JWT routing; missing RPC deployment behavior undefined. | Accepted. Anon JWT in Authorization plus secret in x-shipa-dispatch-token; require both routing admission and worker authorization. Add migration-first rollout, fail-loud closed missing-RPC behavior and manual re-verification after legacy-function rollback windows. No production router replacement. |
| Plain Postgres defaults make revoke tests vacuous; races may run sequentially. | Accepted. Fixture deliberately grants browser default EXECUTE and proves a sentinel inherits it before feature migration. Add advisory-lock barrier/forced overlap and assert contention as well as final uniqueness. |
| Deno absent and npm: imports cannot run under Vitest. | Accepted. Choose an official portable pinned Deno 2.5.6 test runtime under F:\Dev\Runtimes with publisher-checksum verification and dedicated cache; actual deno check/test on exported handlers and modules. No PATH/production runtime change. Missing runtime/cache proof blocks feature PR; do not substitute source matching. |

### Further simplifications and author checks

- Accepted combining claim and mark-submitting: one begin-submission RPC, no claimed state or pre-submit lease. Prepare payload outside the transaction and validate revision/current input fingerprint inside. A crash after marking but before HTTP is conservatively unknown.
- Accepted omitting redundant receipt-reference column; join by order_id.
- Accepted matching the payment fee/tax formula, with unsupported non-zero values held for review.
- Retained the optional immediate nudge under the conditions accepted by round 2. The minute scheduler remains mandatory; no new shipping secret is distributed into payment functions.
- Added an author-discovered pending_payment race in create-myfatoorah-payment's post-invoice PATCH: a webhook can pay between attempt persistence and that update. Plan a conditional terminal-state-preserving PATCH and current-state response, with forced-overlap test. This is necessary to uphold the declared payment invariant across all touched result writers.
- The selected portable test runtime is a plan prerequisite, not an installation performed in this documentation task. Docker availability was observed by the reviewer, not used as evidence that DB tests ran.
- SA-16 applied during this round. All subsequent questions/decisions go through the super admin; current task state and exact choices are preserved in the existing curemed.md handoff. The inherited MiniMax OpenCode-only execution lane is unresolved and must not be silently bypassed.

## Round 3

Completed final review: <t3-thread://v2/438824e0-fe19-4a22-bb31-f81eff7b7322/thread:delegated-task:command%3Amcp%3A96de57f5-b6d8-4f44-a15e-1fb6da8190ae%3Adelegate-task%3A907dd248-780c-4cb2-8a7f-42bd765e50bc>

Reviewer verdict: design correct and ready subject to one small material text fix F1 and clarifications C1/C2; the author can make all three without a fourth round. Remaining completion gates are vendor/user/lane/staging dependencies, not an architectural redesign. Reviewer changed no files and ran no tests/builds.

| Item | Final author amendment |
| --- | --- |
| F1: unchecked attempt invoice persistence now controls trusted payment resolution. | Spec section 6 and plan task 4 now require checking the attempt UPDATE error and returned identity, returning attempt_persistence_failed with no payment_url on error/zero rows, and inspecting any failure of the best-effort failed-state write. Task 1 must verify MyFatoorah same-key idempotency replay before any create re-POST. Add regression for write failure/zero rows and fast-webhook overlap. |
| F1 rider: unresolved signed identity previously returned 200, so provider retry was only implied. | Chosen explicit policy: record a trusted-tuple keyed unprocessed event preserving server first-seen; return 503 for five minutes, then visible unresolved alert plus 200 processed=false. No unprocessed-event dedup shortcut, no endless retries, no browser-reference fallback. Persistently lost mapping needs approved binding investigation/repair then explicit verification; it is never a fabricated receipt. |
| C1: actor for manual-source timed retries absent when scheduler not running. | Scheduler, if present, can execute due staff-reviewed manual-source retries in either mode; otherwise the panel exposes staff Retry now only after retry_at. Both use the same begin_submission, preserve retry_count and current fingerprint, and obey all enable/environment/order/hold checks. Automatic-source work still requires automatic mode or explicit staff adoption. |
| C2: provider-unreachable branch has no invoice to resolve by. | For this cosmetic pending-only callback update, choose request order_id after existing owner/guest-token authorization. The locked owner preserves paid/refunded/cancelled states and never creates evidence or intents from unreachable. This exception is prohibited for success/shipping resolution. |

All three author amendments are incorporated in both documents. They have been self-checked against the final review; there is no fourth independent approval claim. Exactly three Claude Opus 5.5/high rounds were used. The repeated delivery of the final completion notice did not start another round.

## Final readiness and handoff

- Documentation task complete. Files remain local/untracked for review; no application source, migration, runtime installation, provider shipment, PR or production configuration changed.
- Final source-based concern preserved: a possible pre-existing copied-payment-reference order-resolution weakness was identified, not reproduced against production. Trusted attempt/invoice binding and non-production regressions are required by this plan. Multiple invoices for one order can still permit duplicate customer charges; preventing all concurrent multi-invoice payment creation is outside this delivery release and is not represented as solved by shipment uniqueness.
- Pending decisions via the super admin: approve the reviewed v1 scope/recovery target and implementation start; resolve the legacy OpenCode-only execution-lane constraint for the selected MiniMax model; obtain the account-accessible Shipa V2 reference or explicitly limit work to disabled local settings preparation.
- Provider work also requires verified MyFatoorah GET/idempotency semantics. Staging must prove router headers, runtime budgets and any optional nudge lifetime. Implementation must verify the portable Deno artifact checksum and execute actual Deno plus adversarial SQL/concurrency proof; no documentation review is substitute evidence.
- Production SQL/auto-applying merges, scheduler provisioning, live activation and any paid CI remain separately gated. Codex GPT-6 Astra/medium reviews the implementation before PR. No worktree removal is pending.
