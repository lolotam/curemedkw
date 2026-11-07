# Shipa manual booking runtime

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Manual create performs review, canonical binding lookup, lazy keyring loading and one dispatch in that order. It rejects a binding inconsistent with the reviewed order/environment. Only the dispatcher durable begin grants a single provider creation. Lost review acknowledgements do not invent a shipment receipt. Preview and read do not load a keyring. Browser cancellation after invocation does not authorize repeating the booking.

## Source

- [supabase/functions/_shared/shipa-manual-service.ts](../../supabase/functions/_shared/shipa-manual-service.ts)
- [supabase/functions/_shared/shipa-shipment-actions.ts](../../supabase/functions/_shared/shipa-shipment-actions.ts)
