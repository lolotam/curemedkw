-- ============================================================
-- MyFatoorah payments: orders columns, enums, attempts & events
-- Safe/idempotent; runnable on self-hosted Supabase as-is.
-- ============================================================

-- 1. Extend payment_status enum (additive, backward compatible)
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'pending_payment';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'payment_failed';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'payment_cancelled';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'payment_expired';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'pending_status_update';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'partially_refunded';

-- 2. Orders payment columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_online_method text,
  ADD COLUMN IF NOT EXISTS payment_currency text NOT NULL DEFAULT 'KWD',
  ADD COLUMN IF NOT EXISTS payment_amount numeric(12,3),
  ADD COLUMN IF NOT EXISTS myfatoorah_invoice_id text,
  ADD COLUMN IF NOT EXISTS myfatoorah_payment_id text,
  ADD COLUMN IF NOT EXISTS myfatoorah_payment_url text,
  ADD COLUMN IF NOT EXISTS myfatoorah_transaction_id text,
  ADD COLUMN IF NOT EXISTS myfatoorah_reference_id text,
  ADD COLUMN IF NOT EXISTS myfatoorah_track_id text,
  ADD COLUMN IF NOT EXISTS myfatoorah_card_brand text,
  ADD COLUMN IF NOT EXISTS myfatoorah_card_last4 text,
  ADD COLUMN IF NOT EXISTS payment_error_code text,
  ADD COLUMN IF NOT EXISTS payment_error_message text,
  ADD COLUMN IF NOT EXISTS payment_raw_response jsonb,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_notification_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_mf_payment_id ON public.orders(myfatoorah_payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_mf_invoice_id ON public.orders(myfatoorah_invoice_id);

-- 3. payment_attempts
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'myfatoorah',
  payment_method text,
  amount numeric(12,3) NOT NULL,
  currency text NOT NULL DEFAULT 'KWD',
  idempotency_key text NOT NULL,
  invoice_id text,
  payment_id text,
  payment_url text,
  status text DEFAULT 'created',
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_attempts_idempotency_key
  ON public.payment_attempts(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order_id ON public.payment_attempts(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_invoice_id ON public.payment_attempts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment_id ON public.payment_attempts(payment_id);

GRANT SELECT ON public.payment_attempts TO authenticated;
GRANT ALL ON public.payment_attempts TO service_role;

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all payment attempts"
  ON public.payment_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers view own payment attempts"
  ON public.payment_attempts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payment_attempts.order_id
      AND o.user_id IS NOT NULL
      AND o.user_id = auth.uid()
  ));

CREATE TRIGGER update_payment_attempts_updated_at
  BEFORE UPDATE ON public.payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. payment_events
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'myfatoorah',
  event_source text NOT NULL,
  event_type text,
  event_reference text,
  invoice_id text,
  payment_id text,
  transaction_id text,
  status text,
  is_success boolean,
  raw_payload jsonb,
  signature_valid boolean,
  processed boolean DEFAULT false,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_order_id ON public.payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON public.payment_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_invoice_id ON public.payment_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_reference ON public.payment_events(event_reference);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_events_provider_reference
  ON public.payment_events(provider, event_reference)
  WHERE event_reference IS NOT NULL;

GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all payment events"
  ON public.payment_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers view own payment events"
  ON public.payment_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payment_events.order_id
      AND o.user_id IS NOT NULL
      AND o.user_id = auth.uid()
  ));