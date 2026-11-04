# Shipa one-shipment execution core

`createShipaDispatcher({client,keyring,fetchImpl?,now?,budget?}).processShipment({shipmentId,integrationId,environment})`
is an internal server operation. The authenticated manual route and any future worker must derive that
three-field binding from canonical records; a browser cannot supply its own actor, paid flag,
endpoint, credential, draft or arbitrary binding as authority. The manual route is documented in
`shipa-manual-runtime-contract.md`; no scheduler, activation or provider delivery-status endpoint is
supplied. The optional clock is server-owned and defaults
to `Date.now`; a browser cannot supply it.

The real credential loader decrypts the selected environment's stored key first. The real submission
store then prepares the shipment. Preparation is mutating and may hold unattempted work for review,
but grants no request authority. The strict parser binds identity/environment, and the real adapter
builder must produce a payload structurally equal to SQL's payload. Hashes/fingerprints pass through
unchanged; no JavaScript SHA256 or alternate serialization is invented.

Only a successfully received and strictly matching durable begin authorizes one provider creation.
The begin request has exactly six prepared fields, with credential revision/fingerprint from the key
actually loaded. A fresher preparation never replaces stale loaded-key metadata. A fresh UUID is
generated once. The begin response must match that UUID, captured input/settings/payload/draft and
loaded credential. Refusal, transport loss or unusable begin response produces zero provider
requests. No begin retry, provider lookup or cross-environment fallback occurs.

After receiving a matching begin, the core checks its lease against the current server wall clock
immediately before HTTP. At least 15 seconds must remain, allowing the planned item window around
the existing 10-second provider timeout. An expired/short lease or unusable clock returns
`uncertain/begin_lease_unusable`, with zero provider calls and no completion-as-local-rejection. The
durable marker may already exist; the core never renews it, erases it, reports safe retry or claims
persisted unknown without an SQL observation. Targeted expiry/reconciliation remains responsible for
the stored state. This preflight is not enforcement of the full item/request deadline or a guarantee
against process suspension after the check.

After begin resolves, one real `ShipaClient.createOrder` uses that same loaded key and matching
draft. One completion records the normalized result with the same token; local rejection drops
field/message members before SQL. Unexpected post-begin failure is uncertain. A failed/lost
completion returns `persistence_uncertain` without retrying creation or persistence. The SQL safe
summary remains authoritative: an already created record stays created; a conflicting reference may
remain unknown. Created means accepted booking, not delivered.

Result statuses are `not_started` with a fixed refusal/failure code; `created` with safe SQL
summary; `uncertain` with a fixed code and optional summary; or `persistence_uncertain`. No key,
fingerprint, payload, customer address, arbitrary provider body or upstream error cause is returned.
Core/store inputs reject unknown authority fields. SQL responses reject extra fields, wrong
binding/token, invalid timestamp/counts or contradictory shipment-state/reference invariants. Store
calls are one RPC per operation with no retry.

## Optional instruction parity

Migration `20261103002100_shipa_optional_instructions.sql` fixes a mapping discrepancy discovered
during integration. Saved configuration still uses the existing string field. An empty/Unicode-blank
optional pickup instruction becomes JSON null in the internal SQL draft, which the strict parser
maps to an absent optional adapter property. SQL omits `origin.options` in that case. Meaningful
instructions, including their surrounding text, remain unchanged. The existing pure Unicode-blank
helper is reused; no WhatsApp credential/runtime is needed.

Prepared/begin root shapes and the six-field begin request are unchanged. Receipt, integrity,
review, current hold/enablement, loaded-key/payload fencing and permanent-marker predicates remain
unchanged. Old migration 016 is retained; the new migration overrides only the two feature-owned
mapping helpers. The optional-field change grants no send/retry authority.

## Boundaries still required before use

The provider adapter enforces a network/body deadline of at most 10 seconds, clamped to remaining
item time. The core now fences every lazy operation and awaited continuation with one 15-second
monotonic budget, fresh per invocation or injected by the surrounding manual item. The manual
handler propagates request cancellation through that same budget. Late review/credential/prepare/
begin answers cannot start later provider work, including when a timer callback is delayed. These
client fences do not cancel SQL or establish production runtime suspension/network guarantees;
the future scheduler still needs its own 50-second parent envelope and serial item composition.
Pre-begin invalid draft/payload is a fixed response with no completion mutation, because
completion requires an existing token/marker. Unknown dispatch stays sticky in SQL and cannot become
re-creation authority through a local validation failure, staff review or a negative lookup.

The manual route's administrator authentication/canonical binding has local actual-SDK/SQL proof;
deployed routing and worker authentication, scheduler heartbeat, readiness/activation,
provider status/reconciliation runtime, order UI and live provider entitlement remain separate
gates. Keep the shared payment owner, broad coupon SHARE/short transaction/no HTTP rule, Ministry
hold and separate production migration/merge/native-operation approvals.
