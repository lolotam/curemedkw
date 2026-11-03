# Shared payment owner foundation — manager validation

This checkpoint assembles the existing WhatsApp schema/credential/settings SQL into the Shipa feature branch and implements the common first-success status transaction. It is not a full SQL freeze, deployed integration, production migration approval or release acceptance.

## Implemented behavior

- One retained `wa_payment_outcomes` record owns both integrations' policy snapshots. Failed/pending attempts do not occupy the success slot. A successful replacement attempt can own it.
- Strict service-created invoice/order/attempt binding, protected payment states and existing allowlisted order detail fields. Authenticated GET source documents additionally check amount/currency against the matched attempt. Admin recovery requires an actual admin role; endpoint authentication remains a future handler requirement.
- Signed success commits without GET and leaves exactly one canonical pending-verification tuple. A late invoice binding preserves an earlier signed tuple's attempt budget and age. Replays preserve owner, recipients and mode despite later configuration edits.
- Explicit retention activation remains separate from additive schema application. Browser/direct-write access is denied. The default disabled/manual posture and Ministry hold remain unchanged.

## Observed checks

The actual-role `supabase/tests/shipa/payment_owner.sql` first passed through the existing guarded local fixture. The assembled primary-checkout harness initially stopped before SQL because its companion compose file had not yet been copied; the missing exact dependency was included, with no safety bypass.

The final `payment_owner_proof.py` run (manager exec session `5814`, observed exit 0) applied all six migrations twice for each of absent and pre-existing `private` schema. It ran the existing five WhatsApp SQL fixtures and new shared-owner fixture on each pass. Existing owners, grants, default privileges, constraints, triggers and policies matched the pre-application snapshot. Runner `postgres` was non-superuser; all data was synthetic in a marker-owned, internal-network, no-published-port local fixture.

Each schema case forced a callback to wait on a concurrent webhook's order lock and then completed both transactions. Receipts showed one changed paid result, one replay, identical owner/snapshot, one pending verification row and no invented strict evidence. This tests those two entry transactions, not legacy invoice writers during deployment skew or production-wide concurrency.

Final schema fingerprints:

- Absent `private`: `d1e610fd8d264723c42baeb5269228f470cac90c1ea348f1e9eb42e456eeb478`
- Existing `private`: `ba61be726ff8ee2fac2ecc8caff5e495c0ceb3a2a62084179917073869369364`

The guarded harness restored the local fixture to the assembled schema with activation flags false after its proof. Four fixture safety-boundary tests passed separately. No full frontend/backend suite, build or provider-native journey was run at this checkpoint.

The commit hook refused a synthetic hardcoded attempt UUID in the retained activation fixture. It was replaced with `gen_random_uuid()` because that test needs only an in-flight token, not a particular value. The changed activation fixture passed again; no hook was bypassed and no real secret was staged.

## Boundaries and next dependencies

The source and tests were written/validated by the manager; they are not an independent SA rerun or final Astra review. Existing instruction-only worker controls must not be described as a hard sandbox. No child was started or polled for this checkpoint.

Remaining: strict GET evidence transaction and bounded lease/retry recovery, atomic Shipa receipt/enqueue/begin and recomputation, WhatsApp expansion/dispatch, protected app-phase writer cutover, authenticated routes, admin UI, scheduler, assembled journey tests, final Astra/medium review and approved release/rollback proofs. Coupon-table SHARE contention must remain short and contain no HTTP or later coupon write. A diagnostic integrity result is not submission authority. Unknown Shipa outcomes remain sticky and do not authorize re-creation.

No code was pushed, merged, deployed or applied to the CureMed production database. No live payment, shipment, QR pairing or WhatsApp send was performed. The separately completed Evolution infrastructure repair remains an earlier, distinct evidence packet.
