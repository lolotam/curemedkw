# Shipa preparation and durable begin

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Preparation is mutating and can move unattempted work to needs_review. A ready preparation alone cannot authorize HTTP. Begin rechecks eligibility and the exact prepared settings/input/credential/payload bindings, then installs the permanent submission marker. Only an acknowledged ready begin permits one create request after commit. A lost acknowledgement does not authorize another creation.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
shipa_prepare_submission(_shipment_id uuid) -> jsonb
shipa_begin_submission(_shipment_id uuid,_attempt_token uuid,_prepared jsonb) -> jsonb
```

## Source

- [supabase/migrations/20261103001600_shipa_submission.sql](../../supabase/migrations/20261103001600_shipa_submission.sql)
