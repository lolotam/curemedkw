# Shipa administration endpoint

`supabase/functions/shipa-admin/index.ts` composes the existing service client with `createShipaRuntimeClient`, then registers `createShipaAdminHandler`. It introduces source for an endpoint; production router admission, function deployment and frontend wiring remain separate unfinished work.

Every POST verifies the bearer with `auth.getUser`, then queries `user_roles` for that verified user and `role=admin`. Only this user ID reaches service RPCs. A body actor, proof, endpoint or unknown field is refused by strict shared parsers. Identity-like headers and query parameters are ignored for authority; they do not override the verified user. SQL wrappers independently recheck the real administrator role. Method rejection precedes authentication; OPTIONS returns the existing CORS preflight without auth, RPC or master-key work. CORS policy itself is unchanged.

The configuration request is exactly one of:

| Action | Body |
| --- | --- |
| `settings.read` | `{ "action": "settings.read" }` |
| `settings.save` | `{ "action": "settings.save", "request": <shared settings save> }` |
| `credential.save` | `{ "action": "credential.save", "request": <shared credential save> }` |
| `readiness.read` | `{ "action": "readiness.read" }` |
| `readiness.diagnose` | `{ "action": "readiness.diagnose", "request": { "expectedRevision": 4, "environment": "sandbox" } }` |

Nested save schemas are the existing shared parsers, not endpoint copies. Both declared and streamed body size are bounded to 65536 bytes. An overflowing reader is cancelled; malformed JSON returns `invalid_json`. Success is `{ "success": true, "data": <safe service projection> }`. Failure uses the existing `{ "success": false, "error": { "code", "message" } }` envelope with fixed messages.

The lazy runtime reads `INTEGRATIONS_ENCRYPTION_KEY_V1` only after authentication and valid input for `credential.save`, `readiness.diagnose`, or the later `shipment.create` path. Server-owned version is 1. Settings read/save and readiness read work without a master key. Credential preserve/remove currently also require this key because the credential service validates its keyring on construction. Imported keys are nonextractable; encoded material is not cached or returned. No fallback key/version/environment is attempted. Rotation remains the versioned operator procedure; changing the V1 value is not an automatic credential migration.

HTTP failures are `unauthenticated` 401; `forbidden` 403; invalid JSON/request 400; oversized body 413; method 405 with `Allow: POST, OPTIONS`; `conflict`, `credential_in_use`, `credential_missing` 409; `invalid_response` 502; runtime/deployment/configuration/key/decryption/unavailability 503; unexpected service failure 500 `unhandled_error`. Upstream message, stack, cause and rejected input are never response text.

Diagnosis loads the requested environment's stored key and makes only sequential health/KWT-directory GETs through the fixed-origin adapter. Its server-built normalized observation does not establish service entitlement, scheduler freshness, activation or shipment authority. The five configuration actions expose no booking, cancellation, tracking, payment, label, worker or scheduler action.

The same authenticated endpoint now separately accepts `shipment.preview`, `shipment.read` and `shipment.create`, with the exact shapes, fixed error vocabulary, cancellation fences and result semantics in [the manual runtime contract](shipa-manual-runtime-contract.md). Targeted read is mutating via lease expiry. Create needs server-canonical binding and a durable begin; neither diagnostic acceptance nor administrator identity alone authorizes a provider request. No worker/scheduler or provider tracking/reconciliation route is added by this extension.

## Verification boundary

Focused handler/runtime tests execute real auth helpers, parsers, services and crypto with SDK/fetch seams. A real SDK adapter regression checks actual SDK request paths, auth header, role filters and RPC serialization. `configuration_service_proof.py --handler` additionally runs the real handler and SDK against actual role-gated SQL via a guarded local bridge; the role SELECT is also actual `service_role` SQL. Remote session verification and provider transport responses remain synthetic. This does not prove deployed PostgREST/router/CORS transport or native Shipa behavior.

Run the explicit handler/runtime tests with frozen `deno.shipa.json`; its test include registers both the configuration and shipment handler test paths. Final assembled release tests, Astra/medium review, routing, UI, activation, worker and separate approved schema/application delivery remain required. Ministry hold and live-operation gates remain unchanged.
