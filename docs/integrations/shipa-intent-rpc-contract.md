# Shipa receipt-owned intents

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Automatic enqueue uses the immutable payment outcome. Manual requests require administrator review and current settings/input bindings. Both create or adopt local intents under eligibility checks; neither performs provider HTTP or proves a booking. Possible-dispatch evidence prevents re-creation.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
shipa_enqueue_automatic(_outcome_id uuid) -> jsonb
shipa_request_manual(_order_id uuid,_request jsonb,_actor_id uuid) -> jsonb
```

## Source

- [supabase/migrations/20261103001500_shipa_intents.sql](../../supabase/migrations/20261103001500_shipa_intents.sql)
