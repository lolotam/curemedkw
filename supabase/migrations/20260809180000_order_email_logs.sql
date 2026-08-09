-- Delivery log for order-confirmation emails.
--
-- Mirrors public.whatsapp_send_logs. It exists because the dispatcher in
-- _shared/apply-payment.ts invokes send-order-email fire-and-forget under
-- Promise.allSettled and discards the result, so a failed send would otherwise
-- be invisible. One row is written per leg (customer / admin).
--
-- The edge function writes with the service role, which bypasses RLS; the
-- policies below exist so the admin dashboard can read the log.

CREATE TABLE public.order_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,                              -- NULL for sample/test sends
  audience text NOT NULL,                     -- 'customer' | 'admin'
  lang text NOT NULL DEFAULT 'en',            -- 'ar' | 'en'
  recipient text NOT NULL,                    -- To + Cc, comma joined
  subject text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'sent',        -- 'sent' | 'failed' | 'skipped'
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view order email logs"
  ON public.order_email_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert order email logs"
  ON public.order_email_logs FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update order email logs"
  ON public.order_email_logs FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete order email logs"
  ON public.order_email_logs FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_order_email_logs_created_at ON public.order_email_logs (created_at DESC);
CREATE INDEX idx_order_email_logs_order_id ON public.order_email_logs (order_id);
