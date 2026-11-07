# WhatsApp SQL rendering and preview

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Preview accepts a validated audience/language/body draft and either fixed sample identity or an order identity. Order facts come from the recorded payment outcome. Rendering is one pass; token-looking customer text is not expanded again. Money uses three KWD decimals and limits count Unicode code points. Preview creates no delivery jobs.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
wa_preview_template(p_validated_draft jsonb,p_sample_or_order_identity jsonb,p_actor_id uuid) -> jsonb
```

## Source

- [supabase/migrations/20261103001900_whatsapp_rendering.sql](../../supabase/migrations/20261103001900_whatsapp_rendering.sql)
