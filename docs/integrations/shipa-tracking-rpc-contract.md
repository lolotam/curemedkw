# Shipa accepted-booking tracking

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Tracking context requires an accepted created booking. Internal context contains attempt and credential bindings and must not reach the browser. Recording validates a normalized observation against the current attempt, update timestamp and credential fingerprint. These functions do not perform HTTP or update the ecommerce order status.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
shipa_read_tracking_context(_shipment_id uuid,_actor_id uuid) -> jsonb
shipa_read_tracking_snapshot(_shipment_id uuid,_actor_id uuid) -> jsonb
shipa_record_tracking_observation(_shipment_id uuid,_attempt_token uuid, _expected_updated_at timestamptz,_credential_fingerprint text,_observation jsonb,_actor_id uuid) -> jsonb
```

## Source

- [supabase/migrations/20261103002500_shipa_tracking.sql](../../supabase/migrations/20261103002500_shipa_tracking.sql)
