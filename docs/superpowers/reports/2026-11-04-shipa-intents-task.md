# Shipa atomic intents and staff adoption — manager validation

This checkpoint implements receipt-owned queue creation and manual review/adoption. It does not implement submission begin, the final durable submission ledger, provider booking/status/reconciliation, runtime handlers, scheduler or admin UI. Current settings still refuse enablement. No operational release or full SQL freeze is claimed.

## Source behavior

Strict GET evidence now commits its eligible Shipa intent in the same transaction as the retained payment receipt. One order/provider/environment identity and merchant reference survive strict replays and manual adoption. Original disabled/manual/historical decisions cannot be promoted after settings changes. Work can queue under the ordering hold, but manual request checks the hold and no submission consumer exists yet.

The new manual request requires server-derived admin identity, real role, genuine protected evidence, active enabled environment, current revision/fingerprint, explicit packed confirmation and reason. Only catalog price, coupon availability and discount differences may receive an explicit fingerprint-bound staff pricing acknowledgement. No payment identity/amount or changed first-success item facts can be waived. Review preserves billing/order history and deduplicates identical clicks/audit.

An apparently reviewable state is insufficient to re-create: retained attempt count/token, submitted time, payload/hash or remote reference independently block adoption. A source regression simulates possible dispatch followed by a misleading `needs_review` display state; manual review remains refused. This proves the current guard, not the still-unimplemented future begin/ledger writer.

Unapplied, unfrozen migrations 01200/01300 were amended to align structured address completeness with the shared settings contract and normalize nullable optional order fields. A narrowly classified automatic-integrity wrapper holds invalid delivery input for review instead of losing signed paid status/evidence. Unknown operational database errors continue to propagate. No production migration was edited or reapplied.

## Observed proof

Manager exec session `19532` exited 0. The committed guarded harness applied eight migrations twice, for both absent and pre-existing private schema under adversarial defaults. Existing schema owner/ACL/default/constraint/trigger/policy fingerprints stayed unchanged. It executed five retained WhatsApp SQL fixtures plus Shipa settings, dispatch state, integrity, owner, strict verification and intent fixtures on each pass.

The same job observed actual callback/webhook contention, separate skip-locked GET claims, duplicate strict completion, two competing manual requests and automatic strict-payment enqueue versus manual adoption. The last two cases preserved one shipment identity; identical manual clicks produced one review. All mutations used the actual service role; the fixture session owner was used only for synthetic setup and cross-session lock observation.

Schema fingerprints:

- Absent private: `103f6520a72dcbdea93c9c52d7305b47c9def4821206909689ca489a4b05e80e`
- Existing private: `e2ce19af6d4c6a8433893ae95a3b7f33ef0054a16ff6d6c82662a71782508aad`

Earlier focused intent SQL passed, followed by the expanded concurrency harness. Its new scenarios initially failed for three harness defects: a seed omitted required delivery address, a scalar JSON reader included psql's `SET` command tag, and a service-role observer could not see the fixture owner's lock details. The seed/tag handling and observer role were corrected; the contention assertion and integrity gates were retained. These were diagnosed failures, not blind reruns. The final job restored the guarded fixture to assembled schema with activation flags false.

This is manager evidence, not an SA rerun, independent Astra review, production concurrency guarantee or native provider proof. No full suite/build, production app database/application change, payment, shipment booking, message or QR pairing occurred.

## Remaining acceptance

Required next: current-input preparation and atomic begin with immutable payload/credential/configuration fencing and permanent dispatch evidence; runtime zero/multiple-provider-call tests; protected invoice-writer cutover/unresolved mapping recovery; secret/readiness services, endpoints and authenticated actor provenance; status/reconciliation/worker/UI; WhatsApp expansion/runtime/UI; final assembled review, approved production gates and journey/rollback proof. The broad coupon SHARE lock cost and short/no-HTTP transaction constraint remain explicit. Ministry hold and separate live payment/shipment/customer-message gates remain unchanged.
