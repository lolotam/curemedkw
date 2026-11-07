# WhatsApp expansion and repair

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Expansion uses immutable payment facts and recorded configuration. Identical durable recipient/content jobs coalesce; legacy ownership retains its audience identity. Repair targets the existing event/outcome rather than creating a new owner. Approved correction requires current settings and never-attempted work. Listing due expansions is read-only and grants no send authority.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
wa_repair_event(p_event_id uuid,p_actor_kind text,p_actor_id uuid) -> jsonb
wa_repair_legacy_outcome(p_outcome_id uuid,p_actor_kind text,p_actor_id uuid) -> jsonb
wa_correct_event_expansion(p_event_id uuid,p_expected_input_revision integer, p_approved_settings_revision bigint,p_reason text,p_actor_id uuid) -> jsonb
wa_list_due_expansions(p_limit integer DEFAULT 25) -> jsonb
```

## Source

- [supabase/migrations/20261103002000_whatsapp_expansion.sql](../../supabase/migrations/20261103002000_whatsapp_expansion.sql)
