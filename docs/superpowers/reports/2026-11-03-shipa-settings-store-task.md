# Shipa shared settings and RPC store validation

Implemented by the approved T3 MiniMax M3.1-Flash lane; reviewed, corrected and validated by the Codex manager. This is the settings/read-save subset, not full Shipa/WhatsApp readiness, SQL freeze or deployment approval.

## Result

Browser and Edge code now share one Zod settings contract. The frontend module reexports shared definitions and preserves all previous exports. Both environments retain independent autoConfirm/pickupInstructions, captured domestic service vocabulary and safe credential metadata. Defaults remain disabled/sandbox/manual. Complete freeform pickup addresses or supplied street/building details are accepted without an invented block/PACI/coordinate requirement. Category vocabulary does not prove merchant entitlement.

The server store performs one injected Supabase RPC per read/save, with no read-before-save or retry. Ordinary save passes SQL null for credential changes. Strict parsing precedes explicit safe mapping; malformed/secret/unknown fields and inconsistent metadata fail closed. SQLSTATE failures and transport rejection become fixed errors, without raw details. Internal actor syntax/admin recheck does not authenticate the HTTP caller; future endpoints must use verified auth.getUser plus a real role lookup and reject browser actor authority.

## Delivery audit and manager corrections

The retained T3 checkout remained at3e9d307b85f70a9b658b23a56002a5fca65decee with its preexisting material and intentional environment-file sanitation deletions. All91activity items were inspected: initial preflight read, scoped reads and exactly eight allowed file changes were observed; no shell/search/Git/network/agent call was observed. Controls were instruction-only, not an enforced filesystem sandbox. Worker ran no tests or commits.

Initial strict Deno check found widened literal types in expected fixtures; the fixtures were typed without weakening assertions. The original35tests then passed. Manager source review found that both fake and store assumed raw SQL JSON/rejected SQL errors. Real Supabase rpc returns resolved data/error envelopes. A new SDK-shaped regression failed before correction. The store and boundary fake now unwrap the real envelope, prioritize resolved SQL errors and separately handle promise rejection. Installed SDK source was inspected; the real installed SDK was also exercised against fake HTTP, not a mocked internal builder.

Further manager regressions reproduced impossible calendar timestamps/unsafe credential key versions being accepted, and the final valid PostgreSQL integer revision being rejected after a successful save. Fixed strict date/metadata parsing and separated maximum expected revision from the possible returned revision. All regressions passed afterward. One duplicated new freeform-address test was removed; its meaningful scenario remains covered.

## Observed validation

- Exact Deno2.5.6, frozen deno.shipa.lock, strict graph:128Shipa backend-area tests passed, including38settings-store tests. No network permission was granted.
- Deno lint passed the six new backend/settings test modules; focused frontend/shared ESLint passed.
- Frontend TypeScript check with tsconfig.app.json exited0. Focused Vitest settings/dispatch-policy tests:143passed across two files. No full-suite or production build claim is made; full assembled suite remains the pre-PR gate.
- Actual local role-protected shipa_read_settings/shipa_save_settings projections were captured in a transaction and rolled back. They passed the real shared parser/store through SDK-shaped responses, preserving the inactive environment and revision+1.
- Installed real Supabase SDK plus fake HTTP boundary passed real read decoding and resolved SQL conflict mapping, exactly two calls with no network. This does not establish deployed PostgREST/router/HTTP auth behavior.

The latter local manager proof scripts live in the task's temporary artifacts. The final committed self-contained assembled harness remains required before PR. Guarded SQL execution/rerun/contention receipts belong to the manager; they are not independent reviewer reruns or deployed-feature evidence.

Focused clean-code-guard/test-guard/docs-guard review applied. No unresolved finding is claimed for this subset. The new shared modules import no src/React/Deno/network runtime; Deno's bare zod alias is pinned to the installed frontend version3.25.76. No additional dependency or CI workflow was introduced.

## Remaining integration

Credential storage/removal/readiness/authenticated routes and admin UI still need completion. One trusted payment outcome owner must feed BOTH integrations; retention, reviewed enqueue, atomic begin/recomputation, provider directory/readiness, credential/configuration races, status/reconciliation/scheduler and journey tests remain mandatory. In particular, SQL integrity and the shared address-completeness rule must remain aligned for structured addresses; diagnostic integrity acceptance is never booking/payment authority.

Evolution repair is separately authorized. The Ministry hold, concrete production migration/merge gates and separate pairing/live payment/shipment/customer-message permissions remain unchanged. No real booking, payment, message, application migration, merge or deployment was performed by this slice. Rollback of this unreleased subset is a reviewed application revert with the integration disabled; do not delete retained encrypted data/history.
