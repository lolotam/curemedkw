# Shipa positive-only reconciliation SQL dependency

## Scope and guard review

The manager authored migration 026, an actual-role fixture and a forced-concurrency proof. Unknown
can become created only through a matching original marker/key and positive provider-detail identity
projection; there is no provider POST, negative-lookup retry, new attempt or payment/order-state
change. Context is explicitly MUTATING through targeted expiry and INTERNAL through attempt/key
metadata. New private audit proofs store hashes/actor/reference/disposition, not the native body or
plaintext keys.

Manager clean-code/test/documentation guard passes checked exact null/type/shape/bound conditions,
fixed errors, per-object grants and RLS, original payload hash recomputation, unchanged original
credential fingerprint, conservative incomplete-result handling, existing completion-owner reuse,
short integration/ship/credential lock order and no HTTP under SQL. The public summary remains
separate from internal context. Only retained name/city/country/package facts are compared; the
report does not claim that discarded provider phone/address fields were verified or that lookup
uniqueness/negative consistency exists.

## Actual receipts

Focused guarded application/fixture output `26fd68` exited 0. Earlier runs caught an ambiguous
fixture variable/column (`context`) and a real function variable/ON CONFLICT column collision
(`detail_hash`). The fixture uses a qualified block variable; production uses computed_detail_hash.
No assertion was removed or weakened. Source review then aligned the package-name bound with the
adapter's existing 200-character limit and added 200/201 boundary assertions.

Authoritative final source proof: session 6464 exit 0,
`F:/Dev/Temp/curemed-shipa-manager/reconciliation-proof-source-final-20261104.txt`. It applied 19
migrations twice in each private-schema case (absent/existing), ran eight WhatsApp and thirteen
Shipa fixtures per application, retained all prior
role/baseline/rerun/owner/claim/adoption/begin/key/unbound/expansion/tracking/delivery proofs and
real SQL-to-Deno-builder parity, and passed the new reconciliation/late-completion race.

The new three-session contention uses service_role for all mutations; only its lock observer resets
to the fixture owner. One reconciliation holds the shipment lock, a second positive reconciliation
and the original late matching completion both wait, then both return unchanged acceptance after the
first commit. SQL retains one marker, one attempt, one proof and one reconciled event. The race
isolates lock/idempotency behavior; independent explicit fixture facts test projection correctness
without using the matcher to manufacture expected identities.

Final baseline parity fingerprints:
`c42a26f00472bdecb215f3986f1d1caf49df7566b67ca54db8aa341fdb4bb2c3` and
`3e6f8695836fce8e0d8b1a2c93698d2e8c98b17c56af66246942263275b2e479`. Guarded final restore and inert
assembled-schema reapplication completed. These identify this run's
owner/ACL/default/constraint/trigger/policy parity receipts, not a stable cross-restore object-ID
claim.

Earlier session 23155 passed before adding the new contention case; 56203 passed that case before
the package-name bound alignment. They remain historical receipts; 6464 is the final source result.
A premature read of the buffered output file failed while its authoritative process was still
running; the same process handle was retained and completed, without restart based on missing log
output.

## Behavior proved and limits

Six synthetic possible-booking cases cover valid match/replay, full-fact/reference mismatch,
incomplete/malformed/negative substitute, country/weight/package bounds, foreign attempt, another
shipment's remote reference, corrected positive resolution on the same attempt, active versus
expired lease, original payload tampering, original key changes, SQL actor/browser denial and no
order/marker/retry changes. Known acceptance is never overwritten; malformed/partial/missing results
never produce a new creation authority. Current hold, disabled settings and a different active
environment do not hide recovery of an existing attempt.

All receipts are manager disposable PostgreSQL/role/concurrency evidence. No native provider
lookup/booking, endpoint/JWT caller proof, deployed feature, full SQL freeze or release acceptance
is claimed. Native details are synthetic and ciphertext proves presence only. The separate approved
MiniMax Task 6C manual HTTP/budget implementation continues at frozen 7e72 baseline; this
manager-only SQL work does not expand that child's scope or model/resource authority.

Runtime provider GET/projector, tracking/reconciliation/admin order UI, worker/scheduler, common
payment application wiring, WhatsApp full parity, final Astra/browser/native verification and
separately approved production rollout/operating rollback remain unfinished. No production mutation,
merge, payment, QR or customer message occurred. Ministry shopping hold and all separate
production/live gates persist; a positive-only recovery capability does not waive them.
