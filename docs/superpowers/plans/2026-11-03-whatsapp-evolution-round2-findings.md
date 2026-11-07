> Historical design record (2026-11-03); current behavior is defined by the code on main and docs/integrations/*. All implementation instructions, status assertions, proof receipts and file/symbol references below describe the historical proposal/checkpoint only. They are not current contracts, execution instructions or evidence of deployed state.

# Opus 5.5/high round 2 — original findings

Reviewer link: <t3-thread://v2/438824e0-fe19-4a22-bb31-f81eff7b7322/thread:delegated-task:command%3Amcp%3A2ab4ac78-5db5-40ac-8c50-c442ecc10107%3Adelegate-task%3Acuremed-whatsapp-plan-opus-round2-20261103>

Dispatch returned claude-opus-5-5 with effort=high. Manager checked both original document hashes and Git status before amendments. Findings below precede the user's approvals of gateway repair and staged payment proof; those approvals are now recorded in the amended plan.

# Round 2 adversarial plan review: WhatsApp Evolution and paid-order automation

**Integrity and scope.** Both document hashes matched the brief: spec `1D4BC3F9…B999D` and plan `AF4FCA73…CF9B`. I edited nothing and ran no tests, network calls, git commands or production actions.

Files read:
- The four briefed documents.
- `supabase/functions/_shared/{apply-payment,payment-security,caller-auth}.ts`
- `supabase/functions/{create-myfatoorah-payment,verify-myfatoorah-payment,myfatoorah-webhook,send-whatsapp}/index.ts`
- `scripts/apply-self-hosted-migrations.sh`, `scripts/supabase-post-deploy.sh`
- `ops/edge-env.manifest.example.json`
- `SELF_HOSTED.md` (lines 100–159 plus a keyword scan)
- Migration `20260523155217_…sql`
- Excerpts of `src/pages/admin/AdminOrders.tsx` and `src/pages/admin/AdminWhatsApp.tsx`

I did not read `AdminOrderEmail.tsx` beyond one grep hit, and read no donor or Shipa files. I made no directory-wide searches.

---

## P1: blocking

### R2-F1 · P1 · Legacy and manual jobs have no drainer between merge and scheduler install (R1-F2 amendment still fails)
- **Section:** plan L154 (job-class table says `legacy_event` needs "no scheduler required"), L155, L158 ("scheduler is the mandatory eventual path"), L133 (one unexpired `sending` job per account, 1-second minimum slot).
- **Scenario:**
  1. Merge auto-deploys while cutover is still 0. The scheduler cannot exist before `whatsapp-dispatch` is deployed, and installing it needs its own approval.
  2. Two legacy sends overlap: two orders paid close together, a paid order plus an admin marking another as shipped, or `admin.new_order` to more than one number.
  3. The first inline claim takes the account slot. The second inline claim is busy, so its job is queued.
  4. The "bounded nudge" fires while the slot is still held or inside the 1-second interval, so it claims nothing.
  5. Nothing drains the queue until a scheduler exists. A message that sends today is silently stuck.
- **Evidence:** `send-whatsapp/index.ts:245-260` sends up to 10 recipients serially inline, with no slot. `apply-payment.ts:185-236` dispatches fire-and-forget, so the caller never sees the result. Inline busy behaviour is specified only for `manual` (L155), not for `legacy_event`.
- **Smallest fix:**
  - (a) The inline `legacy_event`/`manual`/`test` path sends its own job set serially within its request deadline. It waits for the slot and paces 1 second inside the budget. It reports leftovers truthfully rather than leaving them for a scheduler that may not exist.
  - (b) Make scheduler installation a mandatory step in the same approved release packet, executed immediately after function deploy and before the release is called complete.
  - (c) Add a regression: cutover 0, no scheduler, two concurrent legacy sends → both are accepted or both are visibly reported.

### R2-F2 · P1 · Webhook payment recording now depends on a GET with no payment-owned repair path
- **Section:** plan L149, Task 5 (L230–236), Task 7 action list (L252).
- **Scenario:**
  1. A customer pays and closes the browser, so no callback arrives.
  2. The signed webhook arrives while MyFatoorah GET is unreachable, or before `payment_attempts.invoice_id` has been persisted.
  3. The plan returns 503 and stores an "unresolved" event. Today, `myfatoorah-webhook/index.ts:77-81` applies the signed status directly.
  4. If MyFatoorah's retries run out (count unverified), recovery depends on "scheduler/admin repair of unresolved provider events."
  5. That scheduler is the WhatsApp worker, which is gated behind WhatsApp infrastructure approvals. Task 7's admin actions include no action for unresolved provider events: `event.repair` acts only on durable notification event IDs.
  6. Result: a paid order stays `pending_payment`. This is a payment regression introduced by WhatsApp scope, which spec §5 limits to a "narrow" change.
- **Smallest fix:**
  - Ship a payment-owned re-verification path in Task 5 that is live from the moment of merge and independent of WhatsApp approvals and cutover. Two options: an admin-authorized branch of `verify-myfatoorah-payment` for admins (this also fixes the 403 at `verify-myfatoorah-payment/index.ts:91-101`), or a payment reconcile job.
  - Record MyFatoorah's retry count and backoff in Task 0. If no documented source exists, list it as a limit rather than an assumption.
  - Test: GET unavailable, no callback, retries exhausted → the order is recoverable through the payment-owned path with no WhatsApp component installed.

### R2-F3 · P1 · The migration application protocol contradicts itself and the actual runner
- **Section:** R1-F8 verdict row (L348) vs Task 14 (L323).
- **Contradictions:**
  1. The R1-F8 verdict row says the release "applies each file plus tracker record in one transaction." The runner does not do this. `apply-self-hosted-migrations.sh:102` applies with `--single-transaction`, then `:104-105` inserts the tracker row in a separate `psql` call. Task 14 then says "existing runner/tracker semantics" and "rehearse interruption between apply/tracker write." Both cannot be the protocol.
  2. The runner applies only files present in the production checkout's `supabase/migrations`. Pre-merge files are not there. Copying them into the deploy checkout risks a git conflict ("untracked file would be overwritten") on merge. No executable pre-merge mechanism is named.
  3. The stored checksum is `sha256sum` of the server checkout bytes (`:81`). If the manager freezes the SHA from a Windows working copy where line endings were converted, the runner reports a mismatch on the first post-merge pass. It exits 1, and `supabase-post-deploy.sh:496` calls `die`. Functions are already copied (`:467-470`) but restart (`:514`) and smoke tests (`:624`) are skipped. This repeats on every cron pass.
  4. "Pause auto-apply" in the verdict covers one schedule, but there are two paths: the `--quiet` post-deploy cron (`supabase-post-deploy.sh:6-8`, `:622`) and `/root/run-curemed-migrations.sh` (`SELF_HOSTED.md:140-143`).
- **Smallest fix:** Choose one protocol and write it into Task 14:
  - Freeze bytes as `git show <release-commit>:<path> | sha256sum`.
  - A dedicated apply wrapper runs `BEGIN; <file>; INSERT INTO public.self_hosted_migrations …; COMMIT;` in one `psql --single-transaction` call, with the exact filename and that SHA.
  - Pause both cron paths before applying and resume them after the checksum check.
  - Run a disposable rehearsal of a post-merge runner pass that shows `[skip]`.
  - Or adopt the simpler option in the Optional simplifications section.

---

## P2: must be resolved before dependent tasks

### R2-F4 · P2 · Cutover and automation states allow a window with no WhatsApp owner and unrepairable losses
- **Section:** plan L145, L153; spec §9 rollback (L191).
- **Scenarios:**
  - **Early flip:** nothing gates the 0→1 cutover flip on automation being on and ready. With cutover 1 and automation off, every paid order records `skipped`, the legacy owner is false and skipped events are never repaired, so buyers lose order-paid messages. This breaks the approved decision "Keep existing Postora active until … send tests succeed."
  - **Readiness at enqueue:** L153 requires "automation enabled/readiness at enqueue." If readiness includes scheduler-heartbeat freshness, a scheduler outage turns paid events into unrepairable `skipped`, although the durable design exists to survive exactly that outage.
  - **Rollback:** rollback "disables new WhatsApp dispatch" but does not restore legacy ownership, so paid notifications stop entirely during rollback.
- **Fix:**
  - Make the 0→1 flip atomic with enabling automation once readiness is proven, inside the settings `FOR UPDATE` transaction.
  - Define readiness at enqueue to exclude heartbeat freshness, so jobs queue durably and the heartbeat only gates enablement and UI health.
  - Define rollback explicitly: either revert to cutover 0 with the legacy owner, or document "no paid WhatsApp during rollback."
  - Add the missing rows to the owner table.

### R2-F5 · P2 · The owner snapshot is lost at the second call (R1-F4 amendment incomplete)
- **Section:** L145, Task 6 (L245).
- **Scenario:**
  1. Under cutover 0 the RPC returns `legacy_whatsapp_owner=true`.
  2. Deno then calls `send-whatsapp` (`apply-payment.ts:198-232`). That facade still reads current settings and cutover (`send-whatsapp/index.ts:97-116`, `230-238`).
  3. If an admin flips the cutover in between, the facade suppresses or reroutes the send. That loses the message, or produces a second owner if the durable path also expands.
  4. Old Deno workers can run during deploy skew and hit the same race.
- **Fix:** Pass the evidence/event ID with legacy calls. The facade honours the owner recorded on that evidence row and ignores current flags for paid events. Test: flip the cutover between RPC commit and facade call → exactly one owner sends.

### R2-F6 · P2 · "Immutable inputs" conflicts with "corrected inputs", and enqueue failures are not classified
- **Section:** L88 (immutable snapshots), L129 (`wa_correct_event_expansion(…, corrected_inputs, …)`), L143.
- **Problems:**
  - The same event is described as immutable and as correctable through free-form JSON. Repair "from immutable event inputs" and repair "after corrective revision" are different contracts.
  - `corrected_inputs` is unconstrained. An admin could change recipients or content and send an arbitrary message framed as a paid-order notification, bypassing the 50-recipient cap and template allow-list.
  - `enqueue_failed` mixes transient causes (deadlock or lock timeout caught by `EXCEPTION WHEN OTHERS`) with deterministic ones (bad template). The scheduler either retries deterministic failures indefinitely or never retries transient ones.
- **Fix:**
  - Version expansion inputs (`input_revision`). Repair always uses the latest approved revision.
  - Corrections may only re-derive template and recipient sections from current validated settings. The order/buyer snapshot and trusted evidence are never editable. Corrections must still pass the cap and allow-list.
  - Store a `failure_class` of `transient` (scheduler retries with a bounded attempt counter, then review) or `deterministic` (correction required).
  - Add SQL tests for both classes.

### R2-F7 · P2 · The payment binding key and the GET-mismatch outcome are undefined
- **Section:** L139, L149, Task 5.
- **Evidence:**
  - `create-myfatoorah-payment/index.ts:176-177` keys attempts by method and amount, so one order can have several attempts and invoices.
  - `:243-252` stores the PaymentId returned at creation. A PaymentId seen later in the webhook or callback may differ if the customer retries on the payment page (unverified).
  - The signed fields are `Invoice.Id`, `Invoice.ExternalIdentifier` (= order ID, `:208`), `Transaction.PaymentId` and the two statuses (`payment-security.ts:17-23`).
- **Scenarios:**
  - If binding requires the stored PaymentId to equal the signed PaymentId, legitimate payments go unresolved, return 503 and loop on retries.
  - If the signed webhook says SUCCESS but the GET returns another status (later refund, a different transaction), the plan defines no outcome. A 503 retries indefinitely.
- **Fix:**
  - Bind on `Invoice.Id` matched to a server-created attempt, plus `ExternalIdentifier`. Record PaymentId as evidence only, after Task 0 confirms the PaymentId lifecycle.
  - On a GET/signature mismatch, record a terminal `evidence_mismatch` that admins can see, return 200 (no retry loop) and create no event.

### R2-F8 · P2 · Removing the duplicate early-return can turn duplicates into a 500 retry loop
- **Section:** Task 5 L233.
- **Evidence:** `myfatoorah-webhook/index.ts:55-66` returns early on a duplicate `event_reference`. `:83-98` then inserts `payment_events` without checking the result. I could not verify whether `(provider, event_reference)` has a unique constraint.
- **Scenario:** if a unique constraint exists, every duplicate now raises an error, returns 500, MyFatoorah retries, and the cycle repeats.
- **Fix:** Write the event log with `ON CONFLICT DO NOTHING` (or an upsert) and check the result. Process the signed identity independently of log insertion. Add a test: same `Event.Reference` delivered twice → one log row, repair still runs, response 200.

### R2-F9 · P2 · New Edge secrets and frontend/backend version skew are not in the release order
- **Section:** Task 12 L300, Task 14 L322–324, spec §9 L189.
- **Evidence:** `supabase-post-deploy.sh:124-153` exits before deploying anything if any top-level `requiredSecrets` key is missing. `:211-213` injects only `REQUIRED_KEYS` into the functions container.
- **Scenario:**
  - The merge adds the encryption-key and scheduler-credential names, but the secrets file lacks them. Every cron pass then deploys nothing, including future payment fixes.
  - If the names are not added to the top level, the functions never receive them.
  - Separately, the frontend auto-deploys apart from the backend cron. The new admin UI can call a `whatsapp-admin` that does not exist yet, or the old UI can hit the new backend. No compatibility window is defined.
- **Fix:**
  - Add a release step before merge: provision the new secrets in `/etc/curemed/edge-secrets.production.json` through `request_secret` file delivery, and verify presence only.
  - The new UI degrades gracefully while backend functions are missing. The old UI keeps working with the new backend for one release.
  - Record function and frontend identity separately.

### R2-F10 · P2 · Postora key fallback ending is undefined when the key lives only in env
- **Section:** L158, Task 4 L218–219.
- **Evidence:** `send-whatsapp/index.ts:107-110` uses the site_settings key first, then `POSTORA_WHATSAPP_API_KEY` from env.
- **Scenario:** if the effective key is in env only, "server-side read/encrypt/clear" finds nothing in site_settings. Either the migration never "succeeds" and the fallback lasts forever, or disabling the fallback cuts off working Postora sends.
- **Fix:** Keep the current precedence. Migrate whichever key is effective and record its source (`site_settings` or `env`). After migration, ignore env. The release note tells the operator to remove the env value. Test both sources.

### R2-F11 · P2 · The disposable database fixture does not match the production database (R1-F16 amendment partial)
- **Section:** Task 2 L194.
- **Problem:**
  - Vanilla `postgres:15.8-alpine` with a hand-traced schema runs migrations as a superuser `postgres`.
  - Production runs `psql -U postgres` (`apply-self-hosted-migrations.sh:31`) on a self-hosted Supabase image, where `postgres` is typically not a superuser and `storage`/`auth` objects have other owners.
  - Migrations can pass the fixture and then fail in production on storage bucket inserts, schema creation, default privileges or definer ownership.
  - A hand-traced schema also drifts from the many later `orders`/`payment_attempts` columns.
- **Fix:**
  - Capture read-only, with approval, the production DB image tag/digest and a schema-only dump with no rows.
  - Restore it into that same image and apply the feature migrations exactly as the runner does.
  - Keep the default-grant adversarial checks.

### R2-F12 · P2 · Reusing the deployed gateway: digest pinning, Task 0 sequencing and webhook secret transport
- **Section:** spec §9 L183, plan Task 0 L164/L167, Task 7 L253–255, Task 12 L299; readiness doc.
- **Problems:**
  - **Digest pinning:** the gateway is a Dokploy git-sourced application, and its stored environment is "not applied" yet. Applying the repair configuration requires a redeploy. For git apps that typically rebuilds, producing a new digest and possibly a newer branch commit (Dokploy behaviour not verified). "Pin the inspected digest" has no mechanism as written.
  - **Task 0 sequencing:** Task 0 says "No production calls" (L164), but Task 7 needs "actual deployed gateway webhook retry behavior in Task0" (L255) and spec §9 needs runtime verification. These require decision (1), the repair, first. Local replication of the exact image needs a `docker save` export from the host or a rebuild from commit `f1100ad` with possibly different dependencies.
  - **Webhook secret transport:** the secret's location is unspecified. If this build lacks custom webhook headers, the only option is a secret in the URL, which breaks global constraint 6 and spec §8 ("no credentials in URLs").
- **Fix:**
  - Repair step: pin the Dokploy source commit, or convert the app to image-by-digest. After redeploy, record the actual digest and require equality with the reviewed identity.
  - Split Task 0: static contract capture from `f1100ad` source now; runtime retry/header confirmation only after decision (1) is approved.
  - Add a Task 0 decision point: if headers are unsupported, choose a documented alternative (for example an unguessable per-generation path with router/Kong log redaction) and get user approval, or stop.

### R2-F13 · P2 · Decision (2) "staged/sandbox payment proof" cannot be executed as written
- **Section:** Task 14 L326.
- **Problem:** No staging environment is defined: no MyFatoorah sandbox credential handling, no reachable webhook endpoint, and no WhatsApp sender. The only paired account is production's single `curemed` instance.
- **Suggested split (not choosing the branch):**
  - The callback path can run fully against a disposable stack. The browser redirect works on localhost, and the verify GET uses a sandbox token delivered by `request_secret`.
  - The webhook path is covered by signed fixtures through the real handler. A provider-originated webhook needs public exposure (separate approval) or is explicitly deferred.
  - WhatsApp transport in staging uses the fake provider. Real transport is proved separately with production `test`-class jobs.
- **Under "keep full verification open":** acceptance criterion 20 must stay unmarked.

### R2-F14 · P2 · Two renderers, and long orders exceeding the cap fail deterministically
- **Section:** Task 1 L178 (`renderTemplate` in TypeScript), Task 3 L207 (template rendering in SQL), L111.
- **Scenario:** the preview and the overlap/coalescing decisions come from the TypeScript renderer, while the jobs are rendered in SQL. Different escaping, number formatting or hashing breaks acceptance criterion 6. An order whose item summary pushes the text past 4096 characters always fails expansion, so the buyer never gets a message.
- **Fix:** Use one renderer: SQL renders, and the preview calls a read-only SQL RPC. Alternatively run a shared conformance fixture through both on every change. Truncate `items_summary` deterministically, for example "…+N more."

### R2-F15 · P2 · The main-based T3 checkout protocol has no recovery path and modifies the user's primary checkout
- **Section:** Task 0 L168–169.
- **Problems:**
  - Detaching the primary HEAD changes the user's working tree. It disrupts any concurrent Shipa activity, and a crash between detach and restore leaves the primary checkout detached.
  - "If checkout refuses an overlap, stop" has no fallback, so implementation is blocked indefinitely.
  - Evidence limit: gitStatus shows `supabase/functions/main/` as untracked in the primary checkout, while spec L40 calls it "the repository's" copy. I did not run git, so I could not check whether `origin/main` tracks it. If it does, the detach is refused.
- **Simpler fix:** Leave the primary checkout untouched. After T3 creates the worktree, the manager runs `git switch -C feat/whatsapp-evolution <recorded origin/main SHA>` inside that host-created checkout before any child access. This is not shell worktree creation. Then gate on `HEAD == baseline` and `git log baseline..HEAD` being empty.

---

## P3: improvements

### R2-F16 · P3 · `site_settings` policy is a denylist, not an allow-list
- **Section:** readiness doc L38.
- **Evidence:** `20260523155217:7` is `USING (key NOT IN ('whatsapp_integration'))`.
- **Risk:** any new `site_settings` key is public by default.
- **Fix:** Correct the doc. The plan must store nothing WhatsApp-related in `site_settings` beyond the existing row. Add a privilege test.

### R2-F17 · P3 · An old admin bundle can still write legacy settings
- **Evidence:** `AdminWhatsApp.tsx:119-135` upserts the whole `whatsapp_integration` object, so `events`, `admin_numbers` and `enabled` can still change after migration.
- **Risk:** L219/L154 leave it ambiguous whether the legacy shipped toggle reads the legacy row or the new settings, so there are two sources of truth.
- **Fix:** Name a single source for `legacy_event` gates after migration. Mark the legacy row read-only or warn about it.

### R2-F18 · P3 · Legacy jobs lack an identity
- **Section:** L88.
- **Problem:** jobs need an event ID or a manual request ID. Legacy `order.shipped` and test calls from old bundles carry neither (`AdminOrders.tsx:387-394`).
- **Fix:** Generate a request ID server-side, add a CHECK constraint per job class, and accept explicitly that replays of old-shape requests cannot be detected.

### R2-F19 · P3 · Stale specification text
- **Problem:** spec L226 says "The gateway is not yet provisioned," §9 paragraph 1 says "Provision an isolated Evolution stack…", and §1 L7 says "Provide a dedicated Evolution gateway." All three conflict with L42 and L183 (reuse the deployed gateway).
- **Fix:** Reword these to "repair and attach dependencies to the existing deployment."

### R2-F20 · P3 · Edge network membership and router parity
- **Problem:**
  - Attaching the Supabase compose `functions` service to a new overlay must survive both Dokploy compose regeneration and the Python rewrite of `docker-compose.yml` in `supabase-post-deploy.sh:211-306`.
  - The disposable fixture uses the repository's diverged router, so header/auth proofs do not reflect production.
- **Fix:**
  - Make the network change through the Dokploy compose definition and test that the post-deploy rewrite preserves it.
  - Optionally capture the production router's hash and bytes, read-only and with approval, into ignored fixture storage.

---

## Optional simplifications
1. **Merge migrations separately.** Merge only the additive migrations first, as a separately approved schema PR, and let the existing runner apply them with its own semantics. This removes the custom pre-merge apply, tracker atomicity and checksum-freezing risks in R2-F3. Auto-apply is still a production migration that needs explicit approval.
2. **Possibly drop the amount GET.** Invoice amount is set server-side at creation (`create-myfatoorah-payment:203-212`) and recorded on the attempt (`:216-232`). If Task 0 confirms that v3 invoices cannot be paid at a different amount, a signed `Invoice.Id` matched to the attempt may make the amount-confirming GET unnecessary. That would also remove most of R2-F2's new dependency. This needs evidence, not assumption.
3. **Single SQL renderer** with a preview RPC (resolves R2-F14).
4. **Branch reset inside the host worktree** instead of detaching the primary checkout (resolves R2-F15).

## Gated branches pending user decision (evaluation only, no choice made)
- **(1) Repair the existing gateway only:** this unblocks runtime contract capture (retry behaviour, headers) for Tasks 7, 9 and 10. Without it, those proofs stay blocked. It authorizes no application SQL, merge or sends.
- **(2) Staged/sandbox payment proof plus authorized production transport tests:** executable only after R2-F13 defines the topology.
- **Keep full verification open:** consistent with the plan, as long as acceptance criterion 20 and the terminal state are not reported as met.

## Readiness verdict
**Not ready for dependent implementation dispatch.**
- **Blocked:** Task 0 sequencing (R2-F12, R2-F15), Task 3 (R2-F4, R2-F6, R2-F14), Task 5 (R2-F2, R2-F5, R2-F7, R2-F8), Task 6 (R2-F1), Tasks 12 and 14 (R2-F3, R2-F9, R2-F13).
- **Could proceed after small amendments:** Task 1, once the renderer location is fixed; Task 2, once the fixture parity decision in R2-F11 and the job identity constraint in R2-F18 are settled.
- Two debate rounds remain mandatory.

## Evidence limits
- No donor, Shipa, `.gitattributes` or other migration files read; no git commands run.
- Not verified:
  - Whether `origin/main` tracks `supabase/functions/main/`.
  - Whether `payment_events.event_reference` has a unique constraint.
  - Whether a later migration changed the `site_settings` policy.
  - MyFatoorah webhook retry policy and PaymentId lifecycle.
  - Evolution `f1100ad` support for webhook headers and its retry behaviour.
  - Dokploy redeploy/rebuild semantics.
  - Production DB image and role attributes.
  - T3 worktree base-ref behaviour.
  - Edge Runtime hot-reload behaviour.
- I cannot confirm this task ran at `effort=high`; the manager should check the dispatch options.
