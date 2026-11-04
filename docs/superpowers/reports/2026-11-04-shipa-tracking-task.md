# Shipa accepted-booking tracking SQL dependency

The manager authored additive migration 025 and an actual-role fixture, registering them in the
guarded assembled proof. Source supplies normalized tracking storage/reads for accepted bookings
only. It does not implement a provider GET, endpoint, order panel or unknown-result reconciliation.
It never changes a paid outcome, ecommerce order status, booking ownership, attempt/marker, retry
authority or shipped-message decision.

## Source and guard disposition

The implementation uses a private bounded snapshot with RLS/direct privileges revoked, three
service-only wrappers, explicit fixed search paths and per-object grants/revokes. No existing-table
enforcement or schema/default-privilege change is installed. Context is explicitly internal because
it includes attempt/current-key binding metadata. The browser projection is separate and has five
safe fields. Provider/merchant reference, current token, unmodified timestamp and current stored-key
fingerprint fence writes. Integration SHARE then shipment UPDATE then credential SHARE retains the
relevant suffix lock order and runs no HTTP.

Manager clean-code/test/documentation guard passes checked these predicates, no arbitrary
endpoints/raw bodies, complete shape/bound/null handling, actual source signatures and evidence
limits. History timestamps/ETA retain their source units; no status ranking, delivered-order update
or remote exactly-once guarantee is invented. Null status is honest in the snapshot and preserves
the last known summary status. Unknown cannot obtain ordinary tracking context or write a tracking
observation, so this dependency cannot silently resolve it or reopen booking.

## Executed receipts

Focused guarded migration application and actual-role fixture passed, final output `097ea0` exit 0.
The first fixture failed because `to_jsonb` received an untyped synthetic string literal; adding the
explicit text cast fixed setup without weakening the invalid-control-character assertion.

Initial assembled run 87017 passed before the new forced tracking-contention case. Final
authoritative run 89688 exited 0 with that case included, log
`F:/Dev/Temp/curemed-shipa-manager/tracking-proof-final-20261104.txt`. It applied 18 migrations
twice in each private-schema case (absent/existing), exercised eight WhatsApp and twelve Shipa
fixtures per application, retained all previous actual
owner/claim/adoption/begin/key/unbound/expansion/delivery races and SQL-to-real-Deno-builder parity,
and passed the new tracking stale-peer lock/refusal case. Observer-only lock inspection uses the
fixture owner; both tracking writers execute as service_role. One snapshot/created booking/one
attempt/one marker survive; the stale peer cannot overwrite the first commit.

Baseline owner/ACL/default/constraint/trigger/policy parity passed with recorded fingerprints
`b6b00ee50d4a9de9ee3a01dc27667bfc2834f3e1158e0df5ddad68902676bb62` and
`ef657b5bdb85c1cf68aca6ec32eca89e367b417115d763ad7693af5164b5c8c2`. Guarded final restore and inert
assembled-schema reapplication passed. Fingerprints identify this run's parity checks, not a stable
cross-restore object-ID claim.

The new SQL fixture verifies ordinary and null-status snapshots; raw-unit history;
available/unavailable position; malformed text, coordinates, measures, dates, extra fields and
oversized history; stale timestamp, wrong references and key rotation; unknown refusal; forged SQL
actor/browser denial; and no change to full order rows, permanent markers or booking events.
Existing-booking observations remain usable with disabled settings, switched active environment and
both ordering controls held. Synthetic ciphertext is presence metadata only; no native credential
decryption or HTTP/booking is performed by the SQL fixture.

## Remaining gates

All results are manager local PostgreSQL/role/concurrency receipts, not SA reruns, endpoint/JWT
identity proof, native tracking/entitlement, deployed feature acceptance or full SQL freeze.
Application code must independently authenticate, load the exact key, perform bounded fixed-origin
GETs outside SQL, validate/normalize the remote documents and expose only the safe snapshot.
Explicit refresh conflicts must not silently replay a write. Unknown-result matching/reconciliation,
the order panel, scheduler/payment assembly, final Astra review and approved
rollout/operating/rollback proof remain unfinished.

No merge, production apply, public activation, payment, booking, QR or customer-message authority
follows from this checkpoint. Ministry shopping hold and separate production/live gates remain in
force. Rollback retains additive snapshots/functions unused rather than deleting operating history.
