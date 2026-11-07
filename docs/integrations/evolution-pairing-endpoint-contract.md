# Evolution administrator pairing

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

The pairing handler accepts POST status/connect actions after verified administrator authorization, with a 4096-byte request cap and 15000 ms request fence. The fixed instance is curemed and the trusted origin is http://curemed-evolution:8080. Server configuration reads CUREMED_EVOLUTION_URL and CUREMED_EVOLUTION_API_KEY. The client uses the apikey header for GET /instance/connectionState/curemed or GET /instance/connect/curemed, without retry. Provider responses are capped at 512 KiB with a 10000 ms deadline. Browser output contains only safe connection state and optional QR data.

The webhook authenticates x-curemed-webhook-key, limits bodies to 1048576 bytes, accepts connection.update and messages.upsert/messages.update/messages.delete, and calls persistent ingestion. It is no longer an acknowledgement-only connection receiver. The entrypoint supplies CUREMED_EVOLUTION_WEBHOOK_SECRET. QR display and auth-change handling live in the pairing card; no instance reset/delete action is exposed by this pairing interface.

## Source

- [supabase/functions/whatsapp-pairing/index.ts](../../supabase/functions/whatsapp-pairing/index.ts)
- [supabase/functions/whatsapp-pairing/handler.ts](../../supabase/functions/whatsapp-pairing/handler.ts)
- [supabase/functions/_shared/evolution-pairing.ts](../../supabase/functions/_shared/evolution-pairing.ts)
- [supabase/functions/whatsapp-pairing-webhook/handler.ts](../../supabase/functions/whatsapp-pairing-webhook/handler.ts)
- [supabase/functions/whatsapp-pairing-webhook/index.ts](../../supabase/functions/whatsapp-pairing-webhook/index.ts)
- [src/components/admin/EvolutionPairingCard.tsx](../../src/components/admin/EvolutionPairingCard.tsx)
