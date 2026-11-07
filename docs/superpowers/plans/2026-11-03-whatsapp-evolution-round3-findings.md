> Historical design record (2026-11-03); current behavior is defined by the code on main and docs/integrations/*. All implementation instructions, status assertions, proof receipts and file/symbol references below describe the historical proposal/checkpoint only. They are not current contracts, execution instructions or evidence of deployed state.

# Opus 5.5/high round 3 — original findings

Reviewer link: <t3-thread://v2/438824e0-fe19-4a22-bb31-f81eff7b7322/thread:delegated-task:command%3Amcp%3A2ab4ac78-5db5-40ac-8c50-c442ecc10107%3Adelegate-task%3Acuremed-whatsapp-plan-opus-round3-20261103>

Dispatch returned claude-opus-5-5 with effort=high. Manager verifies hashes and primary Git state before amendments; read-only restrictions were instructed rather than sandbox-enforced.

# Round 3 adversarial review: WhatsApp Evolution and paid-order automation

**Integrity and scope.** I edited nothing and ran no commands. I did no Git, network, production, Shipa or credential access. I could not recompute either SHA256 because command execution is prohibited. The parent must verify the hashes and Git state.

**Files read:**
- The four briefed documents.
- `apply-payment.ts` and `caller-auth.ts`.
- `send-whatsapp`, `verify-myfatoorah-payment` and `myfatoorah-webhook` in full.
- Targeted searches in `create-myfatoorah-payment`, `AdminOrders.tsx` and `AdminWhatsApp.tsx`.
- `apply-self-hosted-migrations.sh` in full.
- `supabase-post-deploy.sh`, lines 1–58, 96–220 and 440–624, plus searches.
- `ops/edge-env.manifest.example.json` in full.
- `SELF_HOSTED.md`, lines 120–159 plus a search.

## Substance check of the round 2 verdicts

| R2 | Round 3 judgement |
| --- | --- |
| F1 | Holds. Bounded inline own-job sends, visible leftovers and a mandatory scheduler close the gap. Remaining gaps: claim gates per job class (R3-F10) and latency inside the payment request (R3-F7). |
| F2 | Partly holds. The recovery path is payment-owned, but the amendment brings in a payment-recording regression (R3-F3) and an undefined input contract (R3-F11). |
| F3 | Holds as a choice, but brings in new risk: compatibility of phase 1 with deployed code (R3-F1), construction of the schema branch (R3-F8) and the two runners (R3-F9). |
| F4 | Mostly holds. There is a text conflict on "readiness at enqueue" (R3-F10). Rollback cannot actually be executed after credential migration (R3-F2). |
| F5 | Holds for new-to-new calls. Two gaps remain: the public lookup RPC (R3-F12), and an old worker with no evidence row during deploy skew, whose behaviour is undefined (folded into R3-F12). |
| F6, F7, F8, F14, F17, F18, F19 | Hold. F19 still has stale residue (R3-F10). |
| F9 | Holds. Adding the keys to the secrets JSON before the manifest requires them is safe: `validate_runtime_entries` only checks the key format (`supabase-post-deploy.sh:155-160`). Rotation still needs a defined path (R3-F4). |
| F10 | Holds, but the same change breaks rollback (R3-F2). |
| F11 | The contract is now correct. The restore procedure is undefined (R3-F13). |
| F12 | The pinning mechanism is still ambiguous (R3-F6). The header contract holds (stop or seek approval). Router admission is missing (R3-F5). |
| F13 | Holds. Note that `create-myfatoorah-payment:57` enforces the shopping hold, so the fixture DB must set synthetic `shoppingEnabled=true` explicitly. This happens only locally and is not a production bypass. |
| F15 | Holds. It is now executable as written (normal `git switch -c` inside the host-created checkout, then resanitize and gate). |
| F16 | Rejecting the reviewer's claim about the current live policy is acceptable on the stated `pg_policies` evidence (the older migration was a denylist). |
| F20 | Holds. |

---

## P1

None unconditional. R3-F1 becomes P1 if any phase-1 trigger, grant or constraint on `orders`, `payment_events` or `site_settings` is active when the migration is applied.

## P2: block Task 14; resolve before round 4

### R3-F1 · P2 (P1 if enforcement is active at apply time) · Phase-1 schema must stay inert for the code already deployed · *missing contract*
- **Section:** plan L332 (two-phase PR), L132 ("post-migration trigger rejects plaintext api_key writes"), L148 ("protected invoice/pending writers cannot overwrite paid/refunded outcomes"), L163.
- **Failure:** the schema PR lands and runs for an open-ended time beside today's code:
  - `apply-payment.ts:108-111` does a direct `.update(patch)` on `orders` and throws on error.
  - `myfatoorah-webhook:83` inserts into `payment_events`.
  - `AdminWhatsApp.tsx:124-126` upserts the whole `whatsapp_integration` value, including `api_key`.
- If any phase-1 SQL enforces "protected writers" through a trigger, a revoke or a constraint on these tables, or arms the `site_settings` trigger, the callback and webhook return 500 (MyFatoorah retries in a loop) and admins cannot save WhatsApp settings. Nothing in the plan says phase-1 SQL is dormant, or tests that it is.
- **Smallest fix:**
  - Add a Task 2/3 rule: phase 1 adds objects only. Any enforcing trigger, grant change or constraint on an existing table ships disabled and is armed by an app-phase activation step that is itself approved.
  - Add a required fixture test that runs the current `main` versions of `verify-myfatoorah-payment`, `myfatoorah-webhook`, `send-whatsapp` and the `AdminWhatsApp` save against the post-schema DB. It must assert unchanged results.

### R3-F2 · P2 · Rollback cannot be executed after credential migration · *missing contract*
- **Section:** spec §9 L191; plan L163 ("ignore legacy/env values … operator removes the obsolete env key"), L167 (rollback goes to cutover 0), Task 6 L254 (legacy shapes route through the new delivery path).
- **Failure:**
  1. Cutover-0 rollback still runs the new delivery code. If the defect is in claim/finish or the facade, the only real rollback is reverting the app PR.
  2. After migration, `site_settings.api_key` is cleared and the env key is removed.
  3. The reverted `send-whatsapp/index.ts:107-110` then finds no key, and every send silently returns `{skipped:true, reason:"no_api_key"}` (`:231-238`).
  4. The old admin bundle cannot restore the key, because the armed trigger rejects its plaintext writes.
- **Smallest fix:**
  - Make clearing the plaintext key and removing the env key a separate step after stabilisation, not part of migration success.
  - Keep the env fallback provisioned until the release is declared stable.
  - Add a revert runbook: re-provision the env key through `request_secret` file delivery and disarm the trigger. Test that the reverted `main` sends through the fixture after migration.

### R3-F3 · P2 · The webhook now cannot mark an order paid without the provider GET · *missing contract; payment behaviour regression*
- **Section:** plan L152; spec §5 L100 ("narrow payment-path work").
- **Evidence:** today `myfatoorah-webhook:77-81` applies the signed status directly, with no GET.
- **Failure:**
  1. The MyFatoorah GET API is degraded for about 20 minutes. Signed webhooks still arrive.
  2. The customer's callback also fails the GET, so `verify:124-126` sets `pending_status_update`.
  3. The plan returns 503 for five minutes, then `200 processed=false`.
  4. The order stays unpaid until an admin clicks verify for each order. Today it would be marked paid automatically.
- **Smallest fix (choose one):**
  - (a) Once signed `Invoice.Id` and `ExternalIdentifier` bind to the server-created attempt, apply the signed paid status as today. Make only the creation of WhatsApp evidence/event wait for the GET-confirmed amount, repaired later by `verify_for_notifications` or a bounded scan. Task 0 must first confirm that v3 invoices have a fixed amount.
  - (b) Record the regression as scope Waleed accepts, and add an automatic payment-owned retry. `payment-health` is already deployed; the WhatsApp scheduler must not be used.

### R3-F6 · P2 (P3 if `be2c…` is a registry RepoDigest) · The gateway image cannot be pinned as described
- **Section:** spec L183; readiness doc L11 and step 2; plan L176 and the R2-F12 verdict L394.
- **Failure:**
  - "Built image digest" comes from a Dokploy git build, so it is most likely an image ID or an image only in the local Docker store.
  - Swarm `image@sha256:` needs a manifest RepoDigest. A Dokploy Docker-provider deploy pulls by default, which fails for a local-only image.
  - A git-source app with autoDeploy on can rebuild on push and overwrite the local `appName:latest` tag.
  - Image cleanup or prune can delete the only copy, and a rebuild from `f1100ad` without approval is forbidden.
  - "Pinned" therefore means a mutable local tag protected only by discipline.
- **Smallest fix, before any `application.reload`:**
  - Record both the image ID and any RepoDigests.
  - Add an immutable local tag such as `curemed-evolution:f1100ad`.
  - Take a protected `docker save` backup.
  - Disable autoDeploy on `w4DS2-k_EauA17sMm-ONL`.
  - After reload, assert that the running task's container image ID equals `be2c…`.
  - If Dokploy's image source needs a registry, stop and request approval for a private registry.

## P3

### R3-F4 · P3 · Rotating a secret through the secrets JSON never reaches the functions container · *missing contract*
- **Evidence:** `supabase-post-deploy.sh:200-203` skips (`continue`) any key already present in the compose `.env`.
- **Failure:** rotating the new encryption key or scheduler credential by editing `/etc/curemed/edge-secrets.production.json` silently has no effect, although spec §8 requires documented rotation.
- **Fix:** rotation introduces a new versioned key name (which also fits the plan's versioned AES key), or the runbook explicitly edits the compose `.env` and restarts. Add a presence/version check after rotation.

### R3-F5 · P3 · Router admission for `whatsapp-webhook` is undefined · *missing contract / evidence gap*
- **Evidence:** post-deploy reads only `deployFunctions`; the manifest's `verifyJwt` is never consumed (`:437`). The production router is hand-patched, and plan L32 forbids replacing it.
- **Failure:** if the router verifies JWTs, the gateway's webhook is rejected before reaching the function. The plan defines admission only for the scheduler (L310).
- **Fix:** Task 0 captures the router's policy for each function from the protected router copy. If it verifies JWTs, the gateway's custom headers also carry an admission token. Changing the router config needs separate approval.

### R3-F7 · P3 · The inline legacy slot wait runs inside the payment request · *optional improvement*
- **Evidence:** `apply-payment.ts:236` awaits `Promise.allSettled`, and the buyer and admin `send-whatsapp` calls run concurrently.
- **Failure:** plan L165 adds up to 25 s of slot wait to each call, and the two calls contend for the same slot. With up to 10 admin numbers paced at 1 s, the buyer call can wait the full 25 s and leave its job queued. Meanwhile the webhook response, whose MyFatoorah timeout has not been checked, or the customer's callback screen is held open.
- **Fix:** send the buyer first, or dispatch the WhatsApp facade after responding (waitUntil-style or a nudge), with leftovers left durable.

### R3-F8 · P3 · "A schema branch ref can point to that reviewed commit" (L332) does not produce a schema-only diff
- **Failure:** Task 1 TypeScript commits and the docs commits come before the Task 2/3 SQL commits, and SQL fixes are interleaved. Any ref at the SQL commit therefore carries application files.
- **Fix:**
  1. Build the schema branch from the baseline by checking out the frozen migration and test blobs.
  2. Verify that the blob IDs equal the frozen commit's.
  3. After the schema merge, update the feature branch from main so the application PR shows no migration diff.

### R3-F9 · P3 · Two migration runners can overlap
- **Evidence:** `SELF_HOSTED.md:140-143` names `/root/run-curemed-migrations.sh` alongside the post-deploy cron. The R2-F3 cron pause was dropped from the plan.
- **Failure:** two concurrent passes on the same new file. Concurrent `CREATE … IF NOT EXISTS` can still raise catalog unique violations, or the second tracker `INSERT` violates the primary key. One pass dies.
- **Fix:** either take `pg_advisory_xact_lock(<constant>)` as the first statement of each new migration, or prove the two schedules cannot overlap. Include the overlap case in the rerun rehearsal.

### R3-F10 · P3 · Text conflicts
- Spec L42 says "Infrastructure repair approval is pending separately"; spec L181 says it was approved. Plan L176 also says "production repair approval remains separate".
- Plan L158 says "Requires automation enabled/readiness at enqueue"; L167 says heartbeat freshness gates enablement, not enqueue. Define readiness at enqueue as: integration enabled + automation enabled + recorded owner.
- L136 says the claim verifies "enablement"; L159 says legacy has "no automation/heartbeat dependency". Specify the claim gates per job class, so the scheduler can claim legacy leftovers under cutover 0 with automation off.

### R3-F11 · P3 · `verify_for_notifications` input contract is undefined
- **Evidence:** `AdminOrders.tsx:343-344` sends the `order.myfatoorahPaymentId` stored at creation, which may be stale per R2-F7.
- **Fix:** the action accepts only `order_id`. The server selects the stored signed tuple, or the attempt's invoice, for the GET. The action also covers `pending_status_update` orders that have no webhook tuple.

### R3-F12 · P3 · RPCs needed for the `private` schema are missing before the SQL freeze · *missing contract*
- **Evidence:** L85 gives the `private` schema no PostgREST exposure, yet:
  - The facade must "recheck the recorded owner" in `private.wa_payment_evidence` (L148, L163). No public service-only lookup RPC exists in L97–130.
  - The payment-owned unresolved-tuple store, with states unresolved/resolved/evidence_mismatch/superseded keyed on signed `(Invoice.Id, Transaction.PaymentId)`, and its list/resolve RPCs are not named.
  - The deploy-skew case (an old worker with no evidence row) has no defined outcome, so MiniMax may bypass with direct writes.
- **Fix:** name these objects in Tasks 2 and 3. Define "no evidence row" as the legacy owner with a visible audit flag (or explicitly drop), and test it.

### R3-F13 · P3 · Fixture restore procedure is undefined
- **Section:** L203.
- **Failure:** a full schema-only dump restored into a freshly initialised `supabase/postgres` image collides with the image's own `auth`/`storage` objects. The storage/auth columns created by later gotrue/storage-api migrations may differ, for example on bucket inserts.
- **Fix:** specify the recipe. Restore `public`, `private` and the referenced `auth`/`storage` DDL as `supabase_admin` with `ON_ERROR_STOP`. Then prove parity by diffing a schema-only dump of fixture vs production for the referenced schemas, hashed and not printed.

---

## Readiness verdict
- **Can dispatch now:** Task 1, Task 2 (after the R3-F1 dormancy rule, R3-F12 naming and R3-F13 recipe are written in), and Task 3.
- **Blocked until amended:**
  - Tasks 4–6 on the payment and rollback parts: R3-F2, R3-F3, R3-F11, R3-F12.
  - Task 12: R3-F4, R3-F5, R3-F6.
  - Task 14: R3-F1, R3-F2, R3-F8, R3-F9.
- None of the P2s is a scope expansion. Only one round remains, so the P2s should be fixed before round 4, not deferred.

## Evidence limits
- Hashes not recomputed.
- Not read: `payment-security.ts`, `AdminOrderEmail.tsx`, `config.toml`, `supabase/functions/main/`, `/root/run-curemed-migrations.sh`, migration `20260523155217`, and the rest of `create-myfatoorah-payment` beyond the search hits.
- Not verified:
  - MyFatoorah webhook timeout, retry policy and the PaymentId lifecycle.
  - Kong and edge-runtime request/wall-clock limits.
  - Whether Edge Runtime hot-reloads after the copy.
  - Webhook header support in the `f1100ad` build.
  - Dokploy reload/autoDeploy semantics, and whether `be2c…` is an image ID or a RepoDigest.
  - The production router's JWT policy for each function.
  - T3 worktree base-ref behaviour.
- The live-DB facts (policy allowlist, roles, partial index) are taken from the brief, not independently observed.
