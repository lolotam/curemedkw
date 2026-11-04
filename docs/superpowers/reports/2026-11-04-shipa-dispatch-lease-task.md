# Shipa received-lease fencing correction

## Problem and behavior

Manager source review found that a strictly matching begin response could arrive after its SQL lease
expired, yet the core would still issue HTTP. The core now checks the received lease against a
server-owned wall clock immediately before creating the Shipa request. Fewer than 15 seconds
remaining, a nonfinite clock or a thrown clock error yields fixed `uncertain/begin_lease_unusable`
with no provider call and no completion mutation. A marker may already be committed; no local
rejection, safe retry, renewal, marker erasure or persisted-state assertion is manufactured.

The production change adds one optional injected server clock (default `Date.now`), one fixed result
code and a small pre-HTTP predicate. Existing tests inject a deterministic clock aligned with their
synthetic SQL timestamps. No browser input, RPC shape, SQL, provider timeout, retry policy or
application activation changes. Documentation distinguishes the preflight from the still-required
complete item/request cancellation/deadline wrapper.

## Verification

Before the fix, three new runtime tests executed with `--no-check` because the optional clock had
not yet been added to the TypeScript interface: two failed, proving expired/short matching leases
still reached the fake provider and returned created; the valid-lease control passed. This was an
intentionally failing behavioral baseline, not a successful compile claim. Log:
`F:/Dev/Temp/curemed-shipa-manager/dispatch-lease-before-20261104.txt`, command output `677d9c`,
exit 1.

After the fix, normal frozen Deno 2.5.6 typechecked tests passed: 50 cases across the four new lease
cases, 23 existing dispatcher cases and 23 submission-store cases. Log
`dispatch-lease-after-20261104.txt`, final output `f5fb43`, exit 0. New cases exercise an actual
deferred SDK boundary with clock advancement after begin was sent, expired/short boundary values, a
valid remaining window permitting exactly one POST/completion, and unusable clock failure. Real
parsers, store, credential crypto, adapter and HTTP implementation execute; only RPC, provider fetch
and the clock are synthetic. Targeted lint and formatter passed.

The existing real SDK/core/native-crypto/service-role SQL bridge also passed with the default server
clock: session 49373 exit 0, log
`F:/Dev/Temp/curemed-shipa-manager/dispatch-lease-sdk-proof-20261104.txt`. It executed 26 operations
and retained one marker/attempt per case: acceptance created, ambiguous response unknown, lost
committed begin submitting with no provider POST, and lost completion response with SQL already
created. Native POST is synthetic. Guarded restore and assembled-schema reapplication completed. No
live or production access occurred.

The first mechanical clock-injection edit asserted the wrong constructor count and stopped before
writing. Inspection confirmed 14 sites; exactly those sites then received the test clock. This
changed no production predicate or behavior assertion. No skipped tests, hook bypass or
dependency/config change was used.

## Review and limits

Manager clean-code/test/documentation guard passes checked fixed errors, no secret-bearing causes,
conservative handling after possible begin commit, provider/RPC call counts, positive control and
actual-source documentation. This small finding was corrected in the existing manager lane; it is
not a new implementer/reviewer or full feature acceptance.

The remaining 15-second item/50-second scheduled-request budgets need bounded awaited operations and
cancellation/fencing that prevents late HTTP after an abandoned wait. A `Promise.race` around an
unmodified dispatch operation would not establish that property. The 45-second lease remains
SQL-owned. Clock/currentness and runtime allowance require assembled staging validation; this
checkpoint makes no process-suspension or native latency guarantee.

Canonical manual/worker routes, shared-payment application wiring, scheduler/status/reconciliation,
final Astra review, deployment/rollback and native/deferred proof ledger remain unfinished. Rollback
retains the conservative check; do not re-enable stale-lease sends as an operational recovery
action. Ministry shopping hold and all separate production
migration/merge/pairing/payment/booking/customer-message gates remain unchanged.
