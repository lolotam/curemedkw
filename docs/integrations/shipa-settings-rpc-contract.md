# Shipa settings RPCs

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

`enabled`, `environment` and `dispatchMode` are global integration fields. The sandbox/live configuration objects and credentials are separate per environment; there is no independent dispatch mode for each environment. Saves use optimistic revision checks. Read settings returns safe metadata; credential reads return an internal encrypted envelope and its binding metadata. The later readiness migration replaces save behavior and protects credentials used by unresolved submissions; use the final definition, not the initial migration in isolation.

The activation migration supersedes the storage save implementation. Every save requesting `enabled: true` requires unchanged saved configuration, its credential, a current successful probe and a matched origin city. Automatic mode also requires a matching scheduler heartbeat within three minutes. Live activation requires the explicit liveActivationConfirmed flag. Disabling does not require a healthy probe.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
shipa_read_settings(_actor_id uuid) -> jsonb
shipa_read_credential(_integration_id uuid,_environment text) -> jsonb
shipa_save_settings(_expected_revision integer,_settings jsonb,_credential_change jsonb,_actor_id uuid) -> jsonb
```

`shipa_read_credential` returns SQL `NULL` when that environment has no credential; callers must handle this before consuming an encrypted envelope.

While requesting `enabled: true`, changing either environment configuration or a credential fails with `shipa_save_before_activation`. Disable first, save the changes, diagnose again and then re-enable with current readiness.

## Source

- [supabase/migrations/20261103001000_shipa_settings.sql](../../supabase/migrations/20261103001000_shipa_settings.sql)
- [supabase/migrations/20261103001600_shipa_submission.sql](../../supabase/migrations/20261103001600_shipa_submission.sql)
- [supabase/migrations/20261103001700_shipa_credential_readiness.sql](../../supabase/migrations/20261103001700_shipa_credential_readiness.sql)

- [Activation storage and gates](../../supabase/migrations/20261105000100_shipa_activation.sql)
