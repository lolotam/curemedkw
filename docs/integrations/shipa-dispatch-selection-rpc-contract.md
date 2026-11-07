# Shipa canonical binding and selection

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Binding resolves shipment, order, integration and environment from canonical records. Candidate selection is read-only, bounded to 1 through 3, and filters eligible queued work before applying the limit. It grants no lease or booking authority. Concurrent callers still require the durable begin fence.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
shipa_resolve_dispatch_binding(_shipment_id uuid) -> jsonb
shipa_select_dispatch_candidates(_limit integer DEFAULT 3,_shipment_id uuid DEFAULT NULL) -> jsonb
```

## Source

- [supabase/migrations/20261103002400_shipa_dispatch_selection.sql](../../supabase/migrations/20261103002400_shipa_dispatch_selection.sql)
