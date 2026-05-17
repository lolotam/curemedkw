-- Allow admins to delete app_logs rows (used by the admin Operation Logs bulk-delete UI).
-- Mirrors the existing admins_can_read_logs policy in 20260517000000_app_logs.sql.

CREATE POLICY "admins_can_delete_logs" ON public.app_logs
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
