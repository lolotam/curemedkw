# Shipa readiness and scheduler receipts

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Provider observations bind to the settings revision and exact credential fingerprint. The server supplies normalized health and Kuwait-directory observations; SQL performs no HTTP. Diagnostics do not establish merchant entitlement. Scheduler receipts and provider observations are separate readiness inputs. Credential replacement/removal is blocked for unresolved possible dispatch in that environment.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
shipa_record_scheduler_ok(_run_id uuid,_environment text,_credential_fingerprint text) -> jsonb
shipa_record_provider_observation(_expected_revision integer,_environment text, _observation jsonb,_actor_id uuid) -> jsonb
shipa_read_readiness(_actor_id uuid) -> jsonb
```

## Source

- [supabase/migrations/20261103001700_shipa_credential_readiness.sql](../../supabase/migrations/20261103001700_shipa_credential_readiness.sql)
