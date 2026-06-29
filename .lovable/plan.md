# MyFatoorah Hardening Plan (final, with all corrections)

The core integration already exists and works: 3 edge functions, shared helpers, `payment_attempts` / `payment_events` tables, expanded order columns, local idempotency cache, webhook + verify with downgrade protection, and admin order visibility. This plan applies only the security/correctness fixes flagged across review rounds. Every DB change ships as a migration **and** as a raw SQL script to run on self-hosted Supabase.

## What stays as-is (already correct)
- **Local idempotency** via `payment_attempts.idempotency_key` (reused before re-calling provider).
- **Success is final** — `apply-payment.ts` never downgrades a `paid` order (used by both verify + webhook).
- **`PaymentId` stored from the create response** (in both the attempt row and order).
- **Webhook** is signature-verified server-to-server; no customer-auth change needed.

## Decision: payment_status enum
Already expanded **additively** (`pending/paid/failed/refunded` kept; `pending_payment`, `payment_failed`, `payment_cancelled`, `payment_expired`, `pending_status_update`, `partially_refunded` added) and wired into the admin UI. Recommendation: **keep it** — reverting means another migration plus rewiring admin UI for no functional gain. Say the word if you still want the simple-enum + separate `myfatoorah_status text` design instead.

## Phase A — Database migration (security)

### A1. Lock down raw payment tables (admin-only, keep `authenticated` grant)
Do **not** revoke `SELECT` from `authenticated` — admins use that DB role and RLS needs the table grant present. Instead remove only `anon` access + the customer policies, and rely on admin-only RLS.

```text
-- payment_attempts
DROP POLICY IF EXISTS "Customers view own payment attempts" ON public.payment_attempts;
REVOKE ALL ON public.payment_attempts FROM anon;
GRANT SELECT ON public.payment_attempts TO authenticated;   -- RLS still restricts to admins
GRANT ALL    ON public.payment_attempts TO service_role;

-- payment_events
DROP POLICY IF EXISTS "Customers view own payment events" ON public.payment_events;
REVOKE ALL ON public.payment_events FROM anon;
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL    ON public.payment_events TO service_role;
```
The existing `Admins view all payment attempts/events` policies (`has_role(auth.uid(),'admin')`) remain the only SELECT path; RLS stays enabled. Customers get safe status from their `orders` row only.

### A2. Stop leaking raw provider payloads on the customer-readable `orders` table
`orders.payment_raw_response jsonb` exists. Customers can read their own order row and the frontend uses `select("*")`, so this could leak. Nothing currently writes to it, so the fix is: never write it, and null any existing values. Raw payloads live only in `payment_attempts.request_payload` / `response_payload` and `payment_events.raw_payload`.

```text
UPDATE public.orders SET payment_raw_response = NULL WHERE payment_raw_response IS NOT NULL;
COMMENT ON COLUMN public.orders.payment_raw_response IS 'DEPRECATED: do not write. Raw payloads live in payment_attempts/payment_events.';
```
`orders` keeps only safe summary fields: `payment_provider`, `payment_online_method`, `payment_status`, `payment_amount`, `payment_currency`, `myfatoorah_invoice_id`, `myfatoorah_payment_id`, transaction/reference/track IDs, `paid_at`, `failed_at`, `payment_verified_at`, `payment_error_code/message`.

### A3. Guest payment token — store a SHA-256 hash, never plaintext
```text
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_session_token_hash text;
CREATE INDEX IF NOT EXISTS idx_orders_payment_session_token_hash
  ON public.orders (payment_session_token_hash)
  WHERE payment_session_token_hash IS NOT NULL;
```

## Phase B — Edge function hardening

**`create-myfatoorah-payment/index.ts`**
- Restrict Zod `payment_method` to `["KNET","CARD","APPLE_PAY","GOOGLE_PAY"]` (drop `BENEFIT`, `STC_PAY`).
- Accept optional `payment_session_token` (raw) in the body. Ownership rule:
  - `order.user_id` present → require matching authenticated caller (already done).
  - `order.user_id IS NULL` → SHA-256 the raw token (`crypto.subtle.digest`), compare to `order.payment_session_token_hash`; **403 if missing or mismatch**. No token, no guest payment.
- Amount source of truth: recompute `sum(unit_price × qty) − discount_amount (+ delivery/tax when those columns exist)` and **compare to `order.total`**; reject with 400 `amount_mismatch` if they differ beyond 0.001. Charge `order.total`.
- Continue to **not** write `payment_raw_response` on the order.

**`verify-myfatoorah-payment/index.ts`**
- Apply the same hashed-guest-token check before refreshing/returning status for a guest order, so guest order status can't be probed by guessing `order_id`.

## Phase C — Frontend

**`src/pages/Checkout.tsx`**
- On order creation: `const rawToken = crypto.randomUUID()`, compute SHA-256 hex (Web Crypto), save the **hash** to `orders.payment_session_token_hash`, and keep the **raw** token in `sessionStorage` keyed by order id.
- Pass the raw token to `createMyFatoorahPayment(orderId, method, rawToken)`. Never put the token in the URL.
- Keep the method selector limited to KNET / CARD / Apple Pay.

**`src/lib/payment.ts`**
- Add optional `paymentSessionToken` to create + retry helpers; forward it in the request body (not query string).

**`src/pages/PaymentCallback.tsx`**
- Read the raw token from `sessionStorage` for guest "Retry payment" so it works without login.

## Technical notes
- A shared SHA-256 hex helper is used on both the client (Web Crypto `crypto.subtle.digest`) and edge functions so hashes match.
- All RLS/grant/column changes delivered via the migration tool **and** as a copy-paste SQL script for self-hosted Supabase.
- After edits: typecheck, then verify guest + logged-in flows — guest create/verify without a valid token must return 403; admin can still read payment tables; a customer `orders` row no longer contains raw payloads.
