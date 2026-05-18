CREATE TABLE IF NOT EXISTS public.app_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  category TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  user_id UUID,
  user_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON public.app_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_category ON public.app_logs (category);
CREATE INDEX IF NOT EXISTS idx_app_logs_status ON public.app_logs (status);

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert logs"
  ON public.app_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view logs"
  ON public.app_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete logs"
  ON public.app_logs FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));