# Shipa authenticated manual booking runtime

This source checkpoint connects the existing review/intent SQL, canonical binding, credential loader and one-attempt dispatcher to the actual `shipa-admin` handler. It is not an application deployment, provider booking, automatic worker, tracking/reconciliation runtime, or complete Shipa acceptance. Ministry hold, shared trusted payment ownership and concrete release/live-operation gates remain unchanged.

## Administrator actions

The existing five configuration actions remain. Three additional POST shapes are accepted:

| Action | Exact body |
| --- | --- |
| `shipment.preview` | `{action:'shipment.preview',orderId,request:{environment,overrides?}}` |
| `shipment.read` | `{action:'shipment.read',shipmentId}` |
| `shipment.create` | `{action:'shipment.create',orderId,request:<strict manual review request>}` |

The manual request reuses the existing review parser: `environment`, optional `overrides`, `expectedSettingsRevision`, `expectedInputFingerprint`, `reviewReason`, `acknowledgePricing`, and `packedConfirmed`. Unknown top-level/nested fields are refused. Browser actor, paid status, credential, endpoint, integration identity or execution budget is never authority. Existing method/preflight/body-size/CORS behavior is retained. Each POST verifies `auth.getUser` and a real `user_roles(admin)` row before action work. Headers/query actor claims cannot replace the verified actor, and SQL independently checks that actor.

Preview is diagnostic, not dispatch permission. Targeted `shipment.read` calls `shipa_read_shipment`, which is **mutating** because it can expire an elapsed submission lease to unknown. It is not a read-only operational probe and never grants retry authority. Both operations need no encryption key or provider call.

Create performs exactly one `shipa_request_manual`, one `shipa_resolve_dispatch_binding`, lazy keyring load, then the actual dispatcher. The canonical lookup must return exactly four snake-case fields: `shipment_id`, `order_id`, `integration_id`, `environment`. Its shipment, reviewed order and environment must match, and the integration must be a UUID. No key or provider work occurs on missing/malformed/mismatched binding. The real loaded credential revision/fingerprint, frozen payload, token and received-lease checks remain mandatory; begin-submission stays the sole creation authority. There is no default integration, browser-selected dispatch binding, second review, provider lookup, retry or fallback provider.

## Budget and cancellation

One server-owned monotonic budget of at most 15000 ms starts before the manual review operation and is shared through canonical lookup, key loading, credential read/decrypt, preparation, durable begin, provider request and completion. Standalone dispatcher invocations receive a fresh budget per invocation. Each lazy operation checks the budget before it starts; each await is bounded by remaining time. An answer arriving after the deadline is refused even if the event loop has not run its overdue timer callback. A backward clock cannot restore consumed time. Request cancellation is passed into a **per-request** manual service; an already-aborted request cannot start review, and cancellation during an uncertain review prevents any late canonical/key/provider continuation.

The provider request/body deadline is `min(10000, remaining positive milliseconds)`. The existing SQL 45000 ms lease and independent wall-clock received-lease check remain; they are not replaced by the monotonic budget. The optional server-owned parent cap is bounded to 50000 ms for later scheduler composition. This checkpoint does not implement that scheduler or claim a 50000 ms authenticated HTTP envelope. Item timing begins after the existing authentication/body-validation path.

Fencing does not cancel backend SQL or prove rollback. An abandoned review/begin/completion may still commit. A provider request already in flight may complete after the caller disconnects. No continuation is allowed to create a later booking, replay completion or infer an outcome. Targeted reload and the permanent marker/unknown/reconciliation contracts handle that uncertainty.

## Results and errors

Create success uses `{success:true,data:{shipment,dispatch}}`. `shipment` is the safe **review-stage** summary; `dispatch` reports the later execution result and, when available, its authoritative persisted `summary`. A UI must not display the review-stage queued state as the final state when dispatch supplies a later summary. A `not_started` dispatch (including `credential_missing`) can return HTTP 200 because the manual intent was recorded: it explicitly does **not** mean a shipment was booked. Do not hide or retry that result. Read the canonical shipment to refresh state.

Dispatch budget expiry before begin is `not_started/budget_exhausted`; begin uncertainty is `uncertain/begin_uncertain`. Expiry after begin is uncertain with no new provider/completion call. Lost/late completion is `persistence_uncertain`, never a resend. A lost manual review answer returns HTTP 503 `operation_uncertain` and requires reload. SQL unknown/created/possible-dispatch refusal cannot acquire another creation authority.

Shipment HTTP failures use fixed messages: `invalid_request` 400, `forbidden` 403, `not_found` 404, `conflict`/`not_eligible`/`needs_reconciliation` 409, `invalid_response` 502, and `upgrade_required`/`unavailable`/`operation_uncertain` 503. Existing configuration failure vocabulary remains separate. No draft, raw provider/SQL error, credential/ciphertext/nonce, payload hash or attempt token is returned.

## Validation provenance

Manager-run frozen Deno 2.5.6 tests cover 388 Shipa cases, including both explicitly registered admin test files; check/lint/format passed. New failed-before-fix regressions demonstrated that request cancellation was not wired, backward time could restore a budget, and a late answer could beat its timer. The corrected code also has a partial-time test: 8000 ms spent in review plus 8000 ms in credential loading cannot reset the core's budget or reach begin/provider.

`submission_service_proof.py` runs the actual handler, SDK, auth-role helper, stores, native crypto and actual `service_role` SQL against the guarded disposable database. Its remote auth response and provider POST are synthetic. Actual SQL role lookup is used; an observer-only fixture-owner query proves a durable submission marker exists before each synthetic provider POST. The manual HTTP path books once, reloads created state and refuses replay with no second POST. Invalid session and forged body actor produce no dispatch RPC. Retained response-loss/unknown/one-marker cases still pass. The proof made 54 bridge operations and restored/reapplied all 19 migrations in its finally path; a final probe found release unmigrated, both integrations disabled, retention false and no shipment/marker/tracking/reconciliation/message-attempt rows.

These are manager receipts, not independent SA reruns, deployed router/PostgREST/CORS/browser proof, native Shipa entitlement/idempotency proof, or production concurrency/activation acceptance. Full worker, tracking/reconciliation services, order UI, shared payment wiring, assembled review and gated release remain unfinished.
