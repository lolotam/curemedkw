# Shipa canonical binding and candidate selection

Migration `20261103002400_shipa_dispatch_selection.sql` adds two internal service-only reads. It
enables no integration, changes no payment/order/settings row and supplies no provider request or
dispatch authority. The existing durable begin remains the only operation that can authorize a
single creation.

## Canonical binding

`shipa_resolve_dispatch_binding(_shipment_id uuid)` returns SQL null for a missing shipment,
otherwise exactly `shipment_id`, `order_id`, `integration_id` and `environment`. Both shipment and
integration must belong to Shipa. Null input raises `22023/shipa_shipment_required`.

An authenticated route/worker supplies only the selected shipment ID and obtains its
integration/environment from this record. It must not trust a browser-provided binding. This
function performs no endpoint authentication; service execution privileges do not authenticate an
admin user. Admin routes must still use `auth.getUser` and a real role check, with actor identity
derived from that result.

Lookup includes historical/ineligible shipments so recovery can inspect the canonical identity
without granting another booking. This lookup is read-only and does not expire a lease. The distinct
`shipa_read_shipment` operation is MUTATING: it expires a targeted stale lease before returning its
safe summary.

## Bounded selection

`shipa_select_dispatch_candidates(_limit integer DEFAULT 3, _shipment_id uuid DEFAULT NULL)` returns
an array of the same four-field bindings, ordered by shipment creation time then ID. Limit must be
1–3; null/out-of-range raises `22023/shipa_invalid_candidate_limit`. An optional ID restricts a
service nudge to that canonical shipment. The future handler must enforce a service nudge's one-item
budget; the SQL bound alone does not distinguish scheduler credentials from service credentials.

Selection filters before applying the limit:

- Current enabled integration and environment; automatic-source work requires current automatic
  mode. Reviewed manual work remains selectable in either mode.
- Queued and due work, without any possible-dispatch fields or permanent private submission marker.
  No reset of a visible state can erase that marker.
- Paid KWD order outside cancelled/delivered states, with matching protected receipt and strict
  evidence for order/attempt/invoice/payment/currency/amount.
- Activated shared-payment retention and both ordering controls explicitly true. Ministry/checkout
  holds yield an empty array.
- Manual work has its matching actor/reason/fingerprint review audit.

These are coarse candidate filters. They do not certify current pricing/item integrity, fresh
readiness, account entitlement or final review/payload/credential consistency. Preparation and begin
must perform their existing locked recomputation, current hold/mode/environment, exact loaded-key
and permanent-marker checks. No HTTP may run inside those transactions. The broad coupon SHARE
contention cost in integrity is unchanged.

Selection records no token, lease, marker, state transition or scheduler heartbeat. Concurrent
workers may observe the same candidate; only one durable begin can win. The selector's answer and an
integrity `accepted` diagnostic are never send/retry authority. No provider no-creation allowlist
exists, and unknown/possibly dispatched work stays unavailable for re-creation.

## Privileges, proof and rollback

PUBLIC/anon/authenticated execution is revoked per object; only service_role receives the two
wrapper grants. The private projection helper is not executable directly by those roles. No
schema-level grants/default privileges or existing-table enforcement changes are installed.

The disposable actual-role fixture `supabase/tests/shipa/dispatch_selection.sql` creates synthetic
outcomes, strict evidence, intents, manual review and durable begins through the existing owners. It
tests bounded/filter-before-limit ordering, targeted binding, read-only replay, old environments,
future work, payment/amount/receipt/state/mode mismatches, review/hold/retention gates and a private
marker surviving reset public fields. It compares shipments, markers, events and heartbeat
before/after reads. Synthetic ciphertext represents presence only; there is no decryption or native
HTTP proof.

The assembled guarded proof runs this fixture alongside existing real-role, rerun, additive-schema,
parser/builder and forced-contention proofs. Results are manager evidence, not SA reruns or
deployed/native feature acceptance. The existing one-begin race remains the concurrency authority;
read-only selection itself makes no reservation guarantee.

Rolling back future application callers leaves these additive functions unused; this checkpoint
introduces no table data requiring reversal. Production merge/application/activation and actual
booking remain separate approved gates. Ministry shopping hold and the shared payment owner are
unchanged.
