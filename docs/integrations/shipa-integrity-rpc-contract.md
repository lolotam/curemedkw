# Shipa integrity and review fingerprint

2026-11-03. This additive SQL dependency supports the reviewed manual and automatic Shipa paths. It does not enable either path. It installs functions only; it changes no existing table grants, defaults, triggers, constraints or stored order values.

## Service boundary

`shipa_check_integrity(_order_id uuid, _review_snapshot jsonb)` is executable only by service_role. Internal helpers have no PUBLIC/anon/authenticated/service_role execution grants. The future HTTP endpoint must authenticate the admin itself; a service RPC credential or browser-supplied UUID is not proof of an admin caller.

The request is a strict object with `environment` (`sandbox` or `live`) and optional `overrides`. It accepts no payment fact, amount, catalog price, coupon discount, trusted flag, endpoint, credential, provider state or acknowledgement. The entire request is limited to16KiB in PostgreSQL's JSON representation.

`overrides` permits only:

- `destination`: a partial object containing contactName, contactPhone, countryCode, governorate, city, addressLine, area, block, street and building. Values must be strings, bounded to1000characters. Kuwait phones accept local/international forms and Arabic/Persian digits; the effective snapshot uses +965 and eight local digits. Actual provider payload limits remain a pre-submission adapter check.
- `parcel`: the complete frozen parcel settings shape (count1, weightKg, dimensionsCm). Existing SQL settings validation supplies its shape/type/positive-value rules. No weight, dimension, coordinate, block or address is invented.

These overrides describe the delivery snapshot; they never rewrite billing or order history. Origin, service and pickup instructions come from the selected saved environment.

The response has exactly four safe keys:

```json
{"accepted":true,"reasons":[],"input_fingerprint":"<64 lowercase hex characters>","settings_revision":0}
```

`accepted` means this integrity check found no review issue. It is NOT paid evidence, dispatch eligibility, account/service entitlement, city-directory certification, credential validity or permission to send a provider request. A pending/unpaid order can have a valid price/address snapshot; payment remains owned by the single trusted payment outcome owner shared with WhatsApp.

## Pricing and review

The function compares item quantity/unit price/line total with current stored catalog price, sums persisted lines, and compares subtotal, discount and total using PostgreSQL numeric arithmetic. Coupon calculation follows the existing validate_coupon rule: percent rounded to three decimals; fixed capped at subtotal. Absent coupon means expected discount zero. Missing, disabled, expired, exhausted or minimum-not-met coupons require review. Current coupon use may have been incremented before payment; review is conservative and makes no fraud allegation or charge change.

Negative/NaN prices and inconsistent totals are review issues. Total uses subtotal minus discount; unexpected nonzero delivery_fee/tax_amount, if those columns are introduced, remain review-only. Non-KWD currency is flagged; the payment owner separately rejects an unbound provider identity/amount/currency, with no staff override of payment evidence.

Destination needs a nonblank contact, valid Kuwait phone, Kuwait country, governorate, city and full address line. Origin/service and explicit parcel defaults are checked for completeness. The function does not infer detailed-address components. Captured KWT directory membership, merchant Next Day entitlement, final adapter payload validation and other runtime eligibility checks remain mandatory before begin-submission. Missing dimensions/weight are review work, never fabricated defaults.

Review reasons are deduplicated and sorted fixed codes: catalog_missing, catalog_price_mismatch, item_total_mismatch, items_missing, subtotal_mismatch, coupon_requires_review, discount_mismatch, order_total_mismatch, unsupported_fee_or_tax, unsupported_currency, destination_incomplete, origin_or_service_incomplete and parcel_incomplete. Invalid authority/shape raises22023/shipa_invalid_review_snapshot (or the reused settings validator's fixed error). A missing order raisesP0002/shipa_order_missing. No raw provider errors are stored or returned.

## Fingerprint and concurrency

SQL hashes its canonical JSONB input with SHA256. Inputs include order identity/pricing/coupon code/currency/notes/email and original destination; effective delivery override/parcel; sorted persisted item and relevant current catalog facts; coupon identity/rule/current eligibility; selected environment/configuration/settings revision and the exact encrypted credential envelope fingerprint. It does not export the snapshot, credential envelope or customer details. No raw provider response or guest-writable provider payment id becomes evidence through this hash.

Equal current inputs yield the same fingerprint. A changed original address still invalidates a review even when an override masks it; different missing coupon codes remain distinguishable. Exact envelope changes invalidate the review even if a credential revision is reused. Time is represented only by coupon eligibility, not by a constantly changing observation timestamp.

Lock order is integration SHARE, order UPDATE, sorted order-item SHARE, sorted product SHARE, coupon table SHARE/row SHARE when a coupon is present, then selected credential SHARE. The parent order lock also fences inserts through the existing order_items foreign key. Coupon table SHARE fences insertion of a previously absent coupon code; row locks alone cannot protect that phantom. The catalog/coupon mutation contention tests observe actual lock waits. Keep the enclosing transaction short, perform no HTTP inside it, and perform no coupon writes after taking this integrity snapshot. Future payment/enqueue/begin functions must use this lock order and retain these locks until their atomic decision commits.

An earlier returned fingerprint does not grant a later submission. Begin-submission must recompute the same SQL snapshot inside its own transaction and compare the stored reviewed fingerprint; credential/config changes must also satisfy that operation's dedicated race checks. Provider ambiguity stays unknown and cannot use an integrity result, local validation or staff review to authorize re-creation.

## Evidence and remaining work

The actual-role SQL fixture exercises stable valid snapshots, forbidden authority fields, permitted address corrections, current catalog drift, three-decimal coupons, exhausted/expired/missing coupons, exact credential envelope changes, Arabic-digit contact normalization and tampered totals/address. It confirms no billing/payment change or shipment/receipt creation. The manager's guarded disposable database harness also rehearses additive/rerun behavior and concurrent catalog/missing-coupon writers. Its results are manager receipts, not independent review or production/provider proof; the final self-contained committed assembled harness remains required before PR.

Early local testing caught a JSON operator precedence error in override validation; it was corrected without weakening its rejection assertion. Mechanical helper extraction caught an outdated variable reference before the next test run. The first contention harness could not observe another role's lock details while acting as service_role; the observer was restored to fixture owner after the service-role call, preserving the actual contention assertion. Final successful run evidence must accompany this source checkpoint.

This subset has no successful-payment writer, receipt/retention activation, manual enqueue, begin-submission, acknowledgement writer, scheduler, account verifier or status/reconciliation endpoint. Those remain required dependencies, followed by admin UI, shared-payment integration tests, assembled review and separately approved production rollout. Ministry shopping hold remains unchanged. Rollback keeps the integration disabled and preserves additive schema/history; this is not a destructive rollback or activation authorization.
