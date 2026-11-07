# Shipa administrator endpoint

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

POST accepts settings.read, settings.save, credential.save, readiness.read and readiness.diagnose, plus shipment.preview, shipment.read and shipment.create. Nested inputs use shared strict parsers. The handler verifies the bearer and administrator role before invoking services. OPTIONS is a preflight. Success uses a success/data envelope; errors use fixed codes and messages. Shipment reads can expire leases; create uses the reviewed manual flow and durable begin. This source does not prove router admission or deployment.

## Source

- [supabase/functions/shipa-admin/handler.ts](../../supabase/functions/shipa-admin/handler.ts)
- [supabase/functions/_shared/shipa-admin-actions.ts](../../supabase/functions/_shared/shipa-admin-actions.ts)
- [supabase/functions/_shared/shipa-shipment-actions.ts](../../supabase/functions/_shared/shipa-shipment-actions.ts)
