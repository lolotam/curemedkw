-- Idempotency marker for order notifications (email + WhatsApp).
-- Claimed atomically so each paid order notifies exactly once.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_notified_at timestamptz;