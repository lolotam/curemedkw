# WhatsApp settings and legacy migration

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Settings use expected revision checks. Ordinary saves do not switch providers. Legacy migration has configured, disabled and unconfigured modes; it projects compatible legacy behavior where supported while clearing the migrated plaintext key atomically. The legacy migration source contains credential material and must never become a browser DTO or log. Provider activation is a separate readiness-gated operation.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
wa_read_settings(p_actor_id uuid) -> jsonb
wa_read_legacy_migration_source(p_actor_id uuid) -> jsonb
wa_save_settings(p_expected_revision bigint, p_safe_patch jsonb, p_encrypted_credential_change jsonb, p_actor_id uuid) -> jsonb
wa_migrate_postora_credential(p_expected_revision bigint, p_encrypted_credential_change jsonb, p_actor_id uuid) -> jsonb
wa_activate_provider(p_expected_revision bigint, p_provider text, p_readiness_proof text, p_actor_id uuid) -> jsonb
```

## Save payload and credential action

`wa_save_settings` requires SQL `NULL` for `p_encrypted_credential_change`. Every non-SQL-NULL value, including JSON `null`, is rejected with `use_separate_credential_action`. Credential replacement belongs to the separate `wa_store_credential` operation.

Despite its name, `p_safe_patch` is a complete configuration, not a partial patch. Required fields are boolean `integration_enabled` and `automation_enabled`, `default_country: "KW"`, all three `audiences` entries (`buyer`, `admins`, `custom`), and both `recipients` arrays (`admins`, `custom`). Every audience requires boolean `enabled`, `language` equal to `ar` or `en`, and `templates` containing both string `ar` and `en` bodies. Enabled audiences require valid nonempty templates. Recipient strings are normalized and deduplicated, with at most 50 distinct recipients across the two arrays. Unknown keys are rejected. `expected_legacy_fingerprint` is additionally required to match the current legacy row while unmigrated and is removed from the persisted validated configuration.

A partial request such as `{ "integration_enabled": false }` fails with `invalid_settings`. Before migration, automation, custom audiences and custom recipients remain gated by `credential_migration_required`. Re-enabling after migration additionally requires the current activated provider proof; automation also requires a fresh scheduler heartbeat, and Evolution requires the observed connection.

Legacy projection is not universally compatible with every valid native template. For example, a buyer template containing `{{customer_phone}}` passes native template validation but cannot be represented by the legacy buyer sender. `private.wa_legacy_projection` then sets the mirror's `enabled` to false, so the legacy sender skips messages. Configured migration can therefore disable that mirror; it must not be described as an unconditional compatibility guarantee.

## Source

- [supabase/migrations/20261103000200_whatsapp_transactions.sql](../../supabase/migrations/20261103000200_whatsapp_transactions.sql)
