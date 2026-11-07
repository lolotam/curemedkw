# Implemented Shipa Delivery V2 subset

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

The adapter fixes sandbox and live HTTPS origins with a /v2 base and query apikey authentication. Redirects are refused. It implements health, country list/detail, order detail/story/tracking and create. Domestic payload validation uses Delivery, KWT and the supported domestic service categories. Contact-name, address and package-description limits are 150, 1000 and 1000 characters; package dimensions are centimetres and weight kilograms. A creation requires a usable provider reference to become accepted. Timeout, malformed success and missing reference remain uncertain. Neither local uniqueness nor a negative lookup proves remote non-creation. The accompanying JSON records only this implemented subset; it is not the complete vendor OpenAPI document.

## Source

- [supabase/functions/_shared/shipa-contract.ts](../../supabase/functions/_shared/shipa-contract.ts)
- [supabase/functions/_shared/shipa-client.ts](../../supabase/functions/_shared/shipa-client.ts)
