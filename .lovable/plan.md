# WhatsApp Integration via Postora API

Wire Curemed to Postora's WhatsApp endpoint so:
- New orders → push to admin WhatsApp numbers
- Customers → automatic order confirmation + invoice link
- Future events (shipped / abandoned cart / review) → toggleable

## 1. Secret

Add Postora API key as a runtime secret: `POSTORA_WHATSAPP_API_KEY`.
(Asked via add_secret tool — user pastes once.)

## 2. Database (migration)

New table `whatsapp_send_logs`:
- `event` (text) — `order.paid`, `order.shipped`, `cart.abandoned`, `review.request`, `admin.new_order`
- `recipient` (text) — phone in E.164
- `status` (text) — `sent` | `failed` | `skipped`
- `request_payload` (jsonb), `response_payload` (jsonb), `error_message` (text)
- `order_id` (uuid, nullable), `created_at`

Reuse existing `site_settings` (JSONB key/value) for config — no new settings table needed. Key: `whatsapp_integration` with shape:
```
{
  enabled: true,
  language: "ar",
  admin_numbers: ["96560003759"],
  events: { order_paid: true, order_shipped: false, cart_abandoned: false, review_request: false },
  templates: { order_paid_ar: "...", order_paid_en: "..." }
}
```

RLS: only admins read/write `whatsapp_send_logs` and the `whatsapp_integration` setting (existing site_settings policies already cover admin write).

## 3. Edge function

`supabase/functions/send-whatsapp/index.ts` (verify_jwt = false; signature: admin JWT for manual, service-role for internal hooks).
- Validates body with Zod: `{ event, to: string[], data: object }`
- Reads `POSTORA_WHATSAPP_API_KEY` from env
- Loads `whatsapp_integration` settings; bails if event toggle is off
- Renders template (Arabic/English) with `data` placeholders: `{{customer_name}}`, `{{order_number}}`, `{{total}}`, `{{invoice_url}}`
- POSTs to `https://efruibswazzuuupgyzmf.supabase.co/functions/v1/ecommerce-whatsapp-api` with header `x-api-key: <secret>`
- Logs every attempt to `whatsapp_send_logs`
- Retries once on 5xx

## 4. Client hooks

**`src/pages/Checkout.tsx`** — after order insert succeeds:
- Invoke `send-whatsapp` with `event: "admin.new_order"`, `to: settings.admin_numbers`, `data: { order_number, customer_name, total, items_summary }`
- Invoke `send-whatsapp` with `event: "order.paid"`, `to: [customer_phone]`, `data: { ..., invoice_url: ${origin}/order/${order.id} }`

**`src/pages/admin/AdminOrders.tsx`** — when admin changes status to `shipped`:
- Invoke `send-whatsapp` with `event: "order.shipped"` (only if toggle enabled)

## 5. Admin UI

New page `src/pages/admin/AdminWhatsApp.tsx` (route `/admin/whatsapp`):
- Form bound to `site_settings.whatsapp_integration`
- Fields: enabled toggle, default language (ar/en), admin numbers (tag input, E.164), per-event toggles, template textareas with placeholder helper
- "Send test message" button → calls edge function with test payload
- Recent activity table reading `whatsapp_send_logs` (last 50, status badges)

Add link in admin sidebar (`AdminLayout`): "WhatsApp" with MessageCircle icon.

## 6. Fallback (current behavior preserved)

Keep `WhatsAppFab` (customer-to-shop chat) untouched.
If `POSTORA_WHATSAPP_API_KEY` is missing or `enabled=false`, edge function returns `{skipped: true}` so checkout never breaks.

## Self-hosted SQL

Migration will be saved under `supabase/migrations/` and applied automatically on Lovable Cloud. For your self-hosted Supabase, run the same generated file via `scripts/apply-self-hosted-migrations.sh`.

## Out of scope (next iterations)

- Abandoned-cart cron (`pg_cron` + edge function) — wire after Postora confirms event support
- Review request after N days post-delivery
- PDF invoice generation (currently we send a link to the order confirmation page)

---

Approve to implement. After approval I will:
1. Request `POSTORA_WHATSAPP_API_KEY` secret
2. Run the migration
3. Build the edge function, admin page, and checkout hooks
