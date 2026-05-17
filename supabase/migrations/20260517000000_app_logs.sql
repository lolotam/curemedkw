-- App-level operation logs for admin observability
CREATE TABLE public.app_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  category text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  metadata jsonb DEFAULT '{}',
  error_message text,
  duration_ms integer
);

CREATE INDEX app_logs_created_at_idx ON public.app_logs (created_at DESC);
CREATE INDEX app_logs_category_idx   ON public.app_logs (category);
CREATE INDEX app_logs_user_id_idx    ON public.app_logs (user_id);
CREATE INDEX app_logs_status_idx     ON public.app_logs (status);

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_can_insert_logs" ON public.app_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "admins_can_read_logs" ON public.app_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
