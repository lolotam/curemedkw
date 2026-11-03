# Shipa submission preparation and durable begin

Migration `20261103001600_shipa_submission.sql` implements local SQL preparation and the single atomic begin. No runtime endpoint, provider request, scheduler, native account-readiness proof or deployment is supplied by this checkpoint. Integration settings still refuse enablement until the remaining runtime contracts are installed and approved.

## Service-only protocol

1. Load the selected environment's encrypted credential through `shipa_read_credential(integration_id, environment)` and decrypt in server memory using the existing native crypto contract. The exact root envelope now contains `envelope`, `credential_revision`, `rotated_at` and `credential_fingerprint`. The six-field encrypted envelope itself is unchanged. The fingerprint is SQL-owned and binds the exact stored ciphertext/nonce/key-version/integration/environment tuple; never recompute it through a differently serialized JS object.
2. Call `shipa_prepare_submission(shipment_id)`. Preparation is **MUTATING**: it may place unattempted work into `needs_review`. Use authenticated POST handling; it is not a GET/health probe. `ready=true` is only preparation, not permission to send.
3. Validate/build the returned server-owned draft through the actual Shipa adapter. It must match the prepared payload. Construct the internal begin request by explicitly selecting the six fields below. Credential revision/fingerprint must come from the key actually loaded/decrypted; do not replace stale loader metadata with a new preparation's metadata.
4. Call `shipa_begin_submission(shipment_id, fresh_attempt_token, prepared_request)`. Only a successfully received `ready=true` begin result authorizes that worker to issue **one** create request, after the database transaction commits. Use the returned draft/payload and the matching loaded key.
5. Persist the provider outcome with the current token through the existing completion RPC. A missing/ambiguous response or lost local persistence stays uncertain; never obtain another create authority from a status read or repeated begin.

The begin request is exactly:

```text
settings_revision
input_fingerprint
credential_revision
credential_fingerprint
payload
payload_hash
```

Prepared output additionally includes `ready`, `shipment_id`, `integration_id`, `environment` and the adapter `draft`. These are not copied wholesale into a begin request. No API key, ciphertext, nonce or arbitrary endpoint appears in preparation/begin output. Its customer delivery payload is service-only.

## Data, policy and race fences

Preparation/begin lock the explicit ecommerce hold row, integration SHARE, order UPDATE, and shipment UPDATE. The genuine paid receipt/current amount and unchanged first-success item facts are required. Disabled integration, old environment or automatic work under manual mode stays ineligible. No fresh scheduler heartbeat is required for an existing eligible manual/automatic intent; enablement readiness is separate.

The SQL integrity snapshot is recomputed while these locks remain held. Item/product locks and the broad coupon-table SHARE lock remain through the transaction; that lock also blocks unrelated coupon writes. No HTTP or later coupon write belongs in this transaction.

Manual source requires the matching current review fingerprint and actual persisted review audit. A pricing acknowledgement uses the existing narrow pricing whitelist. Changes to catalog, order, override, settings or exact encrypted credential invalidate that fingerprint. Automatic source requires fresh accepted integrity. Missing credentials never fabricate readiness. Payload field bounds are checked before marking submission.

SQL builds the draft and expected wire payload exclusively from saved configuration, receipt-bound order data and the intent's permitted overrides/reference. It composes only supplied street/building/block values when a full address line is absent. It fixes Delivery/KWT/Doorstep/prepaid collection 0, retains the configured pickup instruction and uses cm/kg. The existing adapter independently validates/maps that draft. Begin requires deep equality with the current SQL payload and its SQL-canonical JSONB SHA256. This is a canonical JSON representation hash, not a claim about literal HTTP byte formatting.

A changed preparation revision/fingerprint/key binding holds unattempted work for review and grants no request. A changed payload/hash is rejected. Exact ciphertext fingerprint also fences a replaced envelope whose revision was incorrectly reused. Settings/credential writers requiring integration UPDATE cannot commit across the held SHARE lock. After a begin commits, a later disable/hold cannot recall the already marked in-flight attempt; future begins recheck those gates.

## Permanent possible-dispatch evidence

The successful begin atomically inserts `private.shipa_submission_markers` and updates the public row to `submitting` with token, attempt count, immutable payload/hash, configuration/key/input fingerprints, submission time and a 45-second lease. Marker identity is unique per shipment and attempt token. Private table reads/writes and helper execution are revoked from browser and service roles.

Even a misleading queued/review display state with cleared public attempt fields cannot remove this private evidence. It blocks manual adoption and every new begin. Repeated begin returns no authority; a lost begin response must therefore be treated conservatively even if HTTP never started. Lease expiry preserves token/context and moves to unknown; a late definitive result for the same token may still become created. Created means accepted booking, not delivered.

The current verified provider contract has no safe no-creation retry allowlist. Accordingly this ledger permits one creation attempt per intent; no reconciliation result or local validator can erase its marker. A later authoritative no-creation/retry extension needs a reviewed protocol preserving all prior attempts. Negative lookup, admin identity, `needs_review`, local validation and service credentials alone are never re-creation proof.

## Evidence and remaining work

`submission.sql` exercises real receipt/intent/begin/expiry/completion calls, actual roles, payload tampering, hold, lost response, late acceptance, a reused attempt token, exact loaded-key fingerprint with revision reuse, changed order/catalog/paid items, valid/stale manual pricing review and private-ledger preservation after all public attempt fields are reset. Synthetic ciphertext is presence metadata, not proof of actual credential decryption/readiness.

The guarded assembled proof also forces two begins to contend: one worker gets authority, one is refused, and one marker/attempt persists. It sends actual SQL preparation into the real Deno 2.5.6 adapter builder and checks equal wire payload. Neither test sends HTTP. Runtime call-count/crash behavior, authenticated actor/worker provenance, scheduler, account/directory/service readiness, credential mutation guards, reconciliation/status/UI and final assembled review/deployment still require implementation and proof. Ministry hold and separate production/live operation gates remain.
