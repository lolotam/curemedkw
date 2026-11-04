# Shipa one-shipment execution core

`createShipaDispatcher({client,keyring,fetchImpl?}).processShipment({shipmentId,integrationId,environment})` is an internal server operation. A future authenticated admin route or worker must derive that three-field binding from canonical records; a browser cannot supply its own actor, paid flag, endpoint, credential, draft or arbitrary binding as authority. This checkpoint supplies no route, scheduler, activation or delivery-status endpoint.

The real credential loader decrypts the selected environment's stored key first. The real submission store then prepares the shipment. Preparation is mutating and may hold unattempted work for review, but grants no request authority. The strict parser binds identity/environment, and the real adapter builder must produce a payload structurally equal to SQL's payload. Hashes/fingerprints pass through unchanged; no JavaScript SHA256 or alternate serialization is invented.

Only a successfully received and strictly matching durable begin authorizes one provider creation. The begin request has exactly six prepared fields, with credential revision/fingerprint from the key actually loaded. A fresher preparation never replaces stale loaded-key metadata. A fresh UUID is generated once. The begin response must match that UUID, captured input/settings/payload/draft and loaded credential. Refusal, transport loss or unusable begin response produces zero provider requests. No begin retry, provider lookup or cross-environment fallback occurs.

After begin resolves, one real `ShipaClient.createOrder` uses that same loaded key and matching draft. One completion records the normalized result with the same token; local rejection drops field/message members before SQL. Unexpected post-begin failure is uncertain. A failed/lost completion returns `persistence_uncertain` without retrying creation or persistence. The SQL safe summary remains authoritative: an already created record stays created; a conflicting reference may remain unknown. Created means accepted booking, not delivered.

Result statuses are `not_started` with a fixed refusal/failure code; `created` with safe SQL summary; `uncertain` with a fixed code and optional summary; or `persistence_uncertain`. No key, fingerprint, payload, customer address, arbitrary provider body or upstream error cause is returned. Core/store inputs reject unknown authority fields. SQL responses reject extra fields, wrong binding/token, invalid timestamp/counts or contradictory shipment-state/reference invariants. Store calls are one RPC per operation with no retry.

## Optional instruction parity

Migration `20261103002100_shipa_optional_instructions.sql` fixes a mapping discrepancy discovered during integration. Saved configuration still uses the existing string field. An empty/Unicode-blank optional pickup instruction becomes JSON null in the internal SQL draft, which the strict parser maps to an absent optional adapter property. SQL omits `origin.options` in that case. Meaningful instructions, including their surrounding text, remain unchanged. The existing pure Unicode-blank helper is reused; no WhatsApp credential/runtime is needed.

Prepared/begin root shapes and the six-field begin request are unchanged. Receipt, integrity, review, current hold/enablement, loaded-key/payload fencing and permanent-marker predicates remain unchanged. Old migration 016 is retained; the new migration overrides only the two feature-owned mapping helpers. The optional-field change grants no send/retry authority.

## Boundaries still required before use

The provider adapter enforces its existing 10-second network/body deadline. Endpoint/item/scheduler envelope budgets and lease-currentness checks still need assembly in the future wrapper; this core alone is not that proof. Pre-begin invalid draft/payload is a fixed response with no completion mutation, because completion requires an existing token/marker. Unknown dispatch stays sticky in SQL and cannot become re-creation authority through a local validation failure, staff review or a negative lookup.

Actual route/worker authentication, canonical candidate selection, scheduler heartbeat, readiness/activation, expiry/status/reconciliation, UI and live provider entitlement remain separate gates. Keep the shared payment owner, broad coupon SHARE/short transaction/no HTTP rule, Ministry hold and separate production migration/merge/native-operation approvals.
