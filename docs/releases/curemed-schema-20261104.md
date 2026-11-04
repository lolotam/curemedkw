# Curemed integration schema phase: source review only

This branch starts at main `878dde5748548094aab457b54402809d81770668`. It carries exactly twenty new migrations as immutable Git blobs from integration checkpoint `a045e2dc0aec0c639da5030433192309ca95ef3f`, plus preserved SQL regression fixtures, guarded local-fixture support and this static composition gate. It contains no frontend, Edge handler, environment, deployment or custom-router change. No integration branch ancestry is merged into this branch.

## Authority and retention

SA authorized construction and PR review of a schema phase, then a separately reviewed zero-SQL application phase. **No merge, server operation, SQL execution/application, guard activation or native operation is authorized.** Merging this branch can expose new files to automatic production migration runners; it is therefore a production migration decision, not a documentation-only publication. Ministry shopping hold remains active.

**RET-01 CLOSED, owner decision 2026-11-04:** every order with an assigned MyFatoorah invoice remains protected and must never be deleted, including pending and failed attempts. No archive feature is needed before release. Clear admin deletion-blocked messaging and the permanent atomic parent-only order-delete regression belong in the application phase. No history deletion or guard relaxation is authorized by this policy decision.

## Canonical order and source provenance

[The frozen migration inventory](curemed-schema-20261104.json) defines all twenty filenames, exact order, Git blobs, SHA256 of Git bytes and sizes. The first two files are WhatsApp foundations; files `010` through `027` add Shipa/shared-payment/evidence/delivery/tracking/reconciliation and dormant invoice protection. Missing suffixes `003` through `009` are not migration files. [Selected source provenance](curemed-schema-sources-20261104.json) also covers the preserved proof dependencies copied from source-only checkpoint `b919ae732f5251d927f5b5ac4c72e5e14188394d`.

The intended schema phase is additive and inert beside deployed code. Existing-table invoice index/triggers and retention links are installed only by separately approved application-phase activation functions, not by executing migration file `027`. Do not call an activation RPC or migrate credentials as part of schema installation. Static byte/composition verification is not a PostgreSQL execution, compatibility or concurrency proof.

## Checks that require no database or provider

Before committing, after staging only this release's allowed paths:

```powershell
python scripts/verify-curemed-schema-release.py --staged
python scripts/tests/test_curemed_schema_release.py
python supabase/tests/whatsapp/fixture_safety_test.py
git diff --cached --check
```

After committing, `python scripts/verify-curemed-schema-release.py` verifies the committed release against the pinned baseline. A future main update requires an explicit base/head reconciliation and new source gate. The composition validator refuses a missing/changed migration, changed frozen inventory or any additional runtime path. Its negative tests use fresh local Git repositories and never execute SQL. Fixture-safety tests mock Docker/SQL boundaries; they prove refusal behavior, not a real database restore.

Manager validation on this assembly: canonical Git-byte/composition check PASS (51 changed paths, 20 migrations, 26 selected proof-support paths); composition regressions **4/4 PASS**; existing fixture-safety boundary tests **4/4 PASS**; staged whitespace check PASS. No SQL, Docker, server or provider operation was performed. These are lead executions, not independent SA/bot reruns. Source/code/test/docs guard inspection covers the new static verifier, its negative regressions and this documented evidence boundary.

## Database evidence limits and prerequisite

The 22 retained `.sql` proof files and guarded fixture tooling are source artifacts only in this assembly. They were not executed by this release-construction task. Earlier manager actual-role/rerun/contention results belong to their original checkpoints and isolated fixtures; they are not SA reruns, current production proof or a newly executed full twenty-migration compatibility matrix.

The retained fixture intentionally requires a manager-controlled schema-only baseline with SHA256 `0c861d4b8a7623367ec29663ec7c81ac50a08237472fce284f888aa88a4f35b7`; that protected baseline is not published here. `core_proof.py` covers its stated first-two-foundation behavior, not the whole twenty-file set. Do not claim that this checkout alone reproduces the complete current database. A separately authorized isolated rehearsal must establish current baseline/role parity, all twenty files, baseline application compatibility, reruns, interruption/tracker behavior and contention before production execution.

## Required delivery sequence and rollback

1. Complete exact-head source/PR gates and preserve canonical migration bytes. No push of the old integration branch; no retarget/merge of PR21's review-base ancestry.
2. Prepare one execution packet with current before-assets, live ledger/runner identities and hashes, controlled pause/resume procedure and tested rollback/restore references. Current task does not authorize collecting fresh server state; retained assets must not be labelled current without revalidation.
3. Obtain separate owner merge/migration authority. Inventory and pause every applicable project migration/repo-sync/deploy trigger, select one runner and project lock, verify exact bytes/ledger before application, stop on the first failure. Never edit an applied file or blindly retry an uncertain ledger/DDL result.
4. Only after schema proof may the separately reviewed zero-SQL application phase publish dependent handlers. The existing application copier deploys functions before applying migrations; schema readiness must be a fail-closed prerequisite before dependent application copying. Source manifest metadata does not replace live router admission evidence.
5. Activate invoice/retention protection only under separate approved quiesced application cutover. Code rollback preserves activated invoice index/triggers and retained history; there is no general live-data guard relaxation. Leave inert additive schema dormant during an ordinary compatible application rollback.

This is not full Shipa/WhatsApp completion, migration approval, deployed-feature certification or permission for pairing/messages/shipments/payments.
