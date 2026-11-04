# Shipa positive-only unknown-result reconciliation

Migration `20261103002600_shipa_reconciliation.sql` can record a positively corroborated existing
booking without another provider creation. It supplies no native lookup, HTTP endpoint, staff screen
or provider retry. A miss/error/partial result, SQL admin UUID, service credential or local
rejection never establishes non-creation. The vendor's reference uniqueness and negative-lookup
consistency remain unestablished; no exactly-once remote-creation claim follows.

## Internal context and original identity

`shipa_read_reconciliation_context(_shipment_id uuid, _actor_id uuid)` is MUTATING. It authenticates
the supplied SQL admin row, locks integration SHARE then the canonical shipment UPDATE, and expires
only that shipment's stale lease before reading its state. A missing shipment returns SQL null; null
ID raises `22023/shipa_shipment_required`. An active submitting/created/otherwise ineligible record
raises `55000/shipa_reconciliation_requires_unknown`. Successful context requires unknown state and
a permanent submission marker.

Marker token, original settings/input/credential bindings and payload hash must agree with the
retained shipment. SQL independently recomputes the original payload hash; a tampered/missing public
copy raises `55000/shipa_reconciliation_marker_mismatch`. The current stored encrypted credential
fingerprint must equal the original marker's fingerprint, or context raises
`55000/shipa_reconciliation_original_key_unavailable`. This prevents adopting a lookup made with a
replacement merchant credential. There is no invented account-ID or key fallback.

The exact eleven internal fields are the canonical binding's
shipment_id/order_id/integration_id/environment plus customer_ref, shipa_ref, attempt_token,
updated_at, state, credential_revision and credential_fingerprint. Tokens/key-binding metadata are
INTERNAL ONLY; never forward this context to a browser. The endpoint must independently authenticate
with `auth.getUser` and a real admin role, derive the actor from that result, and load/decrypt the
exact selected original key. A SQL UUID/role check alone does not authenticate its HTTP caller.

No current enabled/mode/ordering check prevents existing-booking recovery. The original shipment
environment still selects its key when settings are disabled, another environment is active or
Ministry/checkout controls are held. These operations grant no new booking authority. Errors roll
the RPC transaction back, including tentative expiry; callers must obtain a fresh targeted shipment
summary rather than infer persisted unknown from a failed context request.

## Positive corroboration

After a bounded fixed-origin GET outside SQL, the server projects the already normalized provider
detail into exactly these eight fields:

```text
shipaRef       nonempty safe provider reference
customerRef    exact original merchant reference
status         nullable bounded provider status
type           Delivery
category       original domestic service category
origin         exactly {contactName,city,country}
destination    exactly {contactName,city,country}
packages       exactly one {customerRef,name,weight,length,width,height}
```

Both countries must be KWT; contact/city text is bounded/nonblank; package name has the captured
200-character bound, weight is positive, dimensions are null or positive finite numbers. Unknown
fields, raw bodies, secret fields, missing reference/identity values and a `found:false` substitute
fail closed. The normalized document is at most 16 KiB. Status uses the existing
120-character/control-free rule; it does not imply an ecommerce shipped/delivered state.

SQL compares merchant reference, type/category, party names/cities/countries and the single
package's stable reference/name/weight/dimensions exactly with the immutable submitted payload.
These are the identity facts retained by the current adapter; phone/address/email and other
discarded provider fields are not claimed as independently compared. A reference hit alone cannot
resolve the shipment. Missing or differently normalized facts remain review work; no weak-match
fallback is supplied.

## Atomic result

`shipa_apply_reconciled_detail(_shipment_id uuid, _attempt_token uuid, _expected_updated_at timestamptz, _credential_fingerprint text, _detail jsonb, _actor_id uuid)`
rechecks the same marker/original-key/frozen-fact bindings under integration SHARE, shipment UPDATE
and credential SHARE. No HTTP occurs while locks are held.

For unknown, an old timestamp/token raises `40001/shipa_reconciliation_changed`;
changed/original-key mismatch raises `40001/shipa_reconciliation_key_changed`; changed corroborating
facts raise `40001/shipa_reconciliation_facts_mismatch`. Timestamps/fingerprints pass through
unchanged; JavaScript must not round/re-hash them. Invalid shapes/bindings raise fixed 22023 errors.

A valid positive result uses the existing matching-token `shipa_complete` owner to become created.
It adds a private proof containing actor, original credential/payload hashes, normalized-detail
hash, provider reference and accepted/reference-conflict disposition, plus one fixed reconciled
event on success. Proof and result commit together. No new attempt, marker, payload, retry budget or
payment outcome is created.

An already resolved matching attempt preserves known acceptance: identical positive replay is
unchanged; a different claimed reference records the existing conflict behavior without overwriting
the known reference. A reference owned by another shipment remains unknown with
remote_reference_conflict and a conflict proof, never queued. A later correctly corroborated
positive lookup can resolve that same original attempt; it is not another create. No negative-result
or operator-declared no-booking path exists here.

The returned value is the existing safe eleven-field summary, with no internal
proof/context/detail/key. PUBLIC/anon/authenticated execution is revoked; only service_role receives
wrapper grants. Private proof table/helpers have RLS/no direct browser or service access. Per-object
privileges leave existing schemas/defaults/application tables unchanged.

## Evidence and remaining gates

The local actual-role fixture uses independent explicit normalized synthetic facts and real
payment/receipt/intent/begin/result owners. It checks partial/foreign facts, missing/mismatched
references, package/country bounds, original marker/key, active/expired contexts, hold/environment
recovery, positive replay, conflicting remote ownership and no payment/attempt changes. The
assembled proof also forces a second reconciliation and an original late HTTP completion to wait
behind the first reconciliation; all retain one accepted booking, marker, attempt, proof and
reconciled event. These are manager local SQL receipts, not native GET or endpoint authenticity
proof.

The future authenticated service must still perform the real provider read with the exact key,
normalize/project it, enforce request/late-continuation budgets and expose only the safe result.
Native lookup behavior/account entitlement, authenticated UI journeys, final Astra review, approved
production schema/application rollout and operating/rollback proof remain open. Rollback retains
additive proofs/functions rather than deleting recovery history. Ministry hold and separate
production migration/merge/live-operation gates remain unchanged.
