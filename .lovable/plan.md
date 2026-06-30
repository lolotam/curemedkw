# Order Notification Workflow

When a customer's payment is confirmed by MyFatoorah, the system fires three notifications exactly once:

1. **Email** to a main recipient + CC list — full order details/invoice.
2. **WhatsApp to the buyer** — order confirmation.
3. **WhatsApp to your company numbers** — new-order alert.

All triggered server-side on **payment success** (not at checkout), so abandoned/unpaid orders never generate notifications.

```text
Customer pays ──▶ MyFatoorah confirms
                      │
        verify-myfatoorah-payment  /  myfatoorah-webhook
                      │
              apply-payment (success, first time only)
            ┌─────────┼───────────────┐
        Email(SMTP)  WhatsApp buyer  WhatsApp company
```

## What changes

### 1. Trigger point (single source of truth)
- Hook the dispatch into `supabase/functions/_shared/apply-payment.ts`, right after a payment is marked **paid for the first time** (`isSuccess && changed && order_notified_at is null`).
- Covers both the redirect callback (`verify-myfatoorah-payment`) and the `myfatoorah-webhook`, with de-duplication so notifications never double-fire.
- **Remove** the current checkout-time WhatsApp block in `src/pages/Checkout.tsx` (it fires before payment).

### 2. Email sending (self-host friendly, fully admin-configured)
- New edge function `supabase/functions/send-order-email/index.ts` using an SMTP client (denomailer) — portable to your self-hosted backend.
- **All SMTP settings come from the admin dashboard** (stored in DB, read by the function via service role) — no secrets required:
  - Host, Port, Secure (TLS on/off)
  - Username (email) + Password
  - From name + From address
- Builds an HTML order email (order number, customer, items, totals, delivery address, payment method, order link) and sends with **To = main recipient** and **CC = the CC list**.
- `apply-payment` calls this function (and `send-whatsapp`) via internal `fetch` to `${SUPABASE_URL}/functions/v1/...` with the service-role key — identical on Lovable Cloud and self-hosted.

### 3. WhatsApp to the buyer
- The `order.paid` template already exists in `send-whatsapp` but was never wired. Now sent to `order.customer_phone` on payment success.
- The company alert (`admin.new_order`) is sent to your saved admin numbers at the same moment.

### 4. Admin settings UI (`/admin/whatsapp`)
Add an **Order Email** card with:
- Enable/disable toggle
- **SMTP connection**: host, port, secure toggle, username (email), password (masked, edit-on-demand like the Postora key)
- **Sender**: from name + from address
- **Recipients**: main "To" address + a CC list (add/remove multiple)
- A "Send test email" button

Stored in `site_settings` under a new key `order_email` — admin-only via existing RLS, **not** in the public read allowlist, so credentials are never exposed to the storefront.

### 5. Single-send guarantee
- Add `order_notified_at timestamptz` to `orders`. Notifications fire only when null, then it's stamped — preventing duplicates if both callback and webhook resolve the same payment.

## Security note
Because you want everything admin-editable, the SMTP password is stored in the database (in the admin-only `order_email` settings row, unreadable by the public/storefront and never sent to the browser except masked). This is the tradeoff for full dashboard control vs. server-only secrets — acceptable since the row is protected by admin RLS and only the edge function reads the raw value.

## Self-hosted SQL (run on your Supabase)
```sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_notified_at timestamptz;
```
Then deploy the new/updated edge functions (`send-order-email`, `verify-myfatoorah-payment`, `myfatoorah-webhook`, `send-whatsapp`) with your existing deploy script.

## Technical notes
- Email/WhatsApp are best-effort and logged; failures never block payment confirmation.
- `send-order-email` validates input with Zod and is only meaningfully callable with the service-role key from `apply-payment`.
- WhatsApp respects the existing `whatsapp_integration` enable/event toggles.
- No customer-facing payment/RLS behavior changes.
