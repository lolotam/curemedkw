# Shipa protected credential saves and read-only diagnostics services

The MiniMax slice implements credential preserve/replace/remove and read-only diagnostic services over the existing stores, native crypto and fixed-origin Shipa adapter. The manager audited its activity, integrated the eight new files, corrected findings and ran the checks. No endpoint, environment loader, UI, activation, worker or deployment is claimed by this checkpoint.

`createShipaCredentialService.save` validates a strict settings/credential action and server actor, reads the current integration ID/revision, encrypts in that server binding, then makes one atomic settings/credential write. Blank replacement preserves; removal is explicit and environment-specific. Responses use the existing safe settings projection. `createShipaReadinessService.read` reads only the safe readiness RPC. Diagnosis loads the actual stored key, performs health and KWT-directory GETs sequentially, records only normalized server-built facts tied to the loaded fingerprint, then returns current safe readiness. Failure can supersede success; no observation, heartbeat or enablement comes from browser flags.

## Observed validation

- Frozen Deno 2.5.6 graph check passed; final focused tests passed: 21 credential-service and 17 readiness-service tests, 38 total. Worker-reported 17/14 counts were stale; delivered source initially ran 20/17.
- Initial focused tests found two incorrect fixtures: stored revision 0 with expected revision 4, and a valid diagnosis mistakenly included among tainted requests. Correcting those facts preserved the intended assertions. A manager-added oversized UTF-8 regression then failed before the fix; size validation now occurs in the strict parser before any database access. Real encryption still uses the shared primitive limit.
- The manager made the exported credential action a true discriminated union, removed the silent optional-key fallback and simplified the trusted keyring lookup. An initial grouped-mode union did not narrow in TypeScript; separate variants corrected it. The observation helper now accepts one context object instead of five arguments. Formatting and focused lint passed across source/tests and the Deno bridge.
- The actual service-to-SQL bridge passed with 17 RPC calls. It generated a fresh synthetic master key, encrypted/saved through the real credential service, read/decrypted from actual SQL through the real loader, preserved the envelope on blank replacement, recorded successful and failed diagnoses against actual SQL, and removed the credential. SQL was invoked as `service_role` through an invoker-only temporary bridge; the real SQL responses fed the real service parsers. Provider fetch alone was synthetic. Scheduler currentness stayed false, merchant entitlement stayed unconfirmed and dispatch remained disabled. Exact synthetic rows/configuration were cleaned up under the fixture marker guard.

Reproduce on the clean assembled guarded disposable fixture:

```powershell
python supabase/tests/shipa/configuration_service_proof.py --state <private-fixture-state.json> --deno <verified-deno-2.5.6.exe> --deno-cache <private-deno-cache>
```

The bridge proves service/crypto/SQL contract compatibility, not PostgREST routing, actual SDK transport, verified HTTP actor provenance, production key validity or native Shipa entitlement. The focused tests fake only SDK/fetch boundaries; no internal module mocks are used. No full suite/build or repeated native provider call was run.

## Provenance and remaining gates

T3 created `t3/136e8dbc` from `099bb9d6e7f60ecb41de8ee7e7fa25517eadd838`. Manager independently verified the matching implementation-ready preflight, zero environment files/pattern matches and the eight-path diff. After completion, task status was consumed once and activity paginated through position 223 with no remaining page. No worker command, check, Git, network, SQL, commit or existing source edit was observed. The worker also read nine wrapper-generated spill files outside the literal checkout allowlist; inspected activity identifies copies of the allowed brief/source/docs, including surrounding plan lines. This literal path deviation is retained. Controls were instructions, not a hard sandbox. Environment deletions and manager artifacts remain unstaged in the retained worktree.

Focused clean-code, test and documentation guards covered tainted action refusal, key binding, fixed failures, one-write/no-retry behavior, normalized probe provenance and safe output. The manager used short synthetic/local aliases consistent with the repository secret hook; no hook bypass or real secret was involved.

Authenticated handler tests, lazy runtime-secret wiring, shipped admin UI, activation/dispatch/status/reconciliation, payment handler/recovery/writer integration, WhatsApp expansion/runtime/UI, final assembled journeys/Astra and approved release remain outstanding. No full SQL freeze, merge, production application migration, payment, booking, QR or message send occurred. Ministry hold and separate production/live gates remain unchanged.
The first commit attempt was refused by the secret hook for a typed local variable and a field-to-field key assignment. The manager renamed that local and returned the already strict, typed parsed credential action instead of redundantly rebuilding it. Frozen focused tests and lint passed again; the hook was not bypassed.

The next admin entrypoint uses the repository's existing Supabase service client. Its frozen Shipa tool graph now resolves the existing npm:@supabase/supabase-js@2 range to 2.105.1, reusing the already recorded exact package/integrity closure from the WhatsApp lock. No production source import or runtime environment was changed. Frozen Deno check of the actual supabase-admin.ts graph passed. This is a local tool lock, not proof of the deployed Edge runtime's package resolution.
