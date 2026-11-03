# Shipa receipt-owned intents and staff review

Dependency update: migration 01600 now supplies the local preparation/begin/permanent-marker dependency; see `shipa-submission-rpc-contract.md`. The intent checkpoint below retains its original scope. Runtime worker/endpoints and native proof remain unfinished.

Migration `20261103001500_shipa_intents.sql` is a local, unactivated foundation. It creates shipment intents and staff-review audit, not provider bookings. Submission preparation/begin, a durable submission ledger, provider calls, status/reconciliation, authenticated endpoints, scheduler and UI remain required dependencies. Current settings RPC still refuses enablement with `shipa_runtime_not_ready`.

## One receipt, one environment-specific identity

The same first-success payment owner supplies WhatsApp and Shipa. Strict authenticated GET evidence creates the protected Shipa receipt and invokes `shipa_enqueue_automatic(outcome_id)` in that transaction. If either write fails operationally, that strict transaction rolls back together; previously committed signed paid status survives.

Automatic policy comes only from the immutable first-success snapshot. A manual/disabled/historical first decision cannot be promoted by a later settings change or replay. An originally eligible automatic decision can create its durable intent while current settings/hold prevent actual dispatch. Such a queue is waiting work, not a booking. Refund/cancellation prevents creation of a new automatic intent without erasing valid payment evidence.

Intent identity is unique by `(order_id, provider, environment)`, with one stable CureMed-generated merchant reference. A replay returns the existing identity without resetting a manual adoption, review, attempted payload or provider reference. Sandbox/live records remain distinct; environment switching does not migrate a queued identity.

The initial intent is `queued` for valid current inputs, or `needs_review` for an integrity hold, changed paid item facts or invalid delivery data. The integrity helper accepts a freeform address or structured street/building; governorate/city and configured origin governorate/area remain required. It does not invent block, PACI, coordinates or account entitlements. Nullable optional order address fields are normalized to empty fields for review. Known invalid delivery input becomes a safe review reason rather than rolling back signed paid status or strict evidence. Unexpected database errors still propagate.

## Explicit manual request/adoption

`shipa_request_manual(order_id, request_json, actor_id)` is service-only. The HTTP endpoint must authenticate through `auth.getUser()` and actual admin role, reject browser actor authority fields, and supply its verified actor. The SQL role check is additional defense, not proof of caller identity.

The request has exactly:

```text
environment                 sandbox | live; must be the active environment
overrides                   only the existing permitted destination/parcel patch
expectedSettingsRevision    integer revision from current safe settings
expectedInputFingerprint    fingerprint of the current SQL integrity preview
reviewReason                nonblank, at most 1000 code points
acknowledgePricing          explicit boolean
packedConfirmed             true; CureMed staff confirmation, not a Shipa API field
```

The method locks the ecommerce hold row, integration, order, then shipment. Ordering must be explicitly open and the integration enabled in the requested environment. A protected genuine receipt must match the canonical evidence, amount/currency and current paid order. A browser/admin dropdown marked-paid value cannot manufacture it.

Fresh catalog/coupon integrity and the expected revision/fingerprint are checked before adoption. The permitted pricing acknowledgement covers only `catalog_price_mismatch`, `coupon_requires_review` and `discount_mismatch`. It cannot waive missing payment evidence, mismatched payment amount/identity, changed paid items, missing catalog, invalid quantity/line totals or invalid delivery data. It never reprices or changes order/item history. Delivery corrections stay in shipment overrides.

Immutable paid-item facts are compared with the first-success order snapshot, including same-price product replacement. They cannot be silently replaced after payment or waived by the pricing flag.

An existing unattempted automatic intent is adopted under the same shipment ID and merchant reference. A duplicate identical staff click returns unchanged and does not duplicate the private review audit. Different approved reviews retain actor, reason, input/settings revision, exact override and explicit pricing acknowledgement. This audit does not confer submission authority.

Manual adoption requires `queued`, `needs_review` or unattempted `rejected` **and** no durable indication of possible dispatch: attempt count/token, submitted timestamp, payload/hash or remote reference. Changing a visible state to `needs_review` does not erase those facts. Any possibly dispatched attempt remains blocked for reconciliation; neither local validation, admin identity nor a new reason authorizes re-creation. No no-creation retry allowlist has been established by Shipa, so this migration adds no provider retry path.

## Authorization and lock boundaries

Browser execution and direct service writes are revoked. Private review rows have RLS and no browser/service table access. New helper functions have explicit per-object execution revocation, including under adversarial permissive defaults. Schema application touches only new feature objects; it installs no enforcement on deployed legacy payment writers.

The automatic path follows the existing WhatsApp settings → Shipa integration → order lock chain and retains current item/product/coupon/credential locks through the transaction. The manual path locks the ecommerce hold row before integration → order → shipment. Integrity's coupon-table SHARE lock deliberately blocks unrelated coupon writes too; keep the transaction short, with no HTTP or later coupon write. Final assembled lock review and real runtime proof remain required.

## Local proof and limits

`supabase/tests/shipa/intents.sql` uses real owner/GET-evidence functions, actual roles and synthetic configuration. It tests structured addresses, optional NULL fields, invalid delivery data without losing paid/evidence, atomic eligible enqueue, repeated strict results, no historical promotion, hold rejection, forged SQL admin identity, browser/helper privilege refusal, adoption under one identity, duplicate review suppression, stale fingerprint, bounded price acknowledgement, changed paid items and possible-dispatch preservation after a display-state change. It performs no HTTP.

The expanded marker-guarded `payment_owner_proof.py` also forces two staff clicks and an automatic strict-payment enqueue versus manual adoption to contend. These local tests do not prove a deployed booking, genuine provider account entitlement, endpoint identity provenance or a working submission marker/worker. Those are unfinished release gates, not deferred live-proof substitutes.
