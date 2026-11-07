# WhatsApp credentials and readiness

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Credential storage accepts an encrypted tuple, not plaintext. Readiness is bound to the exact credential, provider account and applicable connection generation. SQL validates storage shape but does not decrypt or prove that provider HTTP occurred. Internal ciphertext readers are distinct from browser-safe settings reads.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
wa_read_credentials(p_provider text, p_account_identity text) -> jsonb
wa_store_credential(p_expected_revision bigint, p_encrypted_credential jsonb, p_actor_id uuid) -> jsonb
wa_record_provider_readiness(p_expected_revision bigint, p_provider text, p_credential_binding text, p_account_identity text, p_session_generation bigint, p_baseline_fallback_verified boolean, p_expected_legacy_fingerprint text, p_actor_id uuid) -> jsonb
wa_read_provider_readiness(p_provider text, p_credential_binding text) -> jsonb
```

Before calling `wa_record_provider_readiness`, trusted server code must perform the provider diagnostic and derive the actual account identity, applicable connection generation and baseline fallback status from trusted observations. Request-body assertions are not diagnostics. SQL checks binding, freshness and local connection consistency but does not contact the provider or independently verify fallback delivery. A false fallback attestation can permit configured migration to clear the legacy plaintext key without a working fallback.

## Source

- [supabase/migrations/20261103000200_whatsapp_transactions.sql](../../supabase/migrations/20261103000200_whatsapp_transactions.sql)
