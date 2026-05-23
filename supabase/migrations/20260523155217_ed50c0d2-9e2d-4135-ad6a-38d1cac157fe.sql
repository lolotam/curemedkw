-- Restrict site_settings SELECT so secret rows (whatsapp_integration) are admin-only.
DROP POLICY IF EXISTS "Anyone can read site settings" ON public.site_settings;

CREATE POLICY "Public can read non-secret settings"
ON public.site_settings
FOR SELECT
USING (key NOT IN ('whatsapp_integration'));

CREATE POLICY "Admins can read all settings"
ON public.site_settings
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));