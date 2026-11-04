# Shipa Task 7: authenticated configuration UI

## Scope

Adds `/admin/integrations`, five-action browser transport, strict DTO parsing, separate sandbox/live
drafts, write-only credential controls, readiness facts and automatic-enablement guards. Existing
`App.tsx` and `AdminLayout.tsx` change only for the lazy route and navigation entry. Production
modules are below 500 lines after the manager split. No dependency, generated client/type, global
style, backend, SQL, router, payment or deployment change belongs to this slice.

## Implementation and control provenance

MiniMax M3.1-Flash authored nine new files and two narrow route/navigation edits in prepared
worktree `t3-ee34d352`, branch `t3/ee34d352`, baseline `7fd1fb9cd3ef9a15cee965c3e9f0344a9a6b6310`.
The manager independently verified the gate, exact path/head, initial clean state, environment-file
removal and credential-pattern scan. Brief SHA256 was
`60edf13995b4b06ee75b3b872c49a5c53c253648d1a85d4781b83eacb60ed4d5`.

The manager audited the full activity range 0–330. Controls were instruction-only, not a hard
sandbox. Deviations: one forbidden file search at 274 within an allowed file, continued work after
`ENOENT` reads at 22/104, and a 614-line page exceeding the module cap. The sole command-execution
item was host workspace preparation; no worker shell, checks, Git or network operation was observed.
Child environment-file deletions and manager artifacts were not imported or staged.

Manager corrections restored a runtime import swallowed by a comment, handled the actual TypeScript
narrowing configuration without weakening it, split transport/draft/policy/controller/page concerns,
corrected DTO/credential/revision validation, eliminated duplicate secret storage, and protected
reload, readiness sequencing and same-frame writes. Additional fixes made local rejection clear
secrets, included a typed key in main Save changes, and required saved, matching positive readiness
for a new automatic enablement. Existing enabled-but-stale configurations remain enabled with
warnings; disabling remains available.

## Validation receipts

All logs are manager evidence under `F:/Dev/Temp/curemed-shipa-manager/`, not independent SA reruns
or native provider proofs.

- Full app TypeScript: `ui-tsc-reviewed-20261104.txt`, session 51822, exit 0.
- Targeted ESLint: `ui-eslint-final-20261104.txt`, exit 0, zero warnings.
- 61 Vitest cases across transport, page and controller: `ui-vitest-reviewed-20261104.txt`, session
  69260, exit 0.
- Production build: `ui-build-reviewed-20261104.txt`, session 83516, exit 0, 12.43 seconds, 2248
  modules. New page chunk: 49.04 kB.

Tests fake only SDK response/timing and the clock. Real shared validators, request builders, DTO
parsers, browser transport, controller and components run. Coverage includes exact payloads, no
retries, redaction, blank preserve, removal, independent environments, key clearing, live
confirmation, optimistic revision progression, failed reload, old/new readiness races, activation
fact failures, clock expiry without polling and same-frame write exclusion.

Earlier failures remain part of the record: initial TypeScript failed on the swallowed import and
narrowing/projection errors; two initial UI tests used ambiguous text selectors. New regressions
failed before fixes for blank replacement, malformed credential metadata, live-cancel retention,
key-save activation bypass, failed reload, five missing readiness gates, active-environment key
retention, wrong write revisions, local-validation key retention and main-form key discard.
Assertions were corrected only where the fixture/selector was wrong; behavior assertions were
retained. A later two-save test proves revision 7 to 8 to 9. No test was skipped or weakened to
claim completion.

Observed build warnings concern npm configuration, stale Browserslist data, PostCSS `from` and a
large main bundle (645.22 kB). No dependency/build-setting change was made to suppress them. No
independent baseline rerun is claimed. Final comment/documentation edits after these checks change
no runtime behavior.

## Review disposition and remaining gates

Manager source review and clean-code/test/documentation guards found the scoped slice suitable for a
local commit after the corrections above. This is neither assembled feature acceptance nor the
planned final Astra review. No real browser/visual check, production JWT admission, native account
entitlement, provider booking, customer message, live payment, pairing, deployment, migration
application or merge is claimed.

The server must still wire canonical booking/worker/scheduler/status/reconciliation and the common
trusted payment outcome owner. WhatsApp runtime/UI/automation and full donor parity remain separate
unfinished work. The Ministry shopping hold remains in force. Production migrations, merge/deploy
consequences, live shipment/customer-message/payment operations and public activation retain their
explicit separate gates. Rollback for this local UI slice is reverting its route/navigation and new
feature files; this checkpoint changes no database state. Full deployment and operating rollback
evidence remains an assembled-release gate.
