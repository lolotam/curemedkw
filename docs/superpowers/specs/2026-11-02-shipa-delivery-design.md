> Historical design record (2026-11-02); current behavior is defined by the code on main and docs/integrations/*. All implementation instructions, status assertions, proof receipts and file/symbol references below describe the historical proposal/checkpoint only. They are not current contracts, execution instructions or evidence of deployed state.

# Shipa Delivery Integration Specification

Date: 2026-11-02
Status: Three Claude Opus 5.5/high debate rounds complete. Final reviewer judged the design correct/ready subject to F1/C1/C2 text amendments; those are incorporated below by the author without a fourth round. Vendor, document-scope, execution-lane and production/staging gates remain. Application implementation has not started.

## 1. Objective and agreed scope

Add `/admin/integrations` with a Shipa Delivery card that lets an administrator configure credentials and delivery settings, test configuration, and select either dispatch mode at any time:

- `manual_after_packing` (default): staff review a paid order's destination and parcel, then explicitly create its shipment.
- `automatic_after_payment`: a verified successful MyFatoorah payment immediately records a durable shipment request and initiates dispatch without a staff click.

Both modes use the same shipment creation path and duplicate protection. Changing the setting does not require deployment. A manual recovery action remains available in automatic mode for eligible orders with no submitted shipment.

Initial release supports one Shipa account per environment, one origin, Kuwait domestic delivery paid through verified MyFatoorah, one parcel per order, and one shipment per order per environment. Additional carriers, warehouses, split shipments, returns, COD/offline-payment dispatch, checkout rate calculation, automatic label printing, and a general integration plugin framework are excluded. This initial payment scope is a business assumption for Waleed's document review, not an assertion that every future delivery must use MyFatoorah.

Customer delivery pricing is unchanged. This feature must not add fees to an already-paid order or change the existing MyFatoorah amount calculation. Any future customer shipping-fee policy is a separate Waleed decision.

Automatic fulfillment cannot equate successful payment with trustworthy order pricing. Waleed selected this safety policy on 2026-11-02: compare each item price and discount with authoritative current catalog/coupon data, and route mismatches or missing evidence to `needs_review` without repricing, refunding or dispatching. Current-price comparisons can flag legitimate price changes, which staff must resolve explicitly. The separate authoritative checkout-pricing fix remains outside this delivery task; the known browser-price trust gap is not silently accepted for automatic fulfillment.

## 2. Evidence and limitations

### Repository evidence

- `src/App.tsx` owns admin routes; `src/components/admin/AdminLayout.tsx` owns navigation and the admin guard.
- `src/lib/admin.ts` checks `user_roles`; `supabase/functions/_shared/caller-auth.ts` provides server-side admin and trusted-sender checks.
- `src/integrations/supabase/clientRuntime.ts` chooses runtime Supabase configuration. New frontend code must use this client. `AdminOrders.tsx` currently imports the generated client and must switch when touched.
- `src/lib/db.ts` owns existing order hooks and maps database rows to UI objects. New integration/shipment hooks should be a focused module instead of enlarging that file.
- Both `verify-myfatoorah-payment` and `myfatoorah-webhook` call `_shared/apply-payment.ts`. This is the responsible layer for verified payment changes.
- The existing payment update and notification claim do not form a reliable delivery queue. A browser callback, notification flag, or fire-and-forget request is not a shipment outbox.
- Existing orders have address/contact snapshots and item quantities, but no parcel weight/dimensions. Automatic mode needs explicit valid parcel defaults; quantities alone cannot determine weight.
- Existing order and order-item RLS allows reading recent guest orders. New shipment and integration tables must not inherit that access.
- `ops/edge-env.manifest.example.json` controls deployed functions and secrets. It expressly excludes `supabase/functions/main/` because the server router differs from the repository.
- `scripts/supabase-post-deploy.sh` can apply migrations. A merge may therefore cause production SQL to run.

### Verified Shipa documentation

Source: <https://developer.shipadelivery.com/get-started>, read 2026-11-02 through its public portal content API.

- Delivery API V2 is current; V1 is legacy and not recommended.
- API calls require an application's API key. App ID is a separate identifier, not an API secret.
- Sandbox base URL: `https://sandbox-api.shipadelivery.com`.
- Live base URL: `https://api.shipadelivery.com`.
- Separate sandbox and live apps/keys are recommended.
- Developer-account activation and live-service activation require Shipa involvement.
- The guide describes creating shipments, tracking status, and generating airway bills.

The public API catalog returned no endpoint specifications. Exact endpoint paths, authentication header, shipment fields, country/address coding, parcel units, service codes, idempotency behavior, reference lookup, cancellation, rate limits, tracking values, and label formats are not verified. They are an explicit vendor-contract dependency, not permission to invent a payload. Implementation task 1 must capture the account's V2 reference before building the provider adapter. If access is unavailable, report the dependency; settings and mocked domain work can proceed, but real booking cannot be called complete.

## 3. Administrator experience

### Integrations page and card

The existing English admin UI gains an `Integrations` navigation item and a Shipa card showing enabled state, active environment, dispatch mode, credential-present indicator, last non-mutating verification result, and sanitized error summary. Opening the card exposes:

- Enabled switch, initially false.
- Active environment: `sandbox` or `live`, initially sandbox.
- Dispatch mode radio group with the two exact modes and their operational consequences.
- Separate sandbox/live API-key inputs and optional App ID metadata. Blank key input preserves the stored key; a separate explicit remove action removes it. Saved plaintext keys cannot be revealed or fetched.
- Origin contact name, phone, and full Kuwait pickup address.
- Delivery service selection populated/validated from the confirmed account contract.
- One-parcel defaults: count fixed at one; weight and any dimensions required by the chosen service use explicit documented units. No fabricated weight fallback.
- Connection/configuration verification that never creates a paid shipment. If Shipa offers no non-mutating credential probe, report local configuration validation only and clearly mark remote credentials as unverified.

Saving uses an expected revision. Concurrent stale edits receive `409 settings_conflict` and must reload rather than silently overwrite another admin's settings. Separate saved values are retained for both environments. Live enablement requires a valid live configuration and credential plus an explicit live-environment confirmation.

Automatic mode cannot be enabled without valid saved origin/service/parcel defaults, approved pricing-safety policy, and a healthy scheduler heartbeat within the preceding three minutes. Configuration readiness is distinct from a successful non-mutating API probe. A stale heartbeat after enablement shows a warning and leaves durable requests queued; it does not lose work, disable manual booking, or falsely claim that delivery is healthy.

### Order delivery panel

Each order drawer shows a separate delivery panel with environment, request state, shipment status, Shipa reference/tracking number, safe tracking/label links when supported, last attempt, and a sanitized error. It does not expose credentials, arbitrary provider payloads, or other orders.

For an eligible paid order, `Create Shipa shipment` opens a review form populated from the order and saved origin/parcel defaults. Staff may correct the shipment's address/parcel snapshot without rewriting the historical billing/order snapshot. Server validation remains authoritative.

Manual submission runs the shared `processShipment(id)` inline with a bounded HTTP deadline and returns the definitive or unknown result; it does not require the minute scheduler. If an order needs pricing/address review, staff must resolve the fields or explicitly acknowledge an allowed integrity exception with a recorded reason. A payment-identity/amount mismatch is never an overridable pricing exception.

The server accepts the order ID and permitted delivery overrides, not a client-selected amount, credential, arbitrary base URL, provider booking state, or trusted-payment flag. Submitting/unknown/created rows suppress duplicate creation. A queued automatic intent can be explicitly adopted by the manual review path under the same unique key and lock. A confirmed pre-submission rejection offers a validated retry; an ambiguous result offers reconciliation, never blind resubmission. Admin reads and reconciliation first expire that shipment's stale submission lease through the same guarded transition as the scheduler, so a crashed manual call remains recoverable with no scheduler running.

Shipment creation means `booked`, not `shipped` or `delivered`. This release shows delivery status separately and does not automatically overwrite `orders.order_status` or trigger the existing shipped WhatsApp notification. Staff retain existing order-status controls.

## 4. Dispatch rules and switching modes

Eligibility is checked server-side immediately before submission: integration enabled; intent environment equals the active environment; credential/configuration complete; ecommerce ordering gate open; payment status paid with a protected verified-success receipt bound to the same order/invoice/payment/amount/currency; order not cancelled, refunded, or partially refunded; valid origin/destination/parcel; current integrity check accepted or explicitly reviewed under the approved policy; no submitted shipment in that environment. Price/coupon/address validation failure is per-order review work, not a retryable provider error.

An admin setting payment status to paid is not verified provider success and cannot cause automatic dispatch. Manual creation also requires verified provider success in this prepaid release. Historical paid orders use an explicit `Verify payment for shipping` action that invokes a separate admin-authorized MyFatoorah verification operation. It queries the provider, checks the stored server-created payment attempt and invoice/amount/currency identity, then records a receipt with `dispatch_decision = manual_reverification`; it never auto-enqueues. The Shipa admin function does not receive the MyFatoorah API token. No production evidence backfill from existing event rows is part of this release, because legacy event processing did not guarantee all the new binding checks. Orders with no valid matching provider payment remain ineligible rather than receiving an invented receipt.

| Change | Effect |
| --- | --- |
| Manual to automatic | Only future first receipt insertions for previously non-paid orders may auto-enqueue. No historical backfill or auto-enqueue for premarked-paid orders. |
| Automatic to manual | Queued automatic intents become ineligible for automatic claim and available for explicit manual adoption. Already submitted/created shipments continue to exist. |
| Enabled to disabled | No intent may transition into submitting after the disable transaction commits. An intent that already entered submitting is in flight and can still reach Shipa; its result must be reconciled. |
| Sandbox to live or reverse | Existing intents remain bound to their original environment. No retargeting, copied credentials, or silent creation in the other environment. Old-environment queued intents pause. |
| Credential rotation | Future calls use the current key for the intent's environment. Existing shipment identity and immutable submitted request remain unchanged. |

An admin can switch modes at any time, but switching never cancels a real Shipa shipment. Explicit provider cancellation/replacement is outside this release. The UI explains pending and in-flight consequences before saving.

Automatic enqueue happens in the verified-payment database transaction, not after it. An authenticated host scheduler drains due work every minute as the mandatory durable path. A best-effort immediate nudge is permitted only if the self-hosted runtime's background-request lifetime is verified in staging: payment functions invoke the worker with their existing service-role credential, without importing the Shipa adapter, encryption key or scheduler token. A nudge cannot record a scheduler heartbeat. If supported background execution is unavailable, omit the nudge and display the one-minute dispatch target. The payment handler never waits for Shipa booking, and no normal-service promise claims strictly instantaneous remote delivery creation.

Unsubmitted ineligibility from mode, disabled state, environment mismatch, ministry hold, or cancellation is derived on reads/claims; do not mass-update intents on every settings save or persist a generic paused state. Restoring eligibility permits the same queued intent to be claimed again. Changing manual to automatic still never manufactures intents for prior payments.

## 5. Data ownership and security

### `public.integrations`

One row for `provider = 'shipa'`. Fields: UUID id; unique provider; enabled; active environment; dispatch mode; integer revision; per-environment non-secret configuration in validated JSONB; safe last verification summaries; `worker_last_ok_at`; created/updated timestamps and admin attribution. Defaults: disabled, sandbox, manual. No seed credentials. Only a scheduler-token-authenticated drain that successfully loads required runtime secrets and completes a database operation updates `worker_last_ok_at`; empty queues count as successful runs.

Only admins can read safe configuration. Frontend writes go through the admin Edge endpoint; grant no direct browser INSERT/UPDATE/DELETE. Non-admins and guests cannot read the row. Database constraints reject invalid provider/environment/mode/revision values.

### `private.integration_credentials`

One row per integration/environment. Store encrypted API key, AES-GCM nonce, key version, and rotation timestamp; optional App ID remains non-secret configuration. The private schema is not exposed through PostgREST. All browser roles have no table/schema/RPC access. Public-schema, service-only SECURITY DEFINER wrapper functions read/write ciphertext in `private` through fixed search paths; explicitly revoke EXECUTE from PUBLIC, anon and authenticated, then grant only service_role. There is no SQL decrypt RPC. Decryption happens only in Edge memory.

Use native Web Crypto AES-256-GCM with a random 96-bit nonce for every write and authenticated additional data binding integration ID, provider, environment, and encryption-key version. The encryption key lives only in server runtime secret `INTEGRATIONS_ENCRYPTION_KEY_V1`, never in the database, Git, logs, `VITE_*`, or `config.js`. Reading settings returns only credential presence and rotation metadata. Encryption-key availability is required for configuring/using Shipa, not for unrelated payment or notification functions. Preserve old key versions until all credentials have been rotated and verified. Document coordinated key/database backup and restore.

V1 ships with one encryption-key version and a `key_version` column. Cross-version rotation is a documented controlled migration, not a general key-management subsystem.

### `private.order_payment_verifications`

One immutable receipt per order (`order_id` primary key and FK to orders ON DELETE CASCADE), written only by service-only verified-payment RPCs. Fields: provider, server-created payment-attempt ID, invoice ID, payment ID, amount in KWD three-decimal precision, currency, source (`callback`, `webhook`, `manual_reverification`), verified timestamp, and first-payment dispatch decision (`enqueued`, `manual_mode`, `disabled`, `integrity_hold`, `manual_reverification`, `already_paid_manual_only`). Neither browser order INSERT fields nor the admin order-status dropdown can write this table. A protected receipt joined by order ID is mandatory before submission. A safe admin summary can expose eligibility and rejection reason without exposing the private table. Shipment history restricts order deletion; a receipt alone does not introduce a new restriction on deleting an order without shipments.

Resolve trusted payment identity through the service-created `payment_attempts` row indexed by the provider invoice ID, never through guest-presettable `orders.myfatoorah_payment_id`/`myfatoorah_invoice_id` or the existing `findOrder` priority chain. The signed invoice ExternalIdentifier must equal `attempt.order_id`; callback/re-verification GET details must establish the same binding. `attempt.amount/currency` are the server-owned invoice expectation and must match the stored order's expected total/currency. A request-supplied order ID is only a lookup hint and cannot override a conflicting provider reference. Capture exact MyFatoorah GET fields and semantics in task 1, then compare any provider-reported amount only from that authenticated GET.

The current webhook signature covers only `Invoice.Id`, `Invoice.Status`, `Transaction.Status`, `Transaction.PaymentId`, and `Invoice.ExternalIdentifier`. Webhook amount/currency, all Event fields including Event.Reference, and every other unsigned field are untrusted metadata. Receipt values come only from those verified signed fields, the service-owned attempt, or an authenticated server GET `/v3/payments/{id}`. Altering unsigned webhook amount/currency cannot affect the receipt or eligibility. Event.Reference cannot authorize receipt creation or suppress processing; derive any deduplication key from trusted signed identity/status instead. If invoice/attempt identity is missing, ambiguous or not yet persisted, do not fall back to browser-set order references.

Unresolved validly signed webhook policy: record/upsert a payment_events row keyed by the trusted invoice/payment/status tuple, preserve its server-assigned first-seen timestamp, set processed=false and processing_error=payment_attempt_mapping_pending, and return HTTP 503 for at most five minutes from that first sighting so the provider can retry. A duplicate unprocessed row must not trigger the old early-200 shortcut. If still unresolved after five minutes, retain a visible payment_attempt_mapping_unresolved admin alert and return HTTP 200 with processed=false; do not retry forever or mark paid. Resolution requires establishing the server-owned attempt/invoice binding, then explicit verification/replay. If binding was permanently lost, staff must investigate/repair it through an approved operational process before a receipt is minted; no automatic browser-field fallback. Logging failure must not be reported as successful processing.

First verified success means the first successful `INSERT ... ON CONFLICT (order_id) DO NOTHING` into the receipt table, independent of whether `orders.payment_status` already says paid. Decide dispatch only if that insert created a row. If the locked order was already paid before this first receipt, record `already_paid_manual_only`, never auto-enqueued. A genuine provider result for a premarked-paid order can therefore establish manual eligibility without automatically shipping it. Existing receipt decisions remain immutable. Re-verifying a legacy order writes `manual_reverification`, never `enqueued`. Price integrity is distinct from amount/identity binding: a genuine receipt does not itself certify the browser-created catalog prices.

### `public.shipments`

One row per order/provider/environment, enforced by a unique constraint shared by manual and automatic paths. Fields: UUID id; order FK with delete restricted; integration/provider/environment; stable merchant reference derived from shipment UUID; source mode; configuration revision; editable `review_snapshot` before submission; immutable `submitted_payload` and hash after submission; booking state; provider shipment/tracking/label metadata; provider status; attempt count; retry count/time; attempt token/lease expiry; last sanitized failure; timestamps/admin actor. Join the private receipt by the existing order ID; no redundant receipt-reference column or third copy of the submitted request.

This table is both the shipment record and durable dispatch queue. No separate general queue infrastructure is introduced. Admins can read it; browser roles cannot directly mutate it; service-only RPCs own transitions. Guests/customers have no direct shipment-table access. No raw credential-bearing request/response is persisted.

### `public.shipment_events`

Append-only safe audit records for submission/result, review overrides, retry/reconciliation/admin actions and provider reference/status changes. Do not log routine lease chatter. Include actor, shipment ID, event kind, timestamp, correlation ID, and redacted summary. No API keys, full provider bodies, addresses, email, or phone in event summaries. Admin read only; server write only. Shipment snapshots retain the operational address under restricted RLS; normal logs do not duplicate it.

## 6. Server operations and concurrency

Implement one provider-specific Shipa adapter, not an interface hierarchy for imaginary carriers. Use fixed sandbox/live host allowlists; do not permit arbitrary admin URLs or credential-forwarding cross-origin redirects. Validate provider-returned tracking/label URLs against documented safe hosts before rendering/opening them; fetching a label server-side needs the same URL controls.

Admin endpoint `shipa-admin` supports validated discriminated actions: read safe configuration; save with revision; verify configuration; inline manual create/adoption; retry a definitively rejected request; reconcile a shipment; refresh status/label metadata when the contract supports non-mutating reads. Every action independently verifies an authenticated admin. Browser anon keys are never sufficient. Responses use stable error codes and safe messages. Historical re-verification is an additional action of the existing MyFatoorah verification endpoint, independently admin-authorized and restricted to manual evidence creation.

Worker endpoint `shipa-dispatch` accepts only POST with either the `x-shipa-dispatch-token` header carrying the runtime secret named `SHIPA_DISPATCH_TOKEN` for scheduler draining or the existing service-role credential in Authorization for a bounded immediate nudge. Scheduler requests additionally send the deployment's anon JWT in Authorization to pass the self-hosted router's global JWT gate; the anon JWT alone does not authorize worker actions. Browser and admin-session tokens without the scheduler secret cannot invoke it. Compare static tokens in constant time. A service-role nudge names one intent and cannot update the scheduler heartbeat. Both scheduler headers live in a root-owned 0600 curl configuration file, never shell command arguments, URLs, or output. Bound scheduled batches to three serial items; no unbounded drain loop. Verify header forwarding and routing in staging rather than weakening or replacing the divergent production router.

Service-only database RPCs implement revisioned config writes, manual intent acquisition, verified payment application/enqueue, and atomic worker lease/state transitions. Revoke execute from PUBLIC/anon/authenticated. Set safe search paths on SECURITY DEFINER functions; prefer invoker behavior with explicit service-role grants when possible.

`apply_verified_payment_result` becomes the atomic owner of verified provider outcomes: lock the integration/settings snapshot and order consistently; never downgrade a paid order due to stale pending/failed responses; apply only allowlisted provider-result fields; bind and insert the private receipt independently of current paid status. Only the first inserted receipt may decide dispatch; an order already marked paid receives a manual-only decision. Otherwise enqueue once if automatic mode is enabled and its integrity policy accepts the order. An integrity failure records a `needs_review` intent/decision, not a paid-to-unpaid change. Duplicate callbacks return the locked current result and never enqueue historical work after a mode change. Preserve cancelled/refunded administrative order states rather than resetting them to confirmed on a late success. No Shipa network call occurs inside this transaction.

All provider-result writers use this owner, including `verify-myfatoorah-payment`'s unreachable-provider `pending_status_update` branch; its current read-then-unconditional-update can race a successful webhook and must be replaced. The webhook's existing payment-events duplicate precheck is an optimization only: row locking, a receipt primary key and the shipment unique constraint provide correctness independently of event insertion races. Do not reuse `order_notified_at` as dispatch evidence. Any explicit approved refund operation is distinct from a stale failure and remains authoritative; this feature does not add a new refund API.

If the callback's provider GET is unreachable there is no invoice identity to resolve. For this cosmetic pending-only update, allow request order_id plus the existing authenticated-owner or guest-token check. The locked RPC rejects updates to paid/refunded/partially_refunded/cancelled states and can never mint a receipt or enqueue from kind=unreachable. This narrow fallback is not valid payment resolution and must not be reused by successful verification, shipping eligibility or admin re-verification.

Invoice creation is another concurrent pending-status writer: after `create-myfatoorah-payment` saves a server-created attempt's invoice, a fast webhook can mark paid before its final order PATCH. Guard that PATCH in SQL against paid/refunded/partially_refunded payment states and cancelled orders, inspect its result, and return current state without another payment redirect when a protected state won the race. No stale create response may reset payment_status to pending_payment or overwrite a protected paid order's references.

The attempt invoice UPDATE itself is payment-critical: inspect its error and affected-row/result identity before updating the order or returning a payment URL. If it fails, return attempt_persistence_failed without payment_url, best-effort mark that attempt failed, and report any failure to persist the failure state; never let a second failed write mask the original error or allow a redirect. The provider may have created an unpaid invoice, but no customer redirect is issued without durable trusted mapping. Task 1 must establish MyFatoorah's same-idempotency-key replay behavior before the retry path can re-POST; if replay safety is unconfirmed, reconcile the existing invoice instead of inventing a new create attempt. Test failed and zero-row attempt writes alongside the fast-webhook overlap case.

Lock order is `integrations -> orders -> shipments`; operations touching only a suffix keep that order. Settings saves lock the integration FOR UPDATE. A single queued-to-submitting transaction locks it FOR SHARE, revalidates enable/mode/environment and order state, then locks the order and shipment before writing the attempt token, lease, immutable payload and submission marker. Build the payload before this transaction and check its expected settings revision/current input fingerprint inside it. This removes a redundant claimed state/RPC. No new submitting transition after disable commits; already-marked submissions remain in flight and may issue/finish HTTP after the save. The UI must not claim otherwise.

One service-only SQL integrity function is used at receipt creation and immediately before submission. It checks current stored order/items, effective catalog prices, coupon discount and required address/parcel data. Submission requires either integrity accepted or a permitted staff pricing acknowledgement whose fingerprint matches the entire current reviewed input. A changed order/item/config/catalog/coupon/override fingerprint invalidates the acknowledgement. Failed integrity moves queued to needs_review in the submission transaction and no provider call starts. Use the same amount formula as payment creation: subtotal + delivery_fee + tax_amount - discount; this release has no supported delivery/tax columns, so any unexpected non-zero fee/tax is review-only, not silently ignored.

A worker begins an eligible submission atomically with a lease and random attempt token, then commits before network I/O. HTTP timeout is 10 seconds, per-item processing deadline 15 seconds, lease 45 seconds, and scheduled request deadline 50 seconds for at most three serial items. Verify staging Edge wall-clock allowance is at least 60 seconds; otherwise reduce the batch while retaining timeout < item deadline < lease and the platform request limit. Manual inline requests process one item with the same bounds. Another worker cannot submit an overlapping attempt. Once submitting is persisted, any crash/timeout becomes unknown, even if the crash preceded the actual HTTP send; conservative reconciliation is safer than guessing that transmission never happened. A late definitive response may resolve unknown only for the same unchanged attempt token. Admin read/reconcile and the scheduler can each expire a stale submitting lease to unknown. No database transaction remains open during HTTP.

| State/result | Required behavior |
| --- | --- |
| queued | Await eligibility and the single atomic begin-submission transaction. |
| submitting | Only owning worker may complete; expired/uncertain execution moves to unknown. |
| created | Store stable Shipa reference; all future create attempts return the existing shipment. |
| definitively rejected before booking | Staff may correct validation data and retry the same intent/reference. |
| unknown or success followed by local persistence failure | Reconcile by confirmed provider reference/idempotency contract; never issue an unguarded create. |
| needs_review | Resolve per-order validation/integrity review explicitly; no scheduled create. |
| unknown plus definitive result for the same attempt token | Complete as created/rejected if no newer attempt has superseded the token; never send another create. |

Do not claim end-to-end exactly-once delivery unless Shipa's verified contract supports idempotent create or authoritative reference lookup. Stable local uniqueness cannot prevent a duplicate at the provider after an ambiguous network result. An immediate lookup returning not found is insufficient if the provider is eventually consistent: observe its documented consistency/processing horizon before treating non-creation as authoritative. If no reliable guarantee exists, retain unknown for operator verification with Shipa and require recorded conclusive non-creation evidence before permitting resubmission.

Only a documented definitive retryable no-booking result may requeue automatically: for example a 429 or maintenance response only if the captured provider contract guarantees no booking occurred. Use three retries after the initial attempt, delayed 1, 5 and 15 minutes (`retry_count` 0 through 3; at most four total provider calls). Exhaustion becomes rejected for staff action. Credential/configuration errors require correction, and provider validation/address errors become needs_review, not timed retry. Network timeouts, connection resets after possible transmission, undocumented 5xx and malformed success responses are ambiguous and cannot use this schedule. The exact retryable error allowlist remains empty until supported by task 1 evidence. Redact upstream response bodies and secrets before creating log summaries.

Retry actor: when a scheduler is present it may process a due manual-source row in either dispatch mode because staff already approved that exact fingerprint. Integration enablement, active environment, order/payment state and fingerprint/integrity rules still apply. Without a scheduler the panel exposes Retry now after retry_at; that explicit action runs the same begin-submission path inline and does not reset retry_count. Automatic-source rows still require automatic mode or explicit staff adoption; changing mode is not consent to submit a previously unreviewed manual row.

## 7. Compatibility and operational behavior

- Missing integration row, encryption key, or dispatch token must leave existing storefront/payment behavior usable; Shipa remains disabled/unavailable with an admin explanation.
- Rollout order is additive migration and privilege proof first, then payment/worker functions, then admin UI, then separately approved scheduler/live enablement. New payment functions must fail loudly/closed if their atomic RPC is absent; do not fall back to an unguarded legacy update. During rollback retain the schema and receipts; if legacy payment functions run temporarily, successful payments can lack receipts and must use explicit manual re-verification after restoration.
- Provider outages never change a paid order to unpaid or roll back a committed provider payment. Database write failures are reported for retry; they are not swallowed as success.
- Booking failure does not automatically refund, cancel, or amend an order.
- Ministry hold, cancellation, and refunds make unsubmitted intents ineligible; the UI derives the waiting reason. A submitted shipment requires staff coordination; no implied cancellation API.
- New admin code uses `clientRuntime`; do not rename or edit the auto-generated `client.ts`.
- UI follows existing shadcn patterns, labeled inputs, keyboard-accessible mode selection/dialogs, pending states, and explicit errors. Do not redesign unrelated admin screens.
- Keep the verified payment payload tests, cart-until-paid behavior, email, and WhatsApp behavior intact.
- Orders with shipment history cannot be deleted and show an explanatory admin message. Change `useDeleteOrder` to delete the parent order only, relying on the existing order_items ON DELETE CASCADE. Its current separate child-first deletion could destroy items before the new shipment FK rejects parent deletion; a rejected delete must leave both parent and items intact.

## 8. Acceptance and proof

1. An admin saves separate sandbox/live settings and rotates either key without receiving plaintext on reads. A stale revision cannot overwrite newer settings.
2. A non-admin, guest, and anon-key caller cannot read configuration/credentials/shipments, create a shipment, mutate queue state, or invoke the worker.
3. Manual is the disabled-by-default initial mode. A paid verified order can be reviewed and booked once; unpaid/cancelled/refunded/hold-blocked orders are rejected server-side.
4. Automatic mode queues only an eligible first future receipt for a previously non-paid order. Two concurrent callback/webhook successes yield one receipt/intent. Admin/guest-premarked paid status alone yields none; a later genuine matched provider success creates a manual-only receipt. A guest order with copied payment/invoice IDs cannot divert a real payment from its service-owned attempt/order; changing unsigned webhook amount/currency/Event.Reference cannot alter receipt identity/amount or suppress correct processing.
5. Switching either way obeys section 4; old paid orders are not backfilled, queued work never changes environment, and a payment replay after switching cannot create a new intent.
6. Parallel manual/automatic requests and two workers yield at most one provider create attempt while its outcome is uncertain. Crash-before-marker, crash-after-marker-before-HTTP, crash-after-send, and provider-success/local-write-failure are tested separately. A guest adding/changing order items after payment or after staff review forces a fresh integrity/fingerprint check before submission.
7. A timeout produces unknown and no automatic create retry. Reconciliation/validated retry behavior matches the captured Shipa contract.
8. Sandbox requests never contain a live key; live requests never use a sandbox key. User-supplied hosts and redirects cannot receive credentials.
9. Shipa outage leaves payment success recorded. Queue survives process restart and the one-minute scheduler eventually discovers due work.
10. Integration/shipment RLS, private receipt access, privileged RPC grants and concurrency are tested with actual database roles in the isolated Postgres harness specified in the plan, not only SQL text matching. Harness unavailability blocks PR readiness; no tests target production.
11. Status/label refresh uses a confirmed non-mutating API. Created booking does not set an order to shipped. No checkout fees change.
12. Secret key restore/rotation and disabling the worker are documented and exercised in a non-production environment before live enablement. Manual booking and recovery from an expired manual submission are proven with the scheduler absent; scheduler heartbeat is tested with an empty queue, wrong custom-header token, anon JWT alone, missing runtime key and stale timestamp.
13. Failed/zero-row attempt-invoice persistence returns no payment URL; fast callback/webhook overlap cannot reset a protected status. Valid unresolved webhook mappings exercise the five-minute 503-to-visible-unresolved-200 policy with an unprocessed dedup row, never a false processing success.
14. Due manual-source retries run through the scheduler in either mode, or through staff Retry now when no scheduler exists. Unreachable-provider order-ID fallback is authorized and cosmetic only; paid/refunded/cancelled status, receipts and shipment intents remain unchanged.

SA-15 applies: local typecheck, targeted lint, and changed-area tests during implementation; at most one heavy local job at a time across sub-sessions. Full local suite once immediately before PR. No GitHub Actions workflow is added to this private repository without Waleed's decision. Known baseline from the earlier analysis: 85 tests passed, typecheck/build passed, repository ESLint had 233 errors and 20 warnings; these are historical evidence, not results for this feature.

## 9. Delivery sequence and authority

1. Produce spec/plan and debate with Claude Code `claude-opus-5-5`, effort `high`, stopping after at most three rounds.
2. Waleed reviews the documents. Implementer: MiniMax `m:minimax:MiniMax-M3.1-Flash:v:` as explicitly selected.
3. After implementation, fresh review by Codex `gpt-6-astra`, reasoning effort `medium`, before PR creation or CI changes. Findings must be resolved or explicitly escalated.
4. Perform the one permitted pre-PR full local suite, serially. Open/link a PR only when the requested review and validation are complete; no paid CI setup is implied.
5. Production SQL, migrations, scheduler installation, live credentials/activation, and any merge that auto-applies SQL require Waleed's explicit production decision through the super admin. This document authorizes none of those production actions.

No worktree removal is authorized by this feature. SA-14 evidence and super-admin approval remain mandatory for a future removal.

SA-16 is active: questions/approvals go only to the super admin through SA-DECISION/SA-APPROVAL lines, with recommended option first, alternatives and blocked work. No direct Waleed/Slack/ntfy questions. The living handoff is F:\Dev\Projects\SuperAgent-Jahra\handoff\curemed.md and must be read first after compaction, followed by SA-14/15/16. Implementation execution-lane compatibility with inherited OpenCode-only MiniMax restrictions remains a separate decision; model selection is already settled.
