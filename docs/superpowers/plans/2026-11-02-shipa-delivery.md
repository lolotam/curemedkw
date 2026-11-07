> Historical design record (2026-11-02); current behavior is defined by the code on main and docs/integrations/*. All implementation instructions, status assertions, proof receipts and file/symbol references below describe the historical proposal/checkpoint only. They are not current contracts, execution instructions or evidence of deployed state.

# Shipa Delivery Implementation Plan

> **For agentic workers:** Implement this plan task by task with the user-selected MiniMax M3.1-Flash. Follow the repository's subagent-driven-development guidance where applicable, but do not spawn additional workers or change models without authorization. Required pre-PR reviewer: Codex GPT-6 Astra at medium reasoning effort.

**Goal:** Add secure Shipa settings and selectable manual-after-packing or automatic-after-verified-payment dispatch without duplicate bookings or changes to checkout pricing.

**Architecture:** Extend the existing React admin and Supabase Deno backend. Integration settings, encrypted server-only credentials, shipment intents, and audit events live in PostgreSQL. A shipment row doubles as a durable outbox; a bounded worker and one-minute authenticated host scheduler execute a single concrete Shipa V2 adapter. A service-only transaction owns verified payment updates and automatic enqueue.

**Tech Stack:** React 18, TypeScript, TanStack Query, shadcn/ui, Supabase/PostgreSQL/RLS, Deno, native Web Crypto/fetch, Vitest for frontend and Deno tests for Edge code. No new queue platform or CI workflow.

**Specification:** `docs/superpowers/specs/2026-11-02-shipa-delivery-design.md`.

**Stage:** Planning complete after three Claude Opus 5.5/high rounds and author application of final F1/C1/C2 amendments. No application code, migration, production change, runtime installation or shipment request is part of this documentation task. Document/lane decisions through the super admin and the vendor contract precede implementation/provider work as applicable. No fourth Claude round.

## Ownership and file map

| Path | Responsibility |
| --- | --- |
| `docs/integrations/shipa-v2-contract.md` | Account-authorized API evidence, request/response fixtures, supported capabilities and safe hosts. |
| `supabase/migrations/20261102150000_shipa_delivery.sql` | Planned new UTC-timestamped additive migration: tables, constraints, RLS, service-only RPCs, evidence protection and outbox. Check filename availability before creating; never edit an applied migration. |
| `supabase/tests/shipa_delivery.sql` | Disposable-DB role, transaction, concurrent-claim and state-machine assertions. |
| `supabase/tests/compose.shipa.yml`, `supabase/tests/fixtures/shipa-baseline.sql`, `scripts/test-shipa-db.mjs` | One isolated Postgres service, minimal current-schema/role fixture and assertion/concurrency runner; never production. |
| `supabase/functions/_shared/shipa-contract.ts` | Confirmed provider schemas and mapping only. |
| `supabase/functions/_shared/shipa-client.ts` | Fixed environment hosts, auth header, non-mutating verification, create, lookup/status/label operations supported by the contract. |
| `supabase/functions/_shared/integration-credentials.ts` | AES-GCM storage/read helper, versioned runtime key loading, no plaintext response/logging. |
| `supabase/functions/_shared/shipa-dispatch.ts` | Eligibility, lease/submission transitions, classification/reconciliation, bounded serial drain. |
| `supabase/functions/shipa-admin/index.ts` | Admin authorization, action validation, safe settings and shipment operations. |
| `supabase/functions/shipa-admin/handler.ts`, `supabase/functions/shipa-dispatch/handler.ts` | Exported request handlers, tested in Deno without starting HTTP listeners; thin index files register Deno.serve. |
| `supabase/functions/shipa-dispatch/index.ts` | Dedicated scheduler-token authorization and bounded drain entry point. |
| `supabase/functions/_shared/apply-payment.ts` | Delegate verified outcome mutation to the atomic RPC; nudge dispatch independently from notifications. |
| `supabase/functions/verify-myfatoorah-payment/index.ts`, `supabase/functions/myfatoorah-webhook/index.ts` | Route every provider-result mutation through the owner; add explicit admin-only historical re-verification without automatic backfill. |
| `supabase/functions/create-myfatoorah-payment/index.ts` | Guard the post-invoice pending PATCH against a concurrently paid/refunded/cancelled order, inspect its result and avoid a stale second-payment redirect. |
| `src/lib/integrations.ts` | Typed safe settings/shipment hooks and client action contracts; import `clientRuntime`. |
| `src/pages/admin/AdminIntegrations.tsx` | Shipa card and configuration editor, revision conflicts and readiness. |
| `src/components/admin/ShipaShipmentPanel.tsx` | Order delivery summary, review form, retry/reconcile/refresh controls. |
| `src/pages/admin/AdminOrders.tsx` | Embed the panel and replace the generated Supabase client import with `clientRuntime`. |
| `src/lib/db.ts` | Adjust only useDeleteOrder to delete the parent atomically through its existing cascading item FK, preserving items if shipment history blocks deletion. |
| `src/App.tsx`, `src/components/admin/AdminLayout.tsx` | Lazy route and navigation item. |
| `src/integrations/supabase/types.ts` | Regenerate from the actual non-production schema after migration; avoid hand-invented generated types. |
| `supabase/config.toml`, `ops/edge-env.manifest.example.json` | Function registration/deployment and feature-specific secrets/readiness without breaking unrelated services. |
| `scripts/run-shipa-dispatch.sh` | One bounded scheduler invocation using a protected curl config, no command-line token. |
| `SELF_HOSTED.md`, `scripts/README.md` | Scheduler provisioning, runtime routing, key backup/rotation, rollout/rollback and approval gates. |

Use frontend tests beside frontend code under Vitest. Edge-domain and handler tests live beside the corresponding functions and execute with Deno, not Vitest; preserve real npm: import resolution. Read actual source before every edit; line numbers are deliberately not frozen across implementation.

## Execution setup after scope and lane decisions

- The manager owns vendor research, runtime provisioning, Git commands, migrations in disposable environments, tests and PR operations. If the approved MiniMax lane preserves the inherited file-only restrictions, MiniMax reads/edits the scoped files only; instructions to run checks in the tasks below are manager actions, not permission for the worker to use shell/MCP/web or access secrets.
- The documents are currently untracked in the main checkout. Before an isolated implementation child is created, create a feature branch, stage only the three reviewed Shipa documents and commit them locally. Do not push main or include unrelated untracked material. A T3 worktree starts from a commit and otherwise would not contain these uncommitted documents.
- Create the child's checkout only with T3 delegate_task isolation=worktree, never a shell-created worktree. Pass the approved documents, exact MiniMax model/lane, SA-14/15/16 constraints and file/secret restrictions in its self-contained brief. No production action or worktree removal is implied.
- Update the central handoff with branch/worktree/task state immediately. Retain the checkout until the separate SA-14 removal evidence/approval is satisfied.

## Task 1: Capture the real Shipa V2 contract

**Files:** Create `docs/integrations/shipa-v2-contract.md` and sanitized fixture files in `supabase/functions/_shared/test-fixtures/shipa/`.

- [ ] Obtain the account-accessible Delivery API V2 reference, without asking for secrets in chat. Use a supported secret-entry tool only if a credential is actually needed. Public getting-started material alone is insufficient.
- [ ] Record exact sandbox/live paths, auth header, required origin/destination/contact/parcel fields and units, service/region codes and prepaid/COD semantics.
- [ ] Record non-mutating credential-check support, merchant-reference lookup, provider idempotency scope/retention, error semantics including 429/5xx/timeouts, rate limits, tracking/label formats and allowed URL hosts.
- [ ] Capture the existing MyFatoorah v3 success response's invoice/payment/order-reference/amount/currency fields from authoritative reference and sanitized fixtures. Specify binding against the service-created `payment_attempts` row. Never mint shipping evidence based on a client `order_id` fallback or unsigned/unsupported fields.
- [ ] Confirm MyFatoorah create-time PaymentId vs callback transaction PaymentId semantics and exact same-idempotency-key replay behavior for POST /v3/payments after invoice creation but failed local persistence. Do not re-POST an ambiguous creation without a verified replay contract; reconcile the known invoice instead. Historical re-verification uses identifiers supported by the confirmed GET contract.
- [ ] Record that webhook HMAC signs only Invoice.Id/Status/ExternalIdentifier and Transaction.Status/PaymentId. Resolve its order through the server-created payment_attempts invoice row, require signed ExternalIdentifier = attempt.order_id, and use attempt.amount/currency as the invoice expectation. Never trust unsigned Data amount/currency or Event.Reference; GET /v3/payments/{id} is the authority for any provider-reported amount comparison. Include copied guest payment-ID/invoice-ID and altered unsigned webhook fields as regression fixtures.
- [ ] Save redacted successful create, definite rejection, lookup/status, and label fixtures. Include provider-document URLs and access date; never account keys or customer PII.
- [ ] Decide the adapter's actual retry capability from documented evidence. Without idempotency/reference lookup, unknown results require operator reconciliation and cannot be retried automatically.
- [ ] If the reference remains unavailable, mark provider implementation blocked and continue only independently testable settings/domain tasks. Do not guess endpoints or claim end-to-end completion.

**Proof:** Every provider field and operation in the planned adapter traces to the captured contract. This step performs no paid shipment creation.

## Task 2: Define contracts and focused behavioral tests

**Files:** Create `src/lib/integrations.ts`, `src/lib/integrations.test.ts`, `supabase/functions/_shared/shipa-dispatch.test.ts`, and a documented portable Deno runtime setup incrementally.

- [ ] Before importing Edge modules in tests, provision official portable Deno 2.5.6 under `F:\Dev\Runtimes\deno-2.5.6\deno.exe` (or use an already verified binary of that exact version). Verify the download against the publisher's release checksum and record the chosen artifact/checksum in the test run evidence. Do not change PATH/global tools or production runtime. If the official version/checksum cannot be verified, report EDGE_PROOF_BLOCKED rather than silently choosing another runtime.
- [ ] Keep Deno cache under `F:\Dev\Runtimes\deno-cache` for the job; cache the existing npm imports and pinned standard assertion package before offline targeted tests. Deno test/check is the chosen executable Edge-proof strategy, not a speculative alternative or a Vitest source-text check. This contained test runtime avoids hiding Deno-specific failures behind bundler aliases.

- [ ] Define `DispatchMode = 'manual_after_packing' | 'automatic_after_payment'`, `ShipaEnvironment = 'sandbox' | 'live'`, safe credential-presence metadata, revisioned config, and shipment-state discriminated unions matching the specification.
- [ ] Use Zod schemas to validate config and user overrides, with the required vendor fields established by task 1. Blank credential input means preserve; explicit removal is a separate action.
- [ ] Write focused behavior cases for mode switching, eligibility, no fee changes, environment isolation, invalid parcel defaults, and unknown-result retry denial.
- [ ] Establish fixture-based adapter tests that never call the live API. Keep request mapping and response parsing in the same confirmed contract vocabulary.

The official GitHub release metadata was checked during planning on 2026-11-02 (HTTP 200). Pin the Windows archive to:

- URL: https://github.com/denoland/deno/releases/download/v2.5.6/deno-x86_64-pc-windows-msvc.zip
- SHA-256: `1327356cd63e23d0da7d11d5f5ca6b45902b1b62ee2debd4fbbd0aad2aab9786`.

Implementation downloads only that official archive, verifies Get-FileHash SHA256 against the pinned value before extraction into the named runtime directory, and verifies deno --version reports 2.5.6. No binary was downloaded/installed by this documentation task. If that target already contains a different runtime, use a separate task directory or report the conflict; never overwrite an unrelated installation.

Example behavioral test shape (implement against the concrete function signatures introduced in this task):

```ts
import { assertEquals } from 'jsr:@std/assert@1.0.14';

Deno.test('does not replay historical paid orders when automatic mode is enabled', async () => {
  const order = await fixture.verifiedPaidOrder({ dispatchModeAtPayment: 'manual_after_packing' });
  await fixture.saveMode('automatic_after_payment');
  await fixture.replayVerifiedPayment(order.id);
  assertEquals((await fixture.shipmentsFor(order.id)).length, 0);
});

Deno.test('keeps an ambiguous booking out of automatic retries', async () => {
  const shipment = await fixture.intentReadyToSend();
  fixture.provider.create = async () => {
    fixture.provider.createCallCount += 1;
    throw new Error('timeout after transmission');
  };
  await fixture.drainOne();
  assertEquals(await fixture.state(shipment.id), 'unknown');
  await fixture.drainOne();
  assertEquals(fixture.provider.createCallCount, 1);
});
```

The fixture is a test helper to be implemented with an injected provider client and database transaction adapter; it is not a production abstraction or a production-only test bypass.

**Commands:** Run only the frontend files created here with Vitest and the exact Edge files with the Deno commands below. Expected: new behavior fails before implementation and passes as its owning task completes. Do not run either full suite here.

## Task 3: Add additive schema, server-only credentials, and RLS

**Files:** Create `supabase/migrations/20261102150000_shipa_delivery.sql`, `supabase/tests/shipa_delivery.sql`, `supabase/tests/compose.shipa.yml`, `supabase/tests/fixtures/shipa-baseline.sql`, `scripts/test-shipa-db.mjs`; regenerate `src/integrations/supabase/types.ts` after applying to a disposable database.

- [ ] Create the five tables specified in design section 5, including `private.order_payment_verifications`, unique `(order_id, provider, environment)` intent key, restricted order deletion, revision constraints, and the exact booking-state vocabulary in the service-contract appendix.
- [ ] Store safe config separately from ciphertext; ensure `private` is not API exposed and browser roles cannot access tables or secret RPCs. Browser-writable `orders` columns must never serve as the trusted receipt. Ciphertext wrappers belong to `public` for Edge RPC access, with explicit fixed search path, SECURITY DEFINER and service-only execution; no SQL decrypt function.
- [ ] Add narrowly scoped service-role functions for revisioned config writes, credential storage, integrity checks, shipment intent/review, one atomic begin-submission, complete/expire/reconcile transitions, and safe shipment-event writes. No claimed or generic paused state. Reject stale revisions/fingerprints/tokens.
- [ ] Admins get only the intended safe SELECT policies; no customer/guest shipment policy. Explicitly revoke browser table writes and PUBLIC function execution. Use fixed search paths and grant only required service-role access.
- [ ] Implement the isolated Postgres harness described below. Exercise assertions as anon, authenticated non-admin, authenticated admin, and service_role. Test concurrent unique intent creation and claim acquisition with exactly two connections inside that one serialized job; do not substitute string matching for role tests.
- [ ] Verify disabled/missing integration does not interfere with existing order inserts or payments. Verify applying the additive migration preserves existing data and current guest checkout behavior.

**Proof:** Role matrix and concurrent SQL checks pass in non-production. Production SQL is not run. Review migration catalog privileges, not only function bodies. The feature cannot be PR-ready if this harness is unavailable or any required DB assertion has not executed.

## Task 4: Make verified payment mutation and enqueue atomic

**Files:** Migration from task 3 while still unapplied; `supabase/functions/_shared/apply-payment.ts`; `supabase/functions/verify-myfatoorah-payment/index.ts`; `supabase/functions/myfatoorah-webhook/index.ts`; `supabase/functions/_shared/payment-enqueue.test.ts`; existing payment tests if fixtures need extension.

- [ ] Implement service-only `apply_verified_payment_result` with a consistent integration/order/shipment lock order, allowlisted fields, persistent verified-success evidence and paid-state downgrade protection.
- [ ] Atomically bind and INSERT the first receipt ON CONFLICT(order_id) DO NOTHING; compute its immutable dispatch decision only if inserted. Do not return early merely because the order was premarked paid. A genuine first receipt on an already-paid order gets already_paid_manual_only and never auto-enqueues. Otherwise use saved enabled/automatic settings; failed catalog/coupon integrity produces needs_review without booking. Implement one SQL integrity function reused at payment and submission. Use integer millis/three-decimal numeric and the same subtotal + fee + tax - discount formula as payment creation; non-zero unsupported fee/tax requires review. Current exhausted/changed coupon availability is a conservative review flag, never a charge change or proof of fraud.
- [ ] Distinguish guest/browser-supplied paid fields and the admin payment-status dropdown from genuine verified provider success. Neither can synthesize evidence or auto-enqueue.
- [ ] Have `applyPaymentToOrder` use the RPC for callback and webhook outcomes. Preserve `ApplyResult` behavior required by callers; determine actual changed/current status from the locked row, not the stale preloaded row.
- [ ] Move the unreachable-provider pending_status_update writer through the owner. Resolve trusted order identity from the server-owned attempt/invoice, not findOrder's guest-presettable columns. Replace/remove deduplication based on unsigned Event.Reference; correctness comes from locked receipt/intent uniqueness and any optimization uses signed identity/status. Preserve cancellation/refund state on late results.
- [ ] For GET-unreachable callback responses only, use request order_id after existing owner/guest-token authorization for a cosmetic pending update. RPC kind=unreachable preserves paid/refunded/partially_refunded/cancelled states and never creates receipt/intent. Do not apply this exception to success or shipping evidence resolution.
- [ ] For a valid signed webhook with absent server-attempt mapping, upsert a trusted invoice/payment/status-keyed payment_events record preserving server first-seen time and processed=false. Return 503 with payment_attempt_mapping_pending for five minutes; unprocessed duplicate rows cannot shortcut to 200. Beyond five minutes return 200 processed=false with a persistent payment_attempt_mapping_unresolved admin alert. Never mark paid or fall back to guest-set references; require binding repair and explicit verification/replay. Test boundary/replay and logging errors with a controlled clock.
- [ ] Guard create-myfatoorah-payment's final order PATCH with an atomic predicate excluding paid/refunded/partially_refunded payment states and cancelled orders. A webhook can win after the attempt invoice is stored but before this PATCH. Inspect errors/zero affected rows; return current paid/terminal state without another payment redirect, and do not overwrite protected references. Add a forced-overlap regression for this separate pending_payment writer.
- [ ] Before that guarded PATCH, inspect the payment_attempts invoice UPDATE error and selected affected identity. On error or zero rows return attempt_persistence_failed with no payment_url, attempt to mark failed and inspect/log failure of that best-effort write. No redirect before trusted mapping persists. Include DB failure/zero-row and same-idempotency-key behavior in the overlap/recovery regression; do not assume replay is safe before task 1.
- [ ] Add `action: 'verify_for_shipping'` to the existing verification endpoint with independent server-side admin authorization, not an ownership bypass for ordinary verification. Query MyFatoorah and bind invoice/attempt/amount/currency, record `source/dispatch_decision = manual_reverification`, and return only safe eligibility metadata. No production event-row backfill and no automatic dispatch for historical re-verification.
- [ ] Keep notifications independent. The scheduler is mandatory for automatic recovery. Only if staging confirms supported background request lifetime, nudge one intent using the payment function's existing service-role credential; do not distribute `SHIPA_DISPATCH_TOKEN`, import the adapter, load the encryption key or hold the payment transaction open for Shipa. Otherwise omit the optimization and retain the documented one-minute target.
- [ ] Test callback/webhook overlap, paid-vs-failed overlap, repeated success after switching mode, missing integration, genuine success after admin/guest-premarked paid, copied payment/invoice IDs in a guest-created order, altered unsigned webhook amount/currency/Event.Reference, missing config and Shipa outage. No provider outage can revert confirmed payment; untrusted identity cannot mint a receipt.

**Proof:** One intent for concurrent eligible successes; no paid downgrade; no duplicate historical enqueue. Existing `src/lib/payment.test.ts` and `src/lib/myfatoorahPayloadSource.test.ts` continue to pass. Use targeted tests only.

## Task 5: Implement native secret encryption and the concrete adapter

**Files:** Create `_shared/integration-credentials.ts`, `_shared/shipa-contract.ts`, `_shared/shipa-client.ts`; Deno tests adjacent to those modules.

- [ ] Load the V1 256-bit runtime key server-side; use native AES-GCM, random 96-bit nonces and integration/provider/environment/version-bound additional data. Reject missing or invalid keys without affecting unrelated functions. Retain the key-version field and a controlled rotation procedure without implementing a general key registry.
- [ ] Implement preserve/replace/remove semantics via the service-only secret storage operation. Read APIs return metadata only. Confirm credential rotation and restore behavior.
- [ ] Implement the verified API contract with fixed hosts, correct auth, validated requests/responses, bounded timeouts and redirect rejection. Do not forward credentials to provider-returned or user-supplied arbitrary hosts.
- [ ] Implement a safe non-mutating connection check where supported; otherwise distinguish local validation from remote credential verification. Never use createShipment as a connectivity probe.
- [ ] Implement creation, status/label refresh, and documented reference reconciliation. Classify errors using documented semantics; unknown outcomes never become safe retries merely because HTTP returned 5xx.
- [ ] Prove encryption roundtrip, nonce uniqueness, wrong-context decryption rejection, sandbox/live key isolation, redaction, invalid upstream JSON, URL safety and ambiguous network outcomes with injected fetch and fixtures.

**Proof:** Fixture and encryption tests pass without real keys, network shipments, new dependencies or heavy jobs.

## Task 6: Implement safe manual operations and bounded queue worker

**Files:** Create `_shared/shipa-dispatch.ts`, `shipa-admin/index.ts`, `shipa-dispatch/index.ts`; targeted Edge-domain tests.

- [ ] Validate request methods and discriminated actions. Independently authorize admin operations using server-verified identity/role. Worker accepts only its dedicated scheduler token or the already-existing service-role credential, compared in constant time; only scheduler authentication can update the scheduler heartbeat. Limit batch size to three serial items and one intent for a service-role nudge.
- [ ] Create/review one manual intent using trusted stored order data and permitted delivery overrides. Preserve historical order snapshots. Server checks verified payment, order/refund/hold state and active environment.
- [ ] Manual creation/adoption immediately invokes the shared `processShipment(id)` inline with the same states and 10-second provider timeout as the scheduler. It must work while no scheduler exists. Record explicit staff reason/actor for an approved price-integrity exception; do not permit overriding a mismatched payment identity or missing receipt.
- [ ] Build payload before locking, then atomically go queued to submitting under integrations FOR SHARE, order lock and shipment lock. Validate expected settings revision, current input fingerprint, receipt and fresh SQL integrity; allow an integrity exception only if a recorded staff acknowledgement matches that current fingerprint. Failure moves queued to needs_review and makes zero provider calls. Settings saves use integration FOR UPDATE. Persist token/lease/payload/hash before HTTP; no claimed state/RPC or open HTTP transaction.
- [ ] Persist success and safe references. Crash after submission, lost response, or success-before-database-write failure becomes unknown; expired submitting leases never cause another unguarded create.
- [ ] Admin read/reconcile expires that single shipment's stale lease through the shared expiry RPC before displaying recovery actions. Test crash-after-marker-before-HTTP and crash-after-HTTP with the scheduler absent; staff can still reach unknown/reconciliation without retrying creation blindly.
- [ ] Accept a late definitive result from unknown only when its attempt token is still current and no terminal result conflicts. Fix bounds at 10-second HTTP timeout, 15-second item deadline, 45-second lease and 50-second scheduled request deadline; require staging runtime allowance at least 60 seconds or reduce batch size. Never reuse a timed-out submitting attempt as a new booking.
- [ ] Classify documented definitive retryable no-booking results separately: requeue with retry_count increment and delays 1/5/15 minutes, at most three retries after initial send. Keep the retryable upstream-code allowlist empty unless the vendor contract proves non-creation (including for 429/maintenance). Validation/address/config errors need review/correction; uncertain 5xx/transport outcomes are unknown. Exhaustion is rejected. Preserve original environment/reference and derive waiting eligibility instead of generic paused state; filter eligibility before LIMIT.
- [ ] Name the retry executor: scheduler can process due manual-source rows in either mode with the same reviewed fingerprint; without scheduler, staff Retry now becomes available only after retry_at. Both use begin_submission and preserve retry_count. Automatic-source rows require automatic mode or explicit manual adoption; disabled/environment/hold/order guards still block all sources.
- [ ] Test duplicate manual clicks, manual-vs-auto race, two workers, stale fingerprint/token, guest-added items after payment/review, crashes on either side of the send marker, expired manual call with no scheduler, mode/environment changes, disabled config, definitive retry schedule/exhaustion, and persistence failure after provider success.

**Proof:** Behavioral tests assert provider-call counts and durable state after restart, not only local helper return values. Integration mode can be changed without deployment or history backfill.

## Task 7: Add the Integrations settings card

**Files:** Create `src/pages/admin/AdminIntegrations.tsx` and tests; extend `src/lib/integrations.ts`, `src/App.tsx`, `src/components/admin/AdminLayout.tsx`.

- [ ] Add a lazy `/admin/integrations` route and nav item inside the existing admin guard.
- [ ] Build a single Shipa card/editor using existing controls. Present enable, environment, both mode choices, per-environment key replacement, App ID, origin/service/parcel defaults, readiness and safe last verification.
- [ ] Keep plaintext new keys only in transient component state until save; clear them after success/error handling or environment switch. Never React Query-cache, persist or log plaintext.
- [ ] Save with revision and handle `409 settings_conflict` by explaining reload/review. Warn clearly about live mode, unsubmitted intents and already-started bookings before settings are changed.
- [ ] Show non-mutating verification accurately. Disallow enabling automatic dispatch with incomplete config or a scheduler heartbeat older than three minutes; preserve settings across mode switches. Staleness after enablement shows a warning and leaves intents durable. A nudge must not impersonate a scheduler heartbeat.
- [ ] Test both mode choices, stale-edit conflict, blank-key preserve, explicit removal, no key reveal, disabled defaults, missing key-storage support and incomplete parcel defaults. Verify keyboard labels and pending/error states.

**Proof:** Targeted component/hook tests pass; new code imports `clientRuntime`. No provider secrets appear in safe API response fixtures.

## Task 8: Add delivery actions to the order drawer

**Files:** Create `src/components/admin/ShipaShipmentPanel.tsx` and tests; modify `src/pages/admin/AdminOrders.tsx` and the scoped `useDeleteOrder` implementation in `src/lib/db.ts`.

- [ ] Replace the touched admin order file's generated-client import with `clientRuntime`, retaining existing functionality.
- [ ] Show current-environment shipment state, provider reference, safe tracking/label links and recoverable errors separately from order/payment status.
- [ ] Add paid-verified-only review/create behavior with origin/destination/parcel defaults and permitted overrides. Disable duplicate action while submitting, unknown or created; a queued row is explicitly adopted under its existing unique identity, not recreated. Read/reconcile expires stale manual leases first.
- [ ] Expose safe retry only for confirmed non-creation; expose reconcile/refresh for unknown and created states. Refetch the affected query keys after successful actions.
- [ ] Show retry_at and Retry now for a due, already-reviewed manual-source safe retry, including without a scheduler. Never offer this for unknown outcomes or reset the retry budget. Show payment_attempt_mapping_unresolved alerts and route recovery to binding investigation/re-verification, not Create shipment.
- [ ] Add `Verify payment for shipping` for legacy paid orders without a receipt. Invoke the existing MyFatoorah endpoint's explicit admin action; Shipa code receives no MyFatoorah token. Its success unlocks manual review only.
- [ ] Keep manual review usable in automatic mode where no submitted intent exists. Explain paused old-mode work and keep sandbox/live records visually distinct.
- [ ] Show why orders with shipment history cannot be deleted. In `src/lib/db.ts`, remove `useDeleteOrder`'s independent order_items deletion; delete only orders and rely on its existing ON DELETE CASCADE. Database FK failure then rolls back the single statement without erasing items. Test both an allowed no-shipment deletion and a refused history-bearing deletion with parent/items unchanged. Receipt FK is ON DELETE CASCADE; shipment FK is ON DELETE RESTRICT.
- [ ] Test create/review, unpaid/cancelled/refunded/hold blocks, duplicate clicks, automatic pending state, unknown-state retry denial, safe links and success without order-status mutation.

**Proof:** Existing order interactions and shipped-notification control remain unchanged. Booking creation does not mark the order shipped or modify payment totals.

## Task 9: Prepare self-hosted runtime and recovery documentation

**Files:** `supabase/config.toml`, `ops/edge-env.manifest.example.json`, `scripts/run-shipa-dispatch.sh`, `SELF_HOSTED.md`, `scripts/README.md`.

- [ ] Add both new Edge functions and required deployment entries. Functions with `verify_jwt = false` must enforce the explicit authorization described above; an OPTIONS response grants no action rights.
- [ ] Add feature-specific secret provisioning/readiness for the encryption key and scheduler token. Do not put optional disabled-feature secrets in a global mandatory list that would break existing payment deployment.
- [ ] Verify routing of new function names on the actual runtime in staging. Never copy/replace repository `supabase/functions/main/` over the server's divergent router. Record the exact additive routing action if needed.
- [ ] Provide a one-shot serial drain script and one-minute host schedule. The root-owned 0600 curl config sends Authorization: Bearer with the deployment anon JWT for router admission plus x-shipa-dispatch-token with the dedicated secret for worker authorization. Neither appears in process arguments/cron output. Test wrong/missing custom header and anon JWT alone. No production router exemption is presumed; verify forwarding in staging. Scheduler installation needs separate production approval.
- [ ] Record `worker_last_ok_at` only for a scheduler-authenticated run that successfully loads the key and accesses the database, including an empty queue. Define healthy as no older than three minutes. Test absent/wrong token, missing key and stale timestamp. Confirm supported background-runtime behavior before any optional immediate nudge; otherwise show the one-minute target and omit the optimization.
- [ ] Document safe disable/rollback: disable integration and scheduler first; retain credentials, shipment identities and events; reconcile unknown/in-flight requests; revert app/function changes without dropping tables or reversing payment evidence. Rotate keys with a tested backup/restore path.
- [ ] Make rollout ordering explicit: approved migration/privilege proof, new backend functions, admin UI, separately approved scheduler/live activation. Missing atomic RPC must fail loudly/closed; no unsafe legacy fallback. If functions temporarily roll back to legacy payment code, later restore requires explicit manual re-verification for payments lacking receipts, never automatic backfill.

**Proof:** Staging scheduler recovers a committed queued intent after worker restart and never books while disabled. Syntax-check scripts with available Bash; do not install a production schedule during implementation.

## Task 10: Focused validation, requested review, and PR handoff

**Files:** Changed-area tests, design/plan/debate record, and PR description only after gates pass.

- [ ] Follow SA-15: serialize local typecheck, targeted lint and changed-area tests; coordinate any heavy disposable-DB job so no other sub-session runs one simultaneously. No build or full suite on each edit.
- [ ] Run `npx --no-install tsc -p tsconfig.app.json --noEmit`; require no new type errors.
- [ ] Run ESLint on the exact touched TS/TSX files, including the new Edge code with the appropriate runtime globals. Record pre-existing findings in touched code and fix new ones. Do not present the repository's known global lint failure as a new regression or claim global lint passes.
- [ ] Run targeted frontend Vitest and actual targeted Deno Edge tests sequentially using the exact commands below. Then run node scripts/test-shipa-db.mjs as a separate serialized job. Missing Deno or disposable DB proof blocks the feature PR; record EDGE_PROOF_BLOCKED/DB_PROOF_BLOCKED rather than substituting source-text assertions or mocks for role/concurrency proof.
- [ ] Record mock-based proof separately from a real sandbox end-to-end exercise. Creating a sandbox shipment requires confirmed non-billable sandbox service semantics; no live shipment or production key is used as a test.
- [ ] After MiniMax implementation completes, start a fresh review task using Codex `gpt-6-astra`, `reasoningEffort=medium`. Give it the final diff, this spec, the provider contract and validation evidence. Review before opening the PR; no implementation worker can approve its own changes.
- [ ] Resolve review findings; obtain a new bounded review only if material unresolved risks require it. A code-review pass does not authorize production SQL, CI spending, or live booking.
- [ ] Immediately before opening the PR, run the full local suite exactly once: `npm run test -- --maxWorkers=1 --no-file-parallelism`, with no competing heavy job. Failures are triaged, not repeatedly rerun until green. Run any separately required build once, serially, only if changed runtime/bundling behavior requires proof.
- [ ] Open and immediately link the PR with the host tool. Describe both dispatch modes, vendor-contract limitations, security/concurrency proof and rollout prerequisites. Do not add GitHub Actions while the private-repo spending decision is pending.
- [ ] Route production migration/auto-applying merge approval to Waleed through an `SA-DECISION:` line with the concrete PR, SQL scope and rollback plan. Do not merge or deploy pending that decision. Worktree removal still needs separate SA-14 approval/evidence.

## Readiness and external dependencies

- Confirmed user choices: both runtime-selectable modes; MiniMax M3.1-Flash implementation; Claude Opus 5.5/high design debate, at most three rounds; Codex Astra 6/medium post-implementation review before PR. Manual-by-default is the recommended initial setting for final document review.
- Confirmed 2026-11-02 pricing-safety choice: price/coupon mismatches pause automatic dispatch for explicit staff review without changing the customer charge. Current-price comparisons are conservative; a separate checkout-pricing rewrite is outside this task.
- Explicit design assumptions for review: prepaid Kuwait domestic, one origin/parcel, no checkout-fee change, no historical automatic backfill, no provider cancellation or automatic order-status synchronization in this release.
- Vendor-contract access is required to finish task 1 and real provider work. API keys are not required to write this plan.
- Production database, scheduler provisioning, live activation, auto-applying merges and paid CI remain decisions, not authorized actions.
- The bounded design debate is complete; final author amendments are recorded in the debate audit. Implementation awaits concrete document/lane decisions through the super admin. Provider completion additionally requires the captured API contracts; no completion claim may omit those gates.
- SA-16 is now active: every question goes through an SA-DECISION/SA-APPROVAL line to the super admin with recommended option first and blocked work stated. Preserve exact relayed decisions in F:\Dev\Projects\SuperAgent-Jahra\handoff\curemed.md. The inherited OpenCode-only MiniMax runner constraint is not resolved by model selection; obtain an authorized T3-compatible execution lane before starting MiniMax. Do not use a shell CLI fallback.

## Concrete service contracts for the implementer

These are application-owned RPC names and normalized types, not invented Shipa endpoint names. The vendor field mapping still requires task 1. All RPCs below are in `public` for service-client access, with EXECUTE revoked explicitly from PUBLIC, anon and authenticated; grant only service_role. Safe admin reads/actions are served through the admin-authorized Edge handler, not direct browser RPC access.

```sql
-- Signatures to implement in the new migration; all return safe JSON results
-- except shipa_read_credential, which returns ciphertext only to service_role.
shipa_read_credential(_integration_id uuid, _environment text) RETURNS jsonb
shipa_save_settings(_expected_revision integer, _settings jsonb,
                    _credential_change jsonb, _actor_id uuid) RETURNS jsonb
apply_verified_payment_result(_order_id uuid, _outcome jsonb,
                              _source text) RETURNS jsonb
shipa_request_manual(_order_id uuid, _environment text, _overrides jsonb,
                     _review_reason text, _actor_id uuid) RETURNS jsonb
shipa_check_integrity(_order_id uuid, _review_snapshot jsonb) RETURNS jsonb
shipa_begin_submission(_shipment_id uuid, _attempt_token uuid,
                        _expected_settings_revision integer,
                        _expected_input_fingerprint text,
                        _payload jsonb, _payload_hash text) RETURNS jsonb
shipa_complete(_shipment_id uuid, _attempt_token uuid,
               _result jsonb) RETURNS jsonb
shipa_expire_leases(_shipment_id uuid DEFAULT NULL) RETURNS jsonb
shipa_reconcile(_shipment_id uuid, _evidence jsonb,
                _actor_id uuid) RETURNS jsonb
shipa_record_scheduler_ok() RETURNS void
```

For each actual signature use an explicit grant block, for example:

```sql
REVOKE ALL ON FUNCTION public.shipa_read_credential(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipa_read_credential(uuid, text)
  TO service_role;
```

`private.integration_credentials` and `private.order_payment_verifications` have no browser grants. Wrappers touching `private` use SECURITY DEFINER, `SET search_path = pg_catalog, public, private` and fully qualified object references. Do not expose the private schema through the REST configuration. Add checks to the test harness that newly created functions did not inherit Supabase-style anon/authenticated EXECUTE grants.

### Normalized outcomes and integrity

The Edge mapper produces one of success, failure, pending or unreachable. Success requires a provider-bound order reference, service-created attempt ID, invoice/payment identifiers, integer amount_millis (KWD uses 1000 units per dinar), currency and validated provider fields. Reach the authoritative attempt through its stored provider invoice ID; require the signed/GET order reference to match attempt.order_id. The webhook HMAC covers only Invoice.Id, Invoice.Status, Invoice.ExternalIdentifier, Transaction.Status and Transaction.PaymentId. Use attempt.amount/currency for the invoice expectation; only authenticated GET /v3/payments/{id} may supply a provider-reported amount comparison. Unsigned webhook amount/currency/Event.Reference and guest-presettable order payment-ID fields are never payment authority. No fallback to findOrder's current priority chain is allowed for receipt binding. Missing/ambiguous attempt mapping means verification pending, not a guessed order.

_source is exactly callback, webhook or manual_reverification; only the existing MyFatoorah endpoint may call the last source after independently checking the admin. No request body can supply an authenticated provider outcome. Event.Reference is untrusted descriptive metadata, not a processing/deduplication authorization key. If an event dedup key is retained, derive it from the trusted invoice/payment/status tuple.

Exception only for kind=unreachable: no invoice is available, so an authenticated owner/guest-token-authorized request order_id may identify a cosmetic pending update. It cannot modify protected paid/refunded/cancelled states, establish success evidence or enqueue. Signed success with missing attempt mapping follows the five-minute pending-webhook policy above and must never use this fallback.

`apply_verified_payment_result` returns `payment_status`, `order_status`, `changed`, `receipt_created`, `dispatch_decision`, and nullable `shipment_id`. Its locked result owns response truth. It accepts no arbitrary order-column patch. Success without a matching server-created payment attempt, invoice and amount/currency cannot write a private receipt. `_source = manual_reverification` always records a manual-only decision, even when current settings are automatic.

First valid success means the receipt INSERT ON CONFLICT(order_id) DO NOTHING actually inserts, not that payment_status changes. Compute dispatch decision only on successful insertion. If the locked order was already paid before its first receipt, record already_paid_manual_only and never auto-enqueue; do not return early without a receipt. Existing receipt decisions are immutable on replay.

Use shipa_check_integrity at both receipt/intent creation and submission. Compare positive quantities/current product prices, line totals, subtotal/discount/total using integer millis or three-decimal numeric and the current authoritative coupon rule. Formula matches payment creation: subtotal + delivery_fee + tax_amount - discount; unsupported non-zero fee/tax becomes review-only. No coupon means expected discount zero. Catalog/coupon/required-address mismatch creates needs_review; mismatched provider identity/amount creates no trusted receipt and cannot be manually overridden.

The existing coupon usage increment can exhaust a coupon before payment. Treat that as conservative manual review without decrementing/reusing the coupon or changing the already-authorized amount. Record a safe reason, not an allegation of abuse. Recheck current integrity before scheduled submission to cover catalog/config changes while queued. Explicit staff review records actor, reason, reviewed snapshot/hash and integration revision; editing that snapshot invalidates the acknowledgement and requires review again.

### State machine and SQL preconditions

Persist exactly these booking states:

```ts
type BookingState =
  | 'queued' | 'submitting' | 'created'
  | 'rejected' | 'needs_review' | 'unknown';
```

| Operation | Required locked state/predicate | Result |
| --- | --- | --- |
| automatic enqueue | receipt INSERT actually inserted; previously non-paid order; first decision; enabled automatic config | queued or needs_review; ON CONFLICT returns existing intent |
| manual request/adoption | valid receipt; no prior send; state queued/rejected/needs_review; explicit review complete | queued with source manual and reviewed snapshot |
| begin submission | queued; retry due; active config/order/receipt eligible; expected settings revision and current input fingerprint match; fresh integrity accepted OR valid staff acknowledgement bound to that fingerprint | submitting; atomically persist fresh token, 45-second lease and immutable payload/hash under integration SHARE, order, shipment locks |
| fresh integrity fails | queued; same locked checks; no allowed matching staff acknowledgement | needs_review; zero provider calls |
| complete success | submitting or unknown AND matching current token | created with provider reference; repeated identical result is idempotent |
| definitive retryable no-creation | submitting or unknown; matching token; documented no-booking allowlist; retry_count < 3 | queued; increment retry_count; retry_at uses 1/5/15-minute schedule, at most four total sends |
| no-creation retries exhausted | matching current token; retry_count = 3 | rejected; explicit staff action only |
| provider validation/address/config error | matching token; definite no creation | needs_review; staff correction required |
| definitive permanent no-creation | matching token; documented non-retryable refusal | rejected; safe explicit review/retry if cause is resolved |
| ambiguous completion | submitting AND matching current token | unknown; no retry time |
| expire post-marker lease | submitting AND expired; called by scheduler OR authorized admin read/reconcile for this row | unknown; preserve token for late definitive result |
| reconcile created | unknown AND current attempt/reference bound to authoritative provider result | created without any create call |
| reconcile non-created | unknown; active attempt no longer in flight; documented consistency horizon passed; conclusive evidence recorded | rejected; explicit subsequent review/retry only |

Fencing checks apply to every state mutation. A stale token never changes current state. Build the prospective payload before begin_submission; the SQL integrity/fingerprint/revision check makes that preparation safe against order/items/catalog/coupon/config changes. Fingerprint canonical input includes all reviewed destination/parcel data and relevant current order/items/catalog/coupon/config values; any change invalidates prior staff acknowledgement. SQL returns the fingerprint from its own trusted data, never accepts an arbitrary client claim that integrity passed. No claimed state or pre-submit lease exists. A crash after submission marker but before HTTP is conservatively unknown and must reconcile.

Mode predicate is source-aware: automatic-source work requires automatic_after_payment; staff-reviewed manual-source work and its due safe retries may execute in either mode. The scheduler runs those manual retries when available; otherwise staff explicitly uses Retry now after retry_at. No source bypasses enabled/environment/hold/payment/fingerprint checks, and manual action never resets the retry budget.

Completion of an already-created shipment with a conflicting provider reference must retain the known reference, record an alert and require reconciliation. Old-environment, disabled, hold-blocked and manual-mode automatic intents remain queued but ineligible. Candidate selection filters eligibility before LIMIT, so old ineligible rows cannot starve valid work.

Both inline manual create and the scheduler use one processShipment(id). Provider timeout 10 seconds, item deadline 15 seconds, lease 45 seconds, scheduled request budget 50 seconds, maximum three serial items. If insufficient request budget remains, leave the next row queued. Admin read/reconcile first invokes shipa_expire_leases with that shipment ID; null selects the bounded scheduler sweep, never an unbounded admin action. A missed immediate nudge cannot lose work. Auto enablement requires a genuine scheduler heartbeat within three minutes; service-role nudges do not refresh it.

### Exact test harness and commands

Implement one isolated postgres:15-alpine service in supabase/tests/compose.shipa.yml, with a dedicated test database, no published host port and no production env files. Fixture credentials are disposable. Supply real anon/authenticated/service_role roles (BYPASSRLS for service_role), test auth.uid() reading request claims, auth.users, has_role and current columns/constraints/grants of orders/items/products/coupons/payment_attempts. Trace fixture definitions to source migrations. Before applying the feature migration, deliberately reproduce Supabase's permissive default function privileges for the migration owner in public: grant EXECUTE on new functions to anon/authenticated/service_role. Prove a sentinel function initially inherits browser execution; only then assert the feature RPCs revoke it. Without this adversarial default the revocation proof is invalid on plain Postgres. This proves SQL role/transaction behavior; staging routing/auth remains separate.

scripts/test-shipa-db.mjs refuses non-test targets; resolves only the Compose service container ID; bootstraps fixtures/default privileges; applies the actual feature migration; runs supabase/tests/shipa_delivery.sql with psql -X -v ON_ERROR_STOP=1; and uses exactly two controlled connections for receipt/intent/submission races. Force overlap with a coordinated advisory-lock barrier or an open transaction holding the target integration/order lock before releasing connection B. Assert B actually waited/contended and the final single-receipt/single-send outcome, rather than accepting accidentally sequential calls as concurrency proof. Fail nonzero on missing assertions. No remote DB URL/production key is accepted. Stop the test container, retain failure logs, and never delete arbitrary paths or worktrees.

Run the following sequentially as one heavy job after coordinating availability:

```powershell
docker compose -f supabase/tests/compose.shipa.yml up -d --wait
node scripts/test-shipa-db.mjs
docker compose -f supabase/tests/compose.shipa.yml stop
```

Expected result: all named role/receipt/state/concurrency checks execute and pass, zero provider HTTP calls. If Docker/Postgres is unavailable, report `DB_PROOF_BLOCKED`; do not open the feature PR or claim SQL correctness from mocked tests. Do not start a second heavy job while this harness runs. No harness execution is needed for this documentation-only planning stage.

Targeted frontend/domain examples after the relevant files exist:

```powershell
npx --no-install tsc -p tsconfig.app.json --noEmit
npm run test -- src/lib/integrations.test.ts --maxWorkers=1 --no-file-parallelism
npx --no-install eslint src/lib/integrations.ts src/pages/admin/AdminIntegrations.tsx src/components/admin/ShipaShipmentPanel.tsx src/pages/admin/AdminOrders.tsx
```

Edge proof uses the portable pinned Deno binary, real npm: resolution and separate exported handlers; tests inject mocked provider fetch/database seams and run actual authorization/request/state behavior. No Deno.serve listener or production network is started. Cache dependencies first as a serialized setup action, then use cached-only targeted tests. Install no global PATH entry and make no production runtime change.

```powershell
$env:DENO_DIR = 'F:\Dev\Runtimes\deno-cache'
& 'F:\Dev\Runtimes\deno-2.5.6\deno.exe' --version
& 'F:\Dev\Runtimes\deno-2.5.6\deno.exe' check supabase/functions/shipa-admin/index.ts supabase/functions/shipa-dispatch/index.ts supabase/functions/verify-myfatoorah-payment/index.ts supabase/functions/myfatoorah-webhook/index.ts
& 'F:\Dev\Runtimes\deno-2.5.6\deno.exe' lint supabase/functions/shipa-admin/handler.ts supabase/functions/shipa-dispatch/handler.ts supabase/functions/_shared/shipa-dispatch.ts
& 'F:\Dev\Runtimes\deno-2.5.6\deno.exe' test --cached-only '--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,INTEGRATIONS_ENCRYPTION_KEY_V1,SHIPA_DISPATCH_TOKEN,NODE_ENV' --allow-read=supabase/functions/_shared/test-fixtures supabase/functions/_shared/shipa-dispatch.test.ts supabase/functions/_shared/payment-enqueue.test.ts supabase/functions/shipa-admin/handler.test.ts supabase/functions/shipa-dispatch/handler.test.ts
```

Use only fake test env values with injectable clients; no --allow-net to live providers and no permission to read arbitrary secret files. Lock/pin resolved Deno dependencies in the feature's Deno lockfile. Add credential/client tests to this exact file list as created. Frontend tsc/Vitest cannot substitute for this Edge proof. Missing portable Deno/checksum/cache verification is EDGE_PROOF_BLOCKED and prevents feature PR readiness.
