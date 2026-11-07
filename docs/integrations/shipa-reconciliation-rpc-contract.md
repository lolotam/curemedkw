# Shipa positive-only reconciliation

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Reconciliation context is mutating through targeted lease expiry. It requires unknown work with its permanent submission marker and the original credential binding. Applying detail requires positive corroboration against the original shipment facts. A lookup miss or error never permits rebooking; reconciliation makes no provider create request.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
shipa_read_reconciliation_context(_shipment_id uuid,_actor_id uuid) -> jsonb
shipa_apply_reconciled_detail(_shipment_id uuid,_attempt_token uuid, _expected_updated_at timestamptz,_credential_fingerprint text,_detail jsonb,_actor_id uuid) -> jsonb
```

## Source

- [supabase/migrations/20261103002600_shipa_reconciliation.sql](../../supabase/migrations/20261103002600_shipa_reconciliation.sql)
