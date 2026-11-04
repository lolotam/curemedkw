# Shipa administration configuration UI

The protected `/admin/integrations` route supplies configuration for Shipa. It uses the existing
admin layout and English component vocabulary. This checkpoint supplies no shipment booking,
tracking, payment handler, scheduler, provider activation or deployment.

## Endpoint and authority

The browser calls only `shipa-admin`, through the existing session-owned Supabase runtime client.
Supported actions are `settings.read`, `settings.save`, `credential.save`, `readiness.read` and
`readiness.diagnose`. It makes no table/RPC/provider calls and supplies no actor, service key,
endpoint override or readiness proof. The authenticated endpoint and SQL remain authoritative.

Responses must match exact camelCase DTOs. Business settings use the existing shared validators.
Writes must return the next settings revision exactly once; malformed responses and unknown errors
become fixed local error codes. Server messages, rejected input and upstream response bodies are
never displayed. No request is automatically retried.

## Editing and secrets

Sandbox and live have independent drafts. The active environment and the environment being edited
are distinguished. The explicit CureMed preset uses the owner-approved office address, phone and
Next Day preference, with pickup between 09:00 and 16:00 and a call before collection to confirm
packing. It invents no weight, dimensions, PACI number, coordinates, weekdays or merchant
entitlement.

A replacement key exists only in transient component state and one call argument. The application
never persists it to browser storage, reveals a stored key or includes it in ordinary settings
payloads. A blank replacement preserves the current key; removal is explicit and environment-scoped.
Success, rejection, local-validation failure, environment switches, cancellation and explicit reload
clear typed keys. Live confirmation retains only environment/mode metadata and reconstructs the
request at confirmation; it stores no second key copy. Main Save changes includes a pending key
rather than silently discarding it.

Conflicts retain nonsecret edits and require an explicit reload; they never replay a write. Reload
requires confirmation when edits would be lost and reports failure honestly. Unavailable settings
are displayed as unavailable, without invented disabled/sandbox/manual values.

## Automatic enablement

A newly enabled automatic configuration requires complete saved configuration, a stored credential,
no pending key replacement, the selected saved environment and matching settings revision, all
positive server readiness facts, and a current scheduler heartbeat. Edited profiles must first be
saved while disabled and diagnosed. The check runs again at click/confirmation time. Observations
are not service entitlement: entitlement remains `UNCONFIRMED`.

Disabling or saving a disabled configuration remains possible when readiness fails. An established
automatic configuration with a stale scheduler shows a warning without silently changing modes. A
browser clock updates heartbeat age; it does not poll the network. The server must independently
enforce configuration, runtime readiness, dispatch ownership and the Ministry hold.

## Concurrency and limits

Sequenced readiness responses cannot overwrite later observations, including stale error/finally
branches. A synchronous operation guard prevents concurrent writes in this page only; it is not a
database lock or cross-tab duplicate-prevention guarantee. SQL revisions and durable dispatch remain
separate authorities.

The manager validated TypeScript, targeted ESLint, 61 focused Vitest cases and the production build.
SDK responses/timing and the test clock are synthetic; shared validation, transport, DTO mapping,
hooks and components execute normally. No real browser, production JWT admission, deployment or
native provider journey is proved by those checks. See the task report for evidence provenance and
remaining gates.
