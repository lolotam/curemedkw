# Shipa dispatch results and expiry

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Completion is fenced by the current attempt token. Accepted creation records a provider reference; uncertain results remain unknown without automatic rebooking. Local validation after possible dispatch does not establish non-creation. Targeted shipment read is mutating: it expires a stale lease before returning a safe summary. Created records mean accepted booking, not delivery.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
shipa_complete(_shipment_id uuid,_attempt_token uuid,_result jsonb) -> jsonb
shipa_expire_leases(_shipment_id uuid DEFAULT NULL) -> jsonb
shipa_read_shipment(_shipment_id uuid,_actor_id uuid) -> jsonb
```

An accepted provider response becomes `created` only when its reference can be assigned. If another shipment already owns that provider reference, completion keeps this shipment `unknown` with `remote_reference_conflict`; it does not authorize another provider create.

## Source

- [supabase/migrations/20261103001100_shipa_dispatch_state.sql](../../supabase/migrations/20261103001100_shipa_dispatch_state.sql)
