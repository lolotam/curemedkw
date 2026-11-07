# Shared payment outcome owner

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Shipa and WhatsApp share the first-success payment owner. Signed status recording and strict provider verification are distinct stages; pending verification is durable and lease-fenced. The Edge adapter binds invoice and external identity to the canonical attempt and validates KWD amounts in integer millis before applying verified evidence. Browser payment flags are not evidence.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
integration_activate_payment_retention(p_actor_id uuid) -> jsonb
wa_record_provider_payment_outcome(p_order_id uuid,p_attempt_id uuid, p_provider_status jsonb,p_source text) -> jsonb
wa_read_payment_owner(p_order_id uuid,p_outcome_id uuid DEFAULT NULL) -> jsonb
wa_list_pending_payment_verifications(p_order_id uuid,p_limit integer DEFAULT 50) -> jsonb
wa_claim_pending_payment_verification(p_order_id uuid,p_worker_id uuid) -> jsonb
wa_apply_verified_payment(p_order_id uuid,p_attempt_id uuid,p_verified_result jsonb,p_source text) -> jsonb
wa_resolve_pending_payment_verification(p_pending_id uuid,p_lease_token uuid, p_verified_result jsonb,p_terminal_state text) -> jsonb
```

## Source

- [supabase/migrations/20261103001300_integration_payment_owner.sql](../../supabase/migrations/20261103001300_integration_payment_owner.sql)
- [supabase/migrations/20261103001400_integration_payment_verification.sql](../../supabase/migrations/20261103001400_integration_payment_verification.sql)
- [Edge adapter](../../supabase/functions/_shared/integration-payment.ts)
