
CREATE TABLE public.whatsapp_send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_send_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view whatsapp logs"
  ON public.whatsapp_send_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert whatsapp logs"
  ON public.whatsapp_send_logs FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update whatsapp logs"
  ON public.whatsapp_send_logs FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete whatsapp logs"
  ON public.whatsapp_send_logs FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_whatsapp_send_logs_created_at ON public.whatsapp_send_logs (created_at DESC);
CREATE INDEX idx_whatsapp_send_logs_order_id ON public.whatsapp_send_logs (order_id);
