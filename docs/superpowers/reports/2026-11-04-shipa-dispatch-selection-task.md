# Shipa dispatch-selection dependency

## Change and source review

The manager authored additive migration 024, an actual-role SQL fixture and the assembled proof
registration. Two service-only reads return four-field canonical bindings and at most three
currently selectable shipments. No child implementation paths are touched. Existing settings
enablement remains closed; no app route/worker/activation is added.

The source guard checked fixed search paths, per-object grants/revokes under permissive defaults, no
dynamic SQL, no schema-level/default-privilege changes, explicit null/limit handling and no mutation
hidden inside either read. The test guard checked boundary results and persisted before/after state
rather than only helper internals. Documentation was checked against actual signatures and
predicates. The minimal private binding helper is reused by both wrappers; the existing
permanent-marker helper remains authoritative for possible dispatch.

## Actual evidence

Focused application to the marker-guarded local fixture passed. Focused test session output `1d5543`
exited 0. Initial fixture setup failed because required synthetic credential `revision` and then
`updated_by` were omitted; both fields were added. No production predicate or assertion was weakened
to fix the fixture. No provider request was made.

Final assembled manager proof: unified session 6157, exit 0, log
`F:/Dev/Temp/curemed-shipa-manager/dispatch-selection-proof-20261104.txt`. It applied 17 migrations
twice in each private-schema case (absent/existing), exercised eight WhatsApp and eleven Shipa
fixtures per application, and retained actual callback/webhook, strict completion, manual/automatic
adoption, begin/key-rotation, unresolved-payment, paid-expansion and WhatsApp delivery contention
proofs. SQL preparation still matches the real Deno adapter builder. All recorded checks passed; the
guarded final restore and inert assembled schema application completed.

Baseline owner/ACL/default/constraint/trigger/policy parity passed in both cases. Recorded schema
fingerprints were `a8e94cda32dc7186bed82d5b950a54b4c12c57142e1cbb8b0fd0c9210003e6df` and
`9fa9e0eeb2519ec4267f59335942a6a2e5c110d4939015a322e65f6729e4f9c1`. They identify this run's parity
receipts, not a cross-restore stable object-ID assertion.

The new fixture uses 16 synthetic orders. Older blocked rows cannot starve the ordered
manual/automatic candidates. Changing mode leaves only reviewed manual work; disabled integration,
ordering/checkout hold and unactivated retention yield no candidates. Unknown and a state-reset
record with its private permanent marker cannot be selected. Canonical historical lookup remains
possible without retry authority. Selection replay changes no shipment, marker, event or heartbeat.
Browser execution and direct private-helper execution remain denied.

## Limits and next dependency

The final guarded read-only probe independently observed release `unmigrated`, shared-payment
retention false, both integrations disabled, zero shipments/markers/WhatsApp attempts and no
selected candidates. Its log is
`F:/Dev/Temp/curemed-shipa-manager/dispatch-selection-inert-check-20261104.txt`. The first probe
used the wrong WhatsApp column name `enabled`; it failed without mutation and was corrected to the
actual `integration_enabled` column before the successful observation.

These are manager local PostgreSQL/role/concurrency receipts, not SA reruns, endpoint identity
proof, native service entitlement, actual shipment creation or deployment evidence. Selection is not
a claim; multiple workers may select the same record. The existing locked begin must still recompute
all current evidence/integrity/review/credential/payload gates before a single provider call. Coupon
SHARE/short-transaction/no-HTTP requirements remain in force.

Canonical route composition, deadline/lease-currentness fencing, scheduler credential provenance and
heartbeat ownership, status/reconciliation, order UI, final assembled Astra review and
release/operating/rollback proof remain open. The separate MiniMax Task 6B review-store
implementation continues against its frozen baseline; this manager SQL dependency does not expand
that child's allowlist or task. No merge, full SQL freeze, production apply, pairing, payment,
booking or customer-message operation is approved by this checkpoint. Ministry hold and separate
production/live gates remain unchanged.
