-- A1. Lock down raw payment tables: admin-only SELECT, keep authenticated grant, remove anon + customer policies
DROP POLICY IF EXISTS "Customers view own payment attempts" ON public.payment_attempts;
REVOKE ALL ON public.payment_attempts FROM anon;
GRANT SELECT ON public.payment_attempts TO authenticated;
GRANT ALL ON public.payment_attempts TO service_role;

DROP POLICY IF EXISTS "Customers view own payment events" ON public.payment_events;
REVOKE ALL ON public.payment_events FROM anon;
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;

-- A2. Stop leaking raw provider payloads on customer-readable orders table
UPDATE public.orders SET payment_raw_response = NULL WHERE payment_raw_response IS NOT NULL;
COMMENT ON COLUMN public.orders.payment_raw_response IS 'DEPRECATED: do not write. Raw payloads live in payment_attempts/payment_events.';

-- A3. Guest payment token stored as SHA-256 hash, never plaintext
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_session_token_hash text;
CREATE INDEX IF NOT EXISTS idx_orders_payment_session_token_hash
  ON public.orders (payment_session_token_hash)
  WHERE payment_session_token_hash IS NOT NULL;