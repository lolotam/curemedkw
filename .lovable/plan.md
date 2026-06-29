# MyFatoorah Hosted Payment Page (v3) — Implementation Plan

## Phase 0 — Findings (from current code)
- **Checkout entry:** `src/pages/Checkout.tsx` → `useCreateOrder()` in `src/lib/db.ts`. Order rows are inserted client-side (RLS allows "Anyone can create orders"); guest checkout supported (`user_id` nullable).
- **Order status:** Postgres enums, not text. `order_status` = new/confirmed/processing/shipped/delivered/cancelled. `payment_status` = pending/paid/failed/refunded. `payment_method` = cod/pay_by_link.
- **No payment columns** beyond the above. No `_shared` edge folder; CORS is declared inline per function. `config.toml` only sets `verify_jwt=false` for one function.
- **Source of truth for totals:** `order_items` (snapshot unit prices) + `discount_amount`. The payment function will recompute from these rows server-side, never trusting the client.
- **WhatsApp:** fired from `Checkout.tsx` after order create (`admin.new_order`, `order.paid`).

## MyFatoorah facts confirmed from docs
- Create: `POST {base}/v3/payments` with `{ PaymentMethod, Order:{Amount,Currency,ExternalIdentifier}, Customer, IntegrationUrls:{Redirection}, UserDefinedField }` → returns `Data.InvoiceId` + `Data.PaymentURL`.
- Verify: `GET {base}/v3/payments/{paymentId}` → `Data.Invoice.Status` (PAID/PENDING), `Data.Transaction.Status` (SUCCESS/FAILED/CANCELED/AUTHORIZE), PaymentId/ReferenceId/TrackId/Card.Brand/Card.Number.
- Redirect appends `?paymentId=...`. Success is **final**, never downgraded. On GET unreachable: retry 3× / 5s, 30s timeout, else `pending_status_update`.
- Webhook V2 event `PAYMENT_STATUS_CHANGED` (Code 1). HMAC-SHA256 over the exact string `Invoice.Id={},Invoice.Status={},Transaction.Status={},Transaction.PaymentId={},Invoice.ExternalIdentifier={}` (null→""), base64, compared to `myfatoorah-signature` header.
- Bases: test `https://apitest.myfatoorah.com`, KWT live `https://api.myfatoorah.com`.

## Phase 1 — Database migration
New file `supabase/migrations/<ts>_add_myfatoorah_payments.sql` (also delivered as a standalone SQL script to run on self-hosted Supabase). It will:
- Extend the existing `payment_status` enum (additive, backward-compatible): add `pending_payment`, `payment_failed`, `payment_cancelled`, `payment_expired`, `pending_status_update`, `partially_refunded`.
- `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS`: `payment_provider text default 'none'`, `payment_online_method text`, `payment_currency text default 'KWD'`, `payment_amount numeric(12,3)`, `myfatoorah_invoice_id/payment_id/payment_url/transaction_id/reference_id/track_id/card_brand/card_last4 text`, `payment_error_code/message text`, `payment_raw_response jsonb`, `payment_verified_at/paid_at/failed_at/paid_notification_sent_at timestamptz`. (No renames/drops.)
- Create `public.payment_attempts` and `public.payment_events` exactly per spec (FKs to orders, indexes, unique idempotency key, unique `(provider,event_reference)`).
- GRANTs in same migration: `service_role` ALL on both tables; `authenticated` SELECT only. **No anon grant.** Enable RLS.
- RLS policies: admins (`has_role(auth.uid(),'admin')`) select all; customers select rows whose `order_id` belongs to their `auth.uid()` order. Writes only via service role (edge functions). `payment_raw_response` / `raw_payload` stay admin-only by never exposing them through customer-facing queries.
- `updated_at` trigger on `payment_attempts` using existing `update_updated_at_column()`.

Internal payment status canon stored in `orders.payment_status`; existing `order_status` enum left intact (online orders stay `new` until paid, then bump to `confirmed`).

## Phase 2 — Secrets & env (names only)
Document in `.env.example` / `README.md` / `SELF_HOSTED.md`. Edge-function secrets (set via Lovable secret tool for cloud + `supabase secrets set` on self-host): `MYFATOORAH_TOKEN`, `MYFATOORAH_BASE_URL`, `MYFATOORAH_WEBHOOK_SECRET`, `MYFATOORAH_CURRENCY=KWD`, `MYFATOORAH_COUNTRY_ISO=KWT`, `MYFATOORAH_MODE`, `APP_PUBLIC_URL`. Token never reaches the browser or logs.

## Phase 3 — Shared backend libs (`supabase/functions/_shared/`)
- `cors.ts`, `supabase-admin.ts` (service-role client), `myfatoorah.ts` (`getConfig`, `myfatoorahRequest` with Bearer auth, JSON, optional Idempotency-Key, 30s timeout, safe errors surfacing `IsSuccess/Message/ValidationErrors`), `payment-status.ts` (pure `mapMyFatoorahStatus` mapping Invoice/Transaction → paid/failed/cancelled/expired/pending_payment/pending_status_update; success final), `payment-security.ts` (`verifyMyFatoorahSignature` building the exact key=value string above, HMAC-SHA256 via WebCrypto, base64, timing-safe compare).

## Phase 4 — `create-myfatoorah-payment` edge function
`POST` `{ order_id, payment_method }` (KNET|CARD|APPLE_PAY|GOOGLE_PAY|...). Validates auth/ownership (logged-in user owns order, or guest order with no user_id), order not paid/cancelled, has items. **Recomputes amount** from `order_items` + `discount_amount` server-side. Builds idempotency key `myfatoorah:create:{order_id}:{method}:{amount}`; reuses existing valid attempt's PaymentURL. Calls `POST /v3/payments`, stores InvoiceId/PaymentURL on order + `payment_attempts` row, sets `payment_provider='myfatoorah'`, `payment_online_method`, `payment_status='pending_payment'`, `payment_amount/currency`. Returns `{ success, order_id, invoice_id, payment_url, payment_status }`. Validation errors → attempt `failed` + safe message.

## Phase 5 — `verify-myfatoorah-payment` edge function
`POST` `{ payment_id, order_id? }`. `GET /v3/payments/{payment_id}` with 3× retry/5s, 30s timeout. Resolves order via stored payment/invoice id, `UserDefinedField`/`ExternalIdentifier`, or `order_id`. Inserts `payment_events` (source `callback`). Applies mapping with downgrade-protection (paid never overwritten); sets `paid_at`/`failed_at`/`payment_verified_at`, bumps `order_status` to `confirmed` on success. Unreachable → `pending_status_update`. Returns status JSON for the UI.

## Phase 6 — `myfatoorah-webhook` edge function
Add `[functions.myfatoorah-webhook] verify_jwt = false` to `config.toml`. Reads raw body, verifies `myfatoorah-signature` (401 if invalid). Only handles `PAYMENT_STATUS_CHANGED`. Idempotent via unique `(provider, event_reference)` → returns 200 `{processed:false,duplicate:true}` on repeat. Resolves order, applies same downgrade-safe mapping (SUCCESS overrides all), inserts `payment_events` (source `webhook`, `signature_valid=true`), sets `paid_at` if empty. Always returns 200 quickly.

## Phase 7 — Checkout UI (`src/pages/Checkout.tsx`, `src/lib/i18n.tsx`)
Add an "Pay Online (MyFatoorah)" option group with KNET / Visa-Master / Apple Pay sub-choices (bilingual labels). COD path unchanged. Online path: create order (status stays pending), call `create-myfatoorah-payment`, show "Creating payment… / Redirecting…" states, then `window.location.href = payment_url`. Defer the customer "order.paid" WhatsApp to after verified payment; optionally send admin "pending payment" note. No amount/paid decisions on the client.

## Phase 8 — Callback page (`src/pages/PaymentCallback.tsx`, route in `src/App.tsx`)
Route `/payment/callback` (added before `/:brand`). Reads `paymentId`, shows bilingual "Verifying payment…", calls `verify-myfatoorah-payment`, then renders success (link to order confirmation), failed (Retry Payment + support), or pending states. Reuse for `/payment/success|failed|pending` if helpful.

## Phase 9 — Admin orders (`src/pages/admin/AdminOrders.tsx`, `src/lib/db.ts`)
Surface provider/method/payment status/amount/invoice id/payment id/transaction/reference/track/paid-at/verified-at in the order detail dialog; add payment-status & provider filters; add "Verify payment now" (calls verify fn), copy invoice/payment id, open payment URL when pending. Manual overrides logged to `app_logs`. Customers never see raw payloads.

## Phase 10 — Notifications & retry
Guard duplicate "paid" WhatsApp via `paid_notification_sent_at`. Retry: `create-myfatoorah-payment` allows new attempt while order unpaid/uncancelled (Retry Payment button on failed/callback/account pages), no duplicate order/items.

## Phase 11 — Tests & docs
Vitest/Deno unit tests for `mapMyFatoorahStatus`, signature verify (valid/invalid/missing/null→""), and idempotency. Update `README.md`, `.env.example`, `SELF_HOSTED.md`, and provide the standalone self-hosted SQL script + function deploy steps (`scripts/deploy-self-hosted-functions.sh`).

## Technical notes / assumptions
- Enum is **extended** (additive) rather than converted to text — lowest-risk, keeps current code/types working.
- Online orders reuse `order_status` lifecycle; `payment_status` carries the granular payment state.
- I will request the MyFatoorah secrets at implementation time; sandbox base `apitest` first, switch to live later via env only.
- Card data stored is limited to brand + last4; raw response sanitized and admin-gated.

## Files
**New:** `supabase/functions/_shared/{cors,supabase-admin,myfatoorah,payment-status,payment-security}.ts`, `supabase/functions/{create-myfatoorah-payment,verify-myfatoorah-payment,myfatoorah-webhook}/index.ts`, `src/pages/PaymentCallback.tsx`, `src/lib/payment.ts`, migration SQL.
**Changed:** `supabase/config.toml`, `src/App.tsx`, `src/pages/Checkout.tsx`, `src/pages/admin/AdminOrders.tsx`, `src/lib/db.ts`, `src/lib/i18n.tsx`, `.env.example`, `README.md`, `SELF_HOSTED.md`.
