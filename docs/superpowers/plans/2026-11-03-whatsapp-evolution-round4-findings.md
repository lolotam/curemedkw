> Historical design record (2026-11-03); current behavior is defined by the code on main and docs/integrations/*. All implementation instructions, status assertions, proof receipts and file/symbol references below describe the historical proposal/checkpoint only. They are not current contracts, execution instructions or evidence of deployed state.

# Opus 5.5/high round 4 — original findings

Reviewer link: <t3-thread://v2/438824e0-fe19-4a22-bb31-f81eff7b7322/thread:delegated-task:command%3Amcp%3A2ab4ac78-5db5-40ac-8c50-c442ecc10107%3Adelegate-task%3Acuremed-whatsapp-plan-opus-round4-20261103>

Final requested plan-debate round. Dispatch returned claude-opus-5-5 with effort=high. Manager verifies hashes/Git state, adjudicates and corrects below findings without claiming an additional reviewer approval.

# Round 4 adversarial review (final round)

**Integrity and scope.** I edited nothing and ran no shell, Git, network or production commands. I spawned no agents. I read only the named files. I did not recompute either SHA256 because I have no shell; the parent must verify the hashes and primary Git status. The read-only restriction was an instruction, not sandbox enforcement.

## Verdict

**Not ready for the Task 3 SQL freeze.** Three P2 contract gaps remain. Each one is a refinement of an R3 amendment, not a re-litigation of it. Several other parts can proceed now (see the readiness section). Nothing found is a P1.

## R3 amendments judged resolved

These hold as written and are not reopened:

- **R3-F1:** the inert-schema principle and the compatibility matrix.
- **R3-F4:** secret rotation through `compose.env`.
- **R3-F6:** image pinning — image ID plus RepoDigest, immutable local tag, protected `docker save` backup, autoDeploy off, and an Image ID equality check after reload.
- **R3-F8:** constructing the schema branch with exact blobs.
- **R3-F9:** single runner, flock, rerun and interruption rehearsal. The trigger inventory gap is R4-F6.
- **R3-F11:** `verify_for_notifications` takes `action` + `order_id` only. This is also needed because the existing admin verify button calls `verify-myfatoorah-payment` (`AdminOrders.tsx:343-344`), which has no admin bypass (`verify:91-119`).
- **R3-F12:** named private stores and read/list/resolve RPCs.
- **R3-F13:** restore recipe and destructive-target guards.
- **R3-F3, core decision:** a signed bound status commits without the GET, matching `myfatoorah-webhook:77-81` today.

---

## P2 — block the Task 3 SQL freeze

### R4-F1 · P2 · The two-transaction split left the RPC return contract and the legacy trigger stale

**Section:** plan L151 (two RPCs), L155 (still describes one RPC), L172, L85/L139 (separate strict-evidence store), L91, L168.

**Why the R3-F3 amendment still fails:**
- L155 still says the payment RPC returns `evidence_id … event_id, expansion_state, legacy_whatsapp_owner`, and that the facade "carries that evidence ID".
- L172 says paid legacy calls use the **first-outcome** ID.
- L85 and L139 define strict GET evidence (`wa_payment_evidence`) as a different store from the outcome (`wa_payment_outcomes`).

The plan never says whether cutover-0 legacy WhatsApp (L155: owner = legacy) is triggered by transaction 1 (the outcome) or transaction 2 (strict evidence).

**Failure A — sends dropped:**
1. MiniMax gates cutover-0 legacy WhatsApp on strict evidence.
2. During a GET outage with a webhook-only order, transaction 1 records paid and email is sent.
3. Transaction 2 stays pending, and no later actor sends legacy WhatsApp. L155 says cutover 0 creates no durable paid jobs.
4. Today, `myfatoorah-webhook:77-81` → `applyPaymentToOrder` → `dispatchOrderNotifications` does send it.

Cutover 0 is the default state for the whole first release, so this is R3-F3's regression class coming back for WhatsApp.

**Failure B — duplicate sends:**
- L91 keys recipient jobs on `event_id`. Cutover 0 has no event, yet L168 gives `legacy_event` its "own job set".
- `legacy_event` therefore has no stated unique key. Today, duplicate suppression is the `order_notified_at` claim (`apply-payment:140-147`).
- If the key is a per-request server UUID (L172 old-shape behaviour), a MyFatoorah retry after a slow webhook creates a second legacy job set. The buyer gets duplicate messages.

**Failure C — owner slot consumed by a failure:** "first immutable outcome" is not limited to success. A first FAILED webhook (attempt A, then a retry on attempt B) could take the owner slot.

**Why P2:** migrations are immutable once applied (`apply-self-hosted-migrations.sh:87-97`), and phase 1 ships both SQL files before any app code. A contract mistake here costs a new migration.

**Minimal fix:**
- **Per-RPC return shapes:**
  - `wa_record_provider_payment_outcome` returns `outcome_id`, owner snapshot, `changed`, payment/order status and `verification_pending`.
  - `wa_apply_verified_payment` returns `evidence_id`, `event_id` and `expansion_state`.
- **Cutover-0 legacy WhatsApp:** eligibility is the first **success-mapped** outcome per order from transaction 1, as today. Strict evidence gates only cutover-1 durable events.
- **Legacy job identity:** add `UNIQUE (outcome_id, audience, normalized_recipient, rendered_content_hash)`.
- **First-outcome rule:** failed or pending outcomes never take the owner slot.
- **Text:** rewrite L155.

### R4-F2 · P2 · Activation and rollback order is undefined, and the legacy settings row drifts

**Section:** L87, L139, L143, L172, L176, L324; spec §9 L191.

**Why the R3-F2 amendment still fails:** the plan names four separate steps with no order between them:
- arming the compatibility guard (`wa_set_compatibility_guard`);
- migrating the Postora credential (`wa_migrate_postora_credential`);
- activating the provider (`wa_activate_provider`);
- cutover 0→1.

It also never says which store is authoritative in each state. Concrete failures from the code:
1. **Stale tab restores plaintext.** `AdminWhatsApp.tsx:122-126` upserts the whole `whatsapp_integration` value, including `api_key`, from in-memory state. An old SPA tab left open re-upserts the plaintext key if plaintext is cleared before the guard is armed.
2. **Placeholder breaks rollback.** `send-whatsapp:107-110` uses *any* non-empty `api_key` string before falling back to env. If migration leaves a masked placeholder in the legacy row, every baseline send after rollback is rejected by Postora, even though the env fallback is provisioned.
3. **Rollback leaks customer data.** Baseline `apply-payment:159-165` reads `admin_numbers`, and baseline `send-whatsapp` reads `enabled`/`events`/`templates`, from the legacy row. After activation, L172 makes the new settings authoritative and the legacy row goes stale. A code rollback then sends customer name, phone and items to admin numbers that were removed in the new UI. It can also resume an integration an admin disabled.
4. **No stated source of truth before activation.** Between app deploy and activation, the plan doesn't say which store drives L143 "per-event enablement" and leftover claims, or which store the new UI writes. Edits made in the new UI may silently not apply.
5. **Durable jobs stranded on rollback.** Unsent durable jobs are invisible in the baseline UI after a code rollback.

**Minimal fix:**
- Add one ordered state table: deployed (cutover 0, legacy row authoritative) → credential + nonsecret migration → guard armed → provider activation → cutover 1. Give the authoritative store and UI write target for each state, and the exact inverse for rollback.
- Arm the guard in the **same transaction** that clears plaintext.
- Require the legacy `api_key` to be removed or empty, never masked.
- During the compatibility release, either:
  - mirror nonsecret fields (enabled, events, language, templates, `admin_numbers`) into the legacy row on every `wa_save_settings` (a service-role write, exempt from the guard); or
  - add a mandatory reviewed reconcile step to the revert runbook.
- Before code revert, export the list of unsent durable jobs.

### R4-F3 · P2 · Pending strict verification has retry fields but nothing that retries it

**Section:** L85 (`first_seen/last_attempt/next_attempt/attempt_count`), L151, L153, L159.

**Why the R3-F3 amendment still fails:**
- `payment-health/index.ts`, read in full, is only an env/DB probe.
- The webhook now returns 200 `payment_recorded=true`, so MyFatoorah won't retry.
- The customer callback may never arrive.
- L153's "bounded scheduler scans" cover expansion repair of existing events, not GET verification.

**Failure:**
1. Cutover 1, a 20-minute GET outage and webhook-only orders.
2. Paid status and email are recorded.
3. Buyer/admin WhatsApp never sends unless an admin finds each order and runs `verify_for_notifications`.
4. This contradicts spec acceptance #5 ("replay repairs") and #11 ("recover through the scheduler").

Without a defined actor, MiniMax will invent one.

**Webhook-latency risk:** the webhook's in-request GET could reuse verify's loop (`verify:65-78`: 3 attempts × 30 s timeout, plus two 5 s sleeps, about 100 s). Add the 25 s inline legacy budget (L174), and the webhook can exceed MyFatoorah's timeout. That causes repeated GETs, and duplicate sends under R4-F1-B.

**Minimal fix:**
- **Sweep:** name a bounded sweep, preferably a payment-owned function so the MyFatoorah token stays out of WhatsApp functions. Invoke it from the same flock'd scheduler script.
- **Leases:** add lease/claim semantics to `wa_list_pending_payment_verifications` (`FOR UPDATE SKIP LOCKED` on `next_attempt`) so concurrent sweeps can't double-GET.
- **Bounds:** backoff, maximum attempts leading to `needs_review`, and a staleness cutoff. Past the cutoff, the event is created as skipped/review instead of sending "thanks for your order" days late.
- **Webhook GET:** one attempt of at most 10 s, then defer to the sweep.

---

## P3 — fix in place; does not block Tasks 1–2

### R4-F4 · P3 · The inert-schema rule must name the mechanisms it forbids

**Section:** L87, L95, L213, L221 ("private-if-present").

**Failure:**
- A phase-1 `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE … FROM PUBLIC`, intended to "revoke permissive defaults" (L95), silently changes grants on future unrelated migrations. The unfinished Shipa RPCs would start returning permission denied.
- A schema-level `REVOKE USAGE` on a pre-existing `private` schema would break existing policies or functions.
- `wa_set_compatibility_guard` runs `CREATE TRIGGER`, which needs table ownership, and the runner is NOSUPERUSER (L213). If `site_settings` isn't owned by `postgres`, activation fails at runtime.

**Fix:**
- In phase 1, allow per-object REVOKE/GRANT only. Forbid `ALTER DEFAULT PRIVILEGES` and schema-level REVOKE on schemas that already exist.
- Have the fixture record whether `private` exists.
- Assert that the guard function's owner equals the `site_settings` owner.
- Assert that the trigger filters to `key='whatsapp_integration'` only.

### R4-F5 · P3 · Three different "revisions" are conflated

**Section:** L89 (settings revision bumps on every save), L143 (claim/park), L239 (AAD binds "config revision"), L76 (`accountRevision`).

**Failure:**
- If the AAD binds the settings revision, every template save makes the stored key undecryptable. This also breaks "blank key preserves".
- If claim compares the settings revision, one template edit parks the whole queue.

**Fix:** define three things separately:
- `settings_revision`, used only for optimistic locking;
- `credential_revision`, bound into the AAD;
- provider + account identity, used for claim and park decisions.

Neither a credential rotation nor a template edit should park jobs.

### R4-F6 · P3 · "Both migration schedules" is an assumption, not an inventory

**Section:** L349.

**Evidence:**
- `supabase-post-deploy.sh:8` has a `--quiet` cron mode.
- How `REPO_DIR` gets synced is not in the script.
- `SELF_HOSTED.md:140-143` names only the `/root/run-curemed-migrations.sh` cron.
- Post-deploy deploys functions before applying migrations (`supabase-post-deploy.sh:621-623`).

**Failure:** an unlisted trigger, such as a Dokploy deploy hook after main auto-deploys, a systemd timer or another user's crontab, runs post-deploy alongside the selected runner. That causes a tracker primary-key violation or a half-applied pass. The project flock only protects paths that actually take it.

**Fix:** in Task 0/14, enumerate every trigger (root and user crontabs, `/etc/cron.d`, systemd timers, Dokploy hooks) and the repo-sync step. Prove each one is paused from that inventory before merging the schema PR.

---

## What can proceed without runtime credentials

| Task | Status |
| --- | --- |
| Task 0 | Static contract capture from f1100ad source can run now. Runtime health proof is blocked on credentials. |
| Task 1 | Dispatchable now. Add the R4-F5 revision names to the contracts. |
| Task 2 | DDL can be authored after the R4-F4 and R4-F5 wording; the fixture is local. |
| Task 3 | **SQL freeze blocked** on R4-F1, F2 and F3. These are contract decisions, not research. |
| Tasks 4–11 | Can proceed on fakes once the Task 1–3 contracts are frozen. Tasks 7 and 9 also need Task 0's static header and route capture. |
| Task 12 | Files are writable; host steps are blocked on credentials and approvals. |
| Task 13 | Runs without credentials, except the MyFatoorah sandbox-token proof. |
| Task 14 | Blocked on approvals and credentials. |

Before Task 12's host work, nothing needs runtime credentials. MiniMax can safely start with Task 1 alone.

## Evidence limits

- **Hashes:** not recomputed.
- **Read in full:** `apply-payment.ts`, `myfatoorah-webhook`, `verify-myfatoorah-payment`, `payment-security.ts`, `send-whatsapp`, `payment-health`, `apply-self-hosted-migrations.sh` and the four briefed documents.
- **Read partially:**
  - `create-myfatoorah-payment`, lines 50–290 plus a search.
  - `supabase-post-deploy.sh`, lines 1–60 and 560–625 plus a search.
  - `SELF_HOSTED.md`, lines 120–159 plus a search.
  - `AdminWhatsApp.tsx` and `AdminOrders.tsx`, searches only.
- **Not read:** `caller-auth.ts`, `ops/edge-env.manifest.example.json`, `payment-status.ts`, `/root/run-curemed-migrations.sh`, the migrations directory (so whether `private` exists, and table owners, are unverified), and `db.ts` (any order-delete path versus the new RESTRICT foreign keys is unchecked).
- **Not verified:**
  - MyFatoorah webhook timeout and retry settings.
  - Edge Runtime wall-clock limits.
  - Evolution f1100ad custom-header support.
  - How Dokploy and post-deploy are triggered, and how the repo is synced.
- **Taken as supplied:** the MyFatoorah V3 source evidence and the live-DB facts are as given in the brief and plan; I did not check them independently.
