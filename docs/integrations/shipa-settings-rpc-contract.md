# Shipa settings and credential RPC subset

2026-11-03. Actual locally tested dependency for the next Edge settings/store slice. Shipment/payment/outbox/runtime activation contracts are unfinished. This file does not authorize production application or merge.

## Service boundary

All three public wrappers grant execution only to service_role. Browser roles cannot invoke them or write either table. Settings read/save independently check that the supplied actor has a real user_roles admin row; the future Edge endpoint must authenticate the request before supplying that UUID. An arbitrary browser actor field is never authoritative. Ciphertext read has no actor because an authorized worker also needs it; it remains internal service-only.

```text
shipa_read_settings(_actor_id uuid) -> safe document
shipa_read_credential(_integration_id uuid, _environment text) -> stored row | SQL null
shipa_save_settings(_expected_revision integer, _settings jsonb,
  _credential_change jsonb | SQL null, _actor_id uuid) -> safe document
```

No source endpoint, plaintext, app secret or master key is persisted by these wrappers. There is no SQL decrypt function. Shipa Delivery V2 uses its API key; the separately supplied app secret is not a documented Delivery authentication input.

## Safe read document

Exactly four top-level keys: `integration_id`, `settings`, `worker_last_ok_at`, `verification`. The integration id is the existing seeded UUID and must be read from SQL before encrypting; never accept a browser-selected binding. Worker timestamp is currently null; verification is currently exactly `{sandbox:null,live:null}`. No probe/heartbeat writer exists in this subset.

`settings` contains exactly `enabled`, `environment`, `dispatchMode`, `revision`, `sandbox`, `live`. Defaults: false, sandbox, manual_after_packing,0. Each environment contains `appId`, `serviceCode`, `autoConfirm`, `pickupInstructions`, `origin`, `parcel`, plus server-derived `credential` metadata `{present,rotatedAt,keyVersion}`. SQL timestamps are JSON timestamp strings or null. Missing ciphertext means false/null/null, not a claimed configured state.

The existing pure UI contract predates captured vendor evidence. The next slice must extend/share it with `autoConfirm` and `pickupInstructions`, and map the exact current read shape; do not strip unfamiliar fields and pretend a stale DTO is current. Keep credential metadata read-only.

Configuration is stored independently for both environments. `origin` contains `contactName`, `contactPhone`, `address`; address contains `countryCode='KW'`, `governorate`, `area`, `block`, `street`, `building`, `addressLine`. Use the Shipa directory name in area for the city mapping; CureMed's verified directory value is Hawally. Preserve street/building/floor/office in the full address snapshot. No coordinates/PACI or operating weekdays were supplied.

`serviceCode` is null or one of On Demand/Same Day/Next Day. This validates vocabulary, not merchant entitlement. `autoConfirm` is a boolean; default false preserves the provider's documented SMS behavior. `pickupInstructions` is a string up to1000characters. `parcel` contains count1, nullable positive weightKg and nullable dimensionsCm `{lengthCm,widthCm,heightCm}` with all values positive. Empty strings/null service/parcel defaults are valid disabled drafts. Phone is empty or `+965` followed by8digits. No undocumented draft defaults invent pickup/package details.

## Save and credential changes

`_settings` contains exactly five keys: `enabled`, `environment`, `dispatchMode`, `sandbox`, `live`. Strip revision and both derived credential metadata objects, then validate every remaining key before passing it to SQL. The expected revision is separate and advances exactly once for the whole atomic save. A stale writer gets40001/settings_conflict; do not retry/re-encrypt and overwrite it automatically.

Ordinary save passes SQL null for `_credential_change`, preserving keys. Credential actions are separate from ordinary settings actions:

```text
replace: {mode:'replace',environment:'sandbox'|'live',envelope:<exact encrypted tuple>}
remove:  {mode:'remove',environment:'sandbox'|'live'}
```

The tuple is exactly `{integration_id,provider:'shipa',environment,key_version,nonce,ciphertext}`, matching the tested crypto module. SQL checks integration/environment binding, positive integer key version up to999999999, canonical base64,96bit nonce and17..16400ciphertext bytes. The crypto AAD is UTF8(JSON.stringify([1,lowercaseIntegrationUUID,'shipa',environment,keyVersion])). Credential revision and settings revision are metadata and never enter AAD. SQL cannot authenticate ciphertext; the service must encrypt and verify using the real crypto primitives.

A replace increments that environment's stored credential revision and rotation timestamp. Null preserves; explicit removal affects only the selected environment. A remove/re-add may restart the row's credential revision, so later readiness/dispatch proofs must also bind the exact encrypted envelope or its fingerprint; never use credential revision alone as permanent identity. This subset invalidates both verification summaries on save. No provider readiness is invented by storage.

For an explicit credential replace/remove, read the actual safe settings/id at the expected revision, derive the current safe patch, encrypt using the selected environment binding, then invoke the same atomic save once. Blank credential input means preserve with zero write; validate expected revision against the read result rather than inventing a new revision. Successful replacement should be verified by reading/decrypting the exact stored tuple internally; never return it or plaintext to the browser.

Enabling is deliberately refused with55000/shipa_runtime_not_ready. This prevents a settings-only release from activating incomplete dispatch. Disabled users can save either mode/environment as a preference. Later approved outbox/runtime preparation must replace this gate with actual configuration, readiness, live-confirmation and scheduler checks. Never turn the failure into a fake enabled response.

## Closed failures and proofs

Map by SQLSTATE and exact known reason only:40001 conflict;42501 forbidden;22023 invalid request/envelope;55000 runtime not ready. Missing wrapper/projection or unknown transport failures must become fixed unavailable/upgrade errors. Do not echo SQL message, detail, hint, input or crypto exception/cause.

The guarded exact-image disposable database passed actual anon/non-admin/admin/service-role tests, safe metadata omission, separate environment saves/keys, plaintext and unknown-field refusal, preserve/removal, invalid envelope rejection, no early enablement and stale-save behavior. Migration applied twice with private absent and with preexisting private schema/permissive table grants. Existing schema owners/ACL/defaults/constraints/triggers/policies were unchanged. Adversarial public default function grants were proved with a sentinel, then all protected RPC browser grants were refused.

Two real writer connections forced a row-lock wait observed by the lock holder: exactly one committed, the other got settings_conflict, final revision1 retained the winner. The proof restored the shared disposable fixture to current WhatsApp and Shipa foundations afterwards. No production data, remote DB URL or provider request was used. The manager proof currently uses the guarded WhatsApp fixture module; a self-contained assembled harness remains a pre-PR requirement, not evidence already delivered here.
