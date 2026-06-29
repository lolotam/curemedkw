-- Replace the denylist public-read policy on site_settings with an explicit allowlist
-- of keys required for storefront rendering, so internal config is no longer exposed.
DROP POLICY IF EXISTS "Public can read non-secret settings" ON public.site_settings;

CREATE POLICY "Public can read storefront settings"
ON public.site_settings
FOR SELECT
USING (
  key LIKE 'branding_%'
  OR key IN (
    'price_visibility',
    'hero_intervals',
    'home_carousel_autoscroll',
    'featured_glass_opacity',
    'loader_bar',
    'loader_video_url',
    'loader_page_enabled',
    'product_card_hover',
    'signup_enabled'
  )
);