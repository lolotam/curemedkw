# WhatsApp settings and legacy migration

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Settings use expected revision checks. Ordinary saves do not switch providers. Legacy migration has configured, disabled and unconfigured modes; it preserves compatibility while clearing the migrated plaintext key atomically. The legacy migration source contains credential material and must never become a browser DTO or log. Provider activation is a separate readiness-gated operation.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
wa_read_settings(p_actor_id uuid) -> jsonb
wa_read_legacy_migration_source(p_actor_id uuid) -> jsonb
wa_save_settings(p_expected_revision bigint, p_safe_patch jsonb, p_encrypted_credential_change jsonb, p_actor_id uuid) -> jsonb
wa_migrate_postora_credential(p_expected_revision bigint, p_encrypted_credential_change jsonb, p_actor_id uuid) -> jsonb
wa_activate_provider(p_expected_revision bigint, p_provider text, p_readiness_proof text, p_actor_id uuid) -> jsonb
```

## Source

- [supabase/migrations/20261103000200_whatsapp_transactions.sql](../../supabase/migrations/20261103000200_whatsapp_transactions.sql)
