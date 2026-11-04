# Shipa accepted-booking tracking

Migration `20261103002500_shipa_tracking.sql` stores normalized tracking observations for an already
accepted booking. It supplies no HTTP endpoint, native GET, booking, retry, payment mutation,
ecommerce order-status update or unknown-result reconciliation. Missing/failed remote reads must
leave the last good snapshot intact.

## Internal refresh context

`shipa_read_tracking_context(_shipment_id uuid, _actor_id uuid)` is service-only and requires the
supplied actor's real admin row. Its route must first authenticate using `auth.getUser` and a real
role lookup; a supplied UUID alone is not caller authentication.

Missing shipment returns SQL null. A non-created shipment raises
`55000/shipa_tracking_requires_created`; missing credential raises
`55000/shipa_tracking_credential_missing`. Null ID raises `22023/shipa_shipment_required`.

The context contains exactly ten internal keys: `shipment_id`, `order_id`, `integration_id`,
`environment`, `customer_ref`, `shipa_ref`, `attempt_token`, `updated_at`, `credential_revision`,
`credential_fingerprint`. Identity/environment come from canonical records. Attempt/key-binding
metadata must never be returned in a browser response. It carries no key, ciphertext, nonce or
payload. This read does not expire leases; the separate `shipa_read_shipment` remains MUTATING
through targeted expiry.

The server loads/decrypts the exact selected-environment key, compares the loaded credential
fingerprint, and performs bounded GETs through the existing fixed-origin adapter outside SQL. No
caller-controlled endpoint or browser observation is authority. The runtime layer implementing these
operations remains unfinished at this checkpoint.

## Recording a normalized observation

`shipa_record_tracking_observation(_shipment_id uuid, _attempt_token uuid, _expected_updated_at timestamptz, _credential_fingerprint text, _observation jsonb, _actor_id uuid)`
requires exactly this observation shape:

```text
shipaRef       safe provider reference; must equal the accepted booking
customerRef    safe merchant reference; must equal this local shipment
status         nullable provider text, at most 120 characters, no controls
story          at most 2000 normalized {status,statusCode,date} entries
tracking       {available:false}, or exactly
               {available:true,location:{latitude,longitude},eta,duration,distance}
```

History texts are nullable/bounded; date is a nullable finite number with its provider unit
unchanged. Tracking latitude/longitude retain geographic ±90/±180 bounds. ETA is nullable bounded
text or a finite number. Duration/distance are nullable `{text,value}` measures with nullable
bounded text and nullable finite integer value. No unit conversion or terminal-status vocabulary is
invented. The complete normalized document is bounded to 512 KiB and unknown/secret/raw-body fields
fail closed.

The transaction locks integration SHARE, shipment UPDATE, then the current environment credential
SHARE. It requires the same created booking, attempt token, exact unmodified SQL timestamp and
current loaded-key fingerprint. A caller must pass `updated_at` through unchanged; rounding it in
JavaScript loses the optimistic-lock contract. A stale response/token raises
`40001/shipa_tracking_changed`; a rotated/missing key raises `40001/shipa_tracking_key_changed`;
reference mismatch raises `40001/shipa_tracking_reference_mismatch`. No write is retried implicitly.

First valid commit wins the SQL revision; concurrent peers with the old timestamp wait and then
conflict. This is optimistic serialization, not a guarantee of provider event ordering or the newest
remote fetch start. Staff must reload/review a conflict explicitly. Unknown/submitting records
cannot use this operation to adopt acceptance or create a new attempt. Unknown reference
reconciliation remains a separate required contract.

A valid observation stores a bounded private snapshot and updates only the shipment's
provider-status metadata/timestamp. A null remote status does not erase its last known summary
status, while the snapshot honestly records null. Booking acceptance/reference, payload, attempts,
marker, retry state, payment and ecommerce order state remain unchanged. No WhatsApp shipped event
is triggered by tracking.

Existing accepted bookings can be tracked when integration settings are disabled, another
environment is active, or the Ministry hold is present. The stored booking environment still selects
its credential. These read/metadata operations grant no shipment-creation authority.

## Safe snapshot and privileges

`shipa_read_tracking_snapshot(_shipment_id uuid, _actor_id uuid)` returns SQL null when no snapshot
exists, otherwise exactly `shipment_id`, `provider_status`, `story`, `tracking`, `checked_at`.
`checked_at` is server persistence time, not an invented provider event time. A legitimate
unavailable courier location is `{available:false}`. This read has no lease-expiry side effect.

Snapshots have RLS and no direct browser/service table privileges. Wrappers revoke
PUBLIC/anon/authenticated execution and grant service_role only; private validation helpers are not
directly executable by those roles. Per-object grants/revokes leave existing schemas/default
privileges/application tables unchanged. Actor provenance and browser-safe response projection
remain required authenticated-handler tests.

## Proof and rollout limits

`supabase/tests/shipa/tracking.sql` uses synthetic signed/strict payment attestations, real
owner/receipt/intent/begin/completion operations, actual roles and normalized synthetic GET
documents. It tests identity/token/timestamp/key/shape boundaries, last-good-snapshot retention,
historical settings/hold reads, unavailable positions and preservation of order/payment/marker/audit
state. The assembled proof forces a stale concurrent writer to wait on the first tracking commit and
then refuse it without overwriting acceptance or the snapshot. These are local manager receipts, not
native provider or deployed feature acceptance.

Application rollback can retain this additive table and functions unused, preserving snapshots. No
existing order/payment data needs reversal. Native status/refresh UI, reconciliation, runtime
deadlines, final Astra review, approved schema/application rollout and operating/rollback evidence
remain open. Ministry hold and separate production
migration/merge/live-booking/payment/customer-message gates remain unchanged.
