# Shipa review store

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

The review store validates requests and responses over one RPC per operation: preview calls shipa_check_integrity; requestManual calls shipa_request_manual; readShipment calls shipa_read_shipment. It performs no provider request or automatic retry. The actor descriptor must already be authenticated. Integrity acceptance is diagnostic; a manual intent is not a booking; shipment read can expire the targeted lease.

## Source

- [supabase/functions/_shared/shipa-review-store.ts](../../supabase/functions/_shared/shipa-review-store.ts)
- [supabase/functions/_shared/shipa-review-validation.ts](../../supabase/functions/_shared/shipa-review-validation.ts)
- [supabase/functions/_shared/shipa-review-responses.ts](../../supabase/functions/_shared/shipa-review-responses.ts)
