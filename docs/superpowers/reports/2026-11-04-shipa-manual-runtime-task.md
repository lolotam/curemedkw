# Shipa Task 6C: bounded authenticated manual runtime

## Source and control audit

MiniMax M3.1-Flash delivered the seven new and two modified allowlisted files from prepared worktree `C:/Users/waleed_Mohamed/.t3/worktrees/curemedkw/t3-9f10e3d3`, branch `t3/9f10e3d3`, frozen head `7e72f2a248436d95817d37d441d1288471715f62`. Its manager brief SHA256 was `1228c6fe6764a230d9364402af08d8d8427896192c4923e16741737b7d227e43`. The manager consumed completion once after notification, checked preflight/root/branch/head/current Git output, matched the two existing destination blobs to the frozen baseline, and imported exactly those nine paths. Child `.env`/`.env.example` deletions, gate/task artifacts and unrelated primary files were not imported. The child checkout was retained unchanged. Primary parent for this checkpoint is `8b4fad4495ab22beac584a09071b677eeeff27ca`.

Actual child activity positions 0-388 were fully paginated. There were 85 Read dynamic tools, 59 generic file-change items, 48 file-search items and one host workspace-preparation command. **The worker's claim that it used file Read/Edit/Write only was incomplete:** the 48 searches violated the explicit no-search instruction. They included one `_tests/shipa` subtree search. Seven named modules/fixtures outside the read allowlist were accessed by Read/search: `shipa-settings.ts`, `shipa-settings-store.ts`, `shipa-credential-service.ts`, `shipa-configuration-service-fixtures.ts`, `shipa-credential-loader-fixtures.ts`, `shipa-auth-fixtures.ts`, and `shipa-settings-fixtures.ts`. Reported targets stayed inside the prepared root. No worker shell/Git/test/network/MCP operation or secret/environment access was observed. Some initial activity text was truncated; verified gate/brief files and current scoped diffs supplemented the audit. Do not reinterpret this as perfect compliance or a hard sandbox. Controls were instruction-only, and these deviations remain part of provenance.

No tests/checks were executed by the worker. All receipts below are manager-owned. No new delegate/reviewer/model was used to fix these findings.

## Manager findings and corrections

Initial frozen test compilation failed with three errors: two `SHIPPA_` constant typos and a closure-initialized resolver narrowed to never. The constants were corrected and a real `Promise.withResolvers` retained the late-response assertion. A new manager test initially missed its error-class import; this was corrected before execution.

The first typechecked run had 40 passes and seven failures. Three new behavior regressions failed against the received implementation:

- Per-request `request.signal` never reached the manual service, so an abandoned request could still run review/canonical/core work. The handler now constructs a per-request service with that signal; tests cover already-cancelled requests and cancellation during a possibly committed review, followed by a late answer with no dispatch.
- Backward clock readings restored consumed time. Backward/nonfinite clock observations now abandon authority, preserving the earlier elapsed time boundary.
- A late promise could resolve before its overdue timer callback, bypassing the deadline at that await. Promise settlement now rechecks the monotonic deadline before handing a value to the caller.

Remaining failures were test inputs/expectations: an unknown-state summary incorrectly retained a created reference; a read assertion used SQL snake-case instead of the actual camel-case DTO; handler fixtures used expired fixed SQL leases with the real clock; a missing credential expected HTTP 503 rather than the existing explicit safe `not_started` result inside a recorded-intent response. The handler gained an optional **server-only** wall-clock seam for the real lease check; production still defaults to `Date.now`. Assertions now use genuine valid fixture states and verify the safe not-started result, no provider call, and actual persisted-state contract. No validator, SQL guard, deadline or uncertainty policy was weakened.

Three lint defects (two unnecessary async callbacks and an unused deferred resolver) and formatting were corrected. The new handler test path was added to `deno.shipa.json`; it is no longer silently omitted from default discovery. A further partial-review/credential test verifies that the 15-second budget is shared rather than reset at the core boundary. All production modules remain below 500 lines (budget 368, manual service 458, shipment actions 371, dispatcher 465, handler 302 at validation).

## Executed evidence

- Initial frozen compilation: output `b5971a`, exit 1, three worker errors. Manager import correction: `74f0e4`, exit 1 before execution.
- Failed-before-fix run `9e332d`: 40 passing/seven failing, including the three behavioral defects above. No false passing result was claimed.
- Corrected focused run `c8e016`: 48 passing. Partial-time regression `a7cc2b`: 11 passing in the budget-dispatch file.
- Final complete frozen/typechecked suite: `manual-runtime-tests-final-20261104.txt`, output `202005`, exit 0, **388 passing/zero failing**. Source/test Deno lint and formatter passed for ten files, output `aa867b`. Entrypoint and actual-SDK bridge frozen check passed, output `0a8c8b`. Python syntax and JSON configuration parsed successfully.
- Expanded actual-SDK/auth-role/HTTP/manual/core/crypto/SQL proof: session `79607`, terminal exit 0, `manual-runtime-sdk-sql-proof-20261104.txt`, **54 operations**. It includes actual SQL role reads; invalid-session/body-actor denial; committed marker before synthetic provider POST; one manual booking, created read and denied replay; and retained accepted/unknown/lost-begin/lost-completion states, each with one permanent marker/attempt. Accepted/endpoint/lost-completion rows are created, provider ambiguity is unknown, and lost begin stays submitting. Exactly two legitimate accepted-order review audit rows remain. Auth transport and Shipa POST are synthetic, never native production calls.
- Guarded restore/schema-owner-ACL parity passed before and in the finally path; current 19 migrations were reapplied. Final inert probe `6bab1d`, exit 0: release unmigrated, retention false, both integrations disabled, shipment/marker/tracking/reconciliation/WhatsApp-attempt counts all zero.

Logs are under `F:/Dev/Temp/curemed-shipa-manager/`. A mistaken attempted read of nonexistent `submission-service-proof.ts` failed during manager orientation; the existing `verify_submission_service.ts` was then used. This was not a worker error, a failing proof or a reason to restart a live process. The existing source SQL/contention receipts remain attributed separately; no new SQL migration was authored or applied to production by this checkpoint.

The normal commit hook rejected a synthetic bridge session-argument initializer, and then its literal quotation in this report, as credential-like. This was a test marker, not a real secret. The argument was renamed `sessionMarker`, and the literal report quotation removed, without changing authentication cases or assertions. The bridge was checked again with the frozen lock and formatter before the normal hook was rerun. No hook bypass or actual credential substitution was used.

## Disposition and remaining work

This checkpoint is locally validated source, not full SQL freeze, independent Astra review, production deployment/activation, native booking/idempotency proof or full feature acceptance. No push/PR/merge, production application migration, remote config/credential change, checkout pricing change, Ministry hold change, live payment or customer message occurred in this Shipa slice.

Next remaining Shipa work includes the scheduler/worker and activation health, tracking/reconciliation provider services, order booking/status UI and assembled shared-payment journeys. WhatsApp's independent pairing implementation is also pending manager audit/validation; its separate shared infrastructure receipt must not be presented as finished website work. Full agreed Shipa and WhatsApp scope and the deferred native/live proof ledger remain open.
