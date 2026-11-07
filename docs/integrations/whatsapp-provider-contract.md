# WhatsApp provider boundaries

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

The pairing client uses a fixed CureMed instance and internal origin, with a scoped server credential. Pairing and inbox operations are separate interfaces; the inbox adapter owns message transport. The legacy Postora sender uses an HTTPS host allowlist, x-api-key and the ecommerce endpoint. Do not infer Evolution inbox support from that legacy text-sender interface. This repository cannot certify a remote gateway image, installed provider build or successful device pairing.

## Source

- [supabase/functions/_shared/evolution-pairing.ts](../../supabase/functions/_shared/evolution-pairing.ts)
- [supabase/functions/_shared/evolution-inbox.ts](../../supabase/functions/_shared/evolution-inbox.ts)
- [supabase/functions/send-whatsapp/index.ts](../../supabase/functions/send-whatsapp/index.ts)
