# Shipa Delivery V2 contract capture

Captured 2026-11-03 from Waleed's supplied `v2-sandbox.yaml`, OpenAPI3.0.0, API version2. Source SHA256: `d6f9f54ec47d209faf9c4783f35d5bc9f9c7564678b91ea304c35ea680fc7162`. This is an implementation dependency, not completion of shipping or production certification.

## Environments and authentication

- Sandbox origin/base: `https://sandbox-api.shipadelivery.com/v2`.
- Live origin/base: `https://api.shipadelivery.com/v2`.
- Every operation declares required query parameter `apikey`. The reference does not declare OAuth, a request-signing secret, Basic auth or a secret header. Do not invent an app-secret requirement. The separately supplied app secret is stored privately but is unused by this captured Delivery V2 contract.
- Origins and paths are server-owned. Refuse redirects. Because this provider explicitly requires query authentication, construct the request only in server memory over TLS; never log/return its URL, fetch error, raw body or request object. No key in browser settings, telemetry, job payloads or command arguments.
- Select environment explicitly, with separate credentials and identities. Sandbox success does not authorize live dispatch.

## Read-only sandbox proof

Using credentials directly from protected server configuration through SSH, without returning values:

| Operation | Observed result |
| --- | --- |
| GET `/health`, without key | HTTP401, JSON `status=ERROR` |
| GET `/health`, with supplied sandbox key | HTTP200, JSON `status=OK` |
| GET `/countries/KWT`, with sandbox key | HTTP200, country response containing118cities |

No mutation, booking, webhook registration or live-host call was performed. Requests refused redirects, used12-second deadlines and bounded response reads. No raw provider errors or authenticated URLs were emitted. This proves sandbox-key acceptance and country-list access; it does not prove specific account service entitlements or merchant pickup configuration.

## Operations needed by this integration

| Method/path | Captured meaning |
| --- | --- |
| POST `/orders` | Create one order; JSON `Order`; success200 with `CreateOrdersResponse`. |
| GET `/orders/{orderId}` | Retrieve details by Shipa reference or customer reference; description says first matching customer reference. |
| GET `/orders/{orderId}/story` | Retrieve order history. |
| GET `/orders/story?ref=...` | History for up to50comma-separated Shipa/customer references. |
| GET `/orders/{orderId}/tracking` | Courier geolocation/ETA during active pickup/delivery; may return null outside that period. |
| GET `/countries` | Supported countries. |
| GET `/countries/{iso3Code}` | Country/city data. Kuwait uses `KWT`. |
| GET `/health` | Upstream service status, `OK` or `ERROR`. |

Other operations exist in the supplied reference. Their existence does not expand the approved Kuwait domestic scope. No document-generation or cross-border flow is required.

## Booking fields

`Order` requires `customerRef`, `type`, `origin`, `destination`, `packages`. Use domestic `type=Delivery`; keep origin and destination country `KWT`. `category` lists `On Demand`, `Same Day`, `Next Day`, `Cross Border`; schema default is `Next Day`. This is a vocabulary/default, not evidence that a merchant is entitled to each service. Exclude Cross Border.

Both origin and destination require `contactName`, international `contactNo`, `city`, `country`. `contactName` maximum150characters, address maximum1000characters. City must come from the country directory. Optional coordinates use latitude/longitude; the schema's latitude description incorrectly permits180degrees, so local validation must retain the geographic90degree limit. Optional destination `addressCode` supports `paci` for Kuwait or `w3w`. Optional destination type defaults to `Doorstep`; no collection-point flow is needed initially.

Each package requires `name` and `customerRef`. Dimensions are centimetres; weight is kilograms. Package description maximum1000characters. `options.amountToCollect` is the courier collection amount; paid-order integration must never collect the already-paid order total. Confirm the merchant's prepaid convention with Shipa before activation. `autoConfirm` controls whether receiver location-confirmation SMS is bypassed if account SMS is enabled; do not silently select it without account configuration.

Creation response declares `shipaRef` and `orderStatus`; these properties are not marked required. A2xx response alone must not mean accepted: require a valid nonempty provider reference. Generic errors are documented as4XX/5XX, without proof of whether rejection happened before order creation.

## Duplicate protection and unresolved outcomes

The reference describes `customerRef` as "may be guaranteed to be unique" and lookup as returning the first matching reference. This does not establish enforced uniqueness, request replay semantics, lookup consistency or a reliable negative result. No idempotency key/header, scope or retention is specified.

Use a stable merchant reference and local unique shipment intent. On a transmission timeout,5xx, malformed success or missing provider reference, record an uncertain outcome and reconcile without repeating creation. A successful matching lookup can resolve an existing order only after reference and shipment facts are checked. A404/empty lookup must not authorize rebooking without an independently confirmed consistency/idempotency contract. Never claim exactly-once remote creation based only on local uniqueness.

## Remaining account inputs and vendor evidence

Implementation and fake-boundary tests can proceed while these remain visible activation prerequisites:

1. CureMed warehouse contact, phone, address, directory city and any merchant account pickup setup.
2. Enabled Kuwait categories, prepaid billing convention, pickup scheduling/confirmation and package defaults.
3. Duplicate-reference enforcement; lookup consistency and404meaning after an ambiguous creation; status vocabulary and terminal outcomes.
4. Rate limits, safe rejection/retry semantics and sandbox booking-data requirements.

The supplied Fulfillment reference is a separate product and does not supply missing Delivery entitlements. Its portal approval was pending; it is not needed for this delivery-only release. Live credentials/access and separate production migration/deployment approval remain later gates. Ministry shopping hold remains active.
