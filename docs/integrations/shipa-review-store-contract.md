# Shipa review/intent store

`createShipaReviewStore({client})` composes strict request/response validation over three existing
service-only RPCs. It supplies no authentication endpoint, provider request, scheduler or dispatch
authority. The caller must independently authenticate using `auth.getUser` and a real administrator
role, then pass the server-derived actor descriptor. UUID shape validation is not authentication.

## Operations

- `preview({actor,orderId,request})` validates exact outer/nested shapes and calls
  `shipa_check_integrity({_order_id,_review_snapshot})` once. The RPC has no actor argument; none is
  invented. The returned `accepted` flag is diagnostic, never paid evidence, native entitlement or
  submission permission.
- `requestManual({actor,orderId,request})` calls
  `shipa_request_manual({_order_id,_request,_actor_id})` once. Request has exactly environment,
  overrides, expectedSettingsRevision, expectedInputFingerprint, reviewReason, acknowledgePricing
  and packedConfirmed. SQL owns receipt/hold/current integrity/review and possible-dispatch rules.
  Returned data must be an unattempted queued summary without remote reference or retry time; this
  is an intent/adoption, not a provider booking.
- `readShipment({actor,shipmentId})` calls `shipa_read_shipment({_shipment_id,_actor_id})` once. SQL
  null maps to null. The call is MUTATING because SQL expires the targeted lease before returning
  metadata; it is not a GET/health probe and never requests a global expiry sweep.

Malformed/injected actor, paid, endpoint, proof, credential, source and unknown fields fail before
RPC. There is no automatic retry, table access, read-before-write, environment/key lookup,
fingerprint recomputation or provider client construction.

## Shared validation and response projection

Parcel validation uses the existing shared parcel schema, including explicit nullable
weight/dimensions. Destination strings preserve supplied Arabic/Persian digits and whitespace; SQL
owns phone/address normalization. Override/reason bounds use Unicode code points. Reason validation
follows PostgreSQL ASCII-space `btrim` semantics but forwards the original string unchanged.
Expected revision is a safe integer in 0–2147483647, fingerprint is exactly 64 lowercase hexadecimal
characters, pricing acknowledgement is an explicit boolean and packedConfirmed must be true.

Integrity responses require the exact four SQL keys, known unique reasons and consistent
accepted/reason flags. Manual/read responses reuse the existing safe summary parser. A targeted
read's full 18-key set is checked before projecting its eleven summary fields; extras cannot be
stripped into a valid answer. Read metadata validates order/shipment identity, environment/source,
SQL timestamps, nullable fingerprints and the safe merchant reference with its SQL 64-character
limit. No payload, key, ciphertext, nonce, attempt token or raw response is exposed.

The shared reference helper accepts SQL's generated `CM-<uuid>` references. This was verified in
source and by the actual SQL-to-store bridge; it needs no owner decision or weaker arbitrary-text
fallback.

## Failure semantics

Resolved SDK SQL-error envelopes map fixed codes only: 22023 invalid_request; 42501 forbidden;
40001/23505/40P01 conflict; P0002 not_found; PGRST202 upgrade_required. Exact allowlisted 55000
tokens map not_eligible or needs_reconciliation; unknown tokens remain unavailable. Upstream
message/details/hint/cause are never forwarded.

A rejected RPC promise is unavailable even if the rejection object resembles a SQL error. It cannot
prove non-commit or a definitive refusal. In particular a lost manual-review response must not
authorize an automatic write/booking retry; explicitly reload the canonical state. An unusable SDK
envelope is invalid_response. The future HTTP layer must preserve these distinctions and prevent
late asynchronous dispatch after an abandoned request.

## Evidence and limits

The manager ran frozen typechecked Deno tests, targeted lint/format checks and the real
SDK/service-role SQL bridge. Fifty-two focused cases and 35 actual bridge operations passed. The
bridge proves real preview/manual/read mapping, identical adoption, stale fingerprint and
forged-SQL-actor refusal, a committed review with response loss/no replay, safe reload and unknown
read, alongside existing one-marker/attempt execution cases. Provider POST is synthetic. It is not
endpoint/JWT authentication, native booking, deployed feature or full assembled-release acceptance.

Canonical authenticated manual/worker composition, whole-item/request budgets, scheduler,
tracking/reconciliation UI, shared-payment application wiring, final Astra review and approved
deployment/operating rollback remain open. Ministry shopping hold and separate production
migration/merge/activation/native operation gates remain unchanged.
