-- ============================================================================
-- Order Notification Workflow — self-hosted Supabase setup
-- Run this once on your self-hosted database.
-- Safe to re-run (idempotent).
-- ============================================================================

-- Idempotency marker so each paid order triggers email + WhatsApp exactly once.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_notified_at timestamptz;

-- ----------------------------------------------------------------------------
-- NOTE: SMTP credentials and recipients are stored in site_settings under the
-- key "order_email" and are fully editable from /admin/whatsapp. No DB seeding
-- is required. The shape stored is:
--   {
--     "enabled": true,
--     "smtp_host": "smtp.yourhost.com",
--     "smtp_port": 587,
--     "smtp_secure": false,
--     "smtp_user": "user@domain.com",
--     "smtp_pass": "••••",
--     "from_email": "orders@domain.com",
--     "from_name": "Curemed",
--     "to": "admin@domain.com",
--     "cc": ["manager@domain.com"],
--     "storefront_url": "https://curemedkw.com"
--   }
-- site_settings RLS already restricts non-allowlisted keys to admins only,
-- so these credentials are NOT exposed to the public.
-- ----------------------------------------------------------------------------
