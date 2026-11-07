# WhatsApp contract boundaries

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Ordinary settings saves and provider activation are separate operations. Settings revisions, encrypted credential binding and actual provider account identity serve different purposes. SQL preview/rendering and durable expansion own recorded message content; delivery claim/finish own durable attempt authority. The dedicated order-message and inbox interfaces also exist on main and must not be confused with the older paid-expansion RPCs.

## Source

- [supabase/migrations/20261103000200_whatsapp_transactions.sql](../../supabase/migrations/20261103000200_whatsapp_transactions.sql)
- [supabase/migrations/20261103001900_whatsapp_rendering.sql](../../supabase/migrations/20261103001900_whatsapp_rendering.sql)
- [supabase/functions/order-whatsapp-dispatch/handler.ts](../../supabase/functions/order-whatsapp-dispatch/handler.ts)
- [supabase/functions/whatsapp-inbox/handler.ts](../../supabase/functions/whatsapp-inbox/handler.ts)
