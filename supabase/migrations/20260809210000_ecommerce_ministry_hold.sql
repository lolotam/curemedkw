-- Ministry hold: an admin switch that closes the buying path site-wide while
-- Curemed waits on Ministry of Health approval, without unpublishing the
-- catalogue.
--
-- The storefront hides the buy affordances, but that is presentation only: the
-- anon key ships inside the browser bundle, so anyone can POST to /rest/v1/orders
-- directly. The hold therefore has to be enforced where orders are written.

-- ---------------------------------------------------------------------------
-- 1. Publish the flag to the storefront.
--
-- Public SELECT on site_settings is an explicit key allowlist (migration
-- 20260629193251). Postgres has no "add a key" operation for a policy, so the
-- whole policy is recreated — every previously allowed key is repeated below.
-- Dropping one would silently break branding, the loader, or product cards.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can read storefront settings" ON public.site_settings;

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
    'signup_enabled',
    'ecommerce_mode'
  )
);

-- ---------------------------------------------------------------------------
-- 2. The ordering gate.
--
-- SECURITY DEFINER, mirroring public.has_role: site_settings is itself under
-- RLS, so a plain function would run as the anon caller and could see no row.
--
-- The comparison is jsonb-to-jsonb rather than a ::boolean cast because a cast
-- raises on unexpected text, and an exception inside a policy blocks the write.
-- Likewise every path where the setting is missing, partially saved, or not an
-- object resolves to TRUE (trading normally) — `WITH CHECK (NULL)` REJECTS the
-- row, so a NULL here would close the shop the moment this migration applied.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ecommerce_ordering_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT COALESCE(
    (
      SELECT value->'shoppingEnabled' = 'false'::jsonb
          OR value->'checkoutEnabled' = 'false'::jsonb
      FROM public.site_settings
      WHERE key = 'ecommerce_mode'
    ),
    false
  )
$$;

COMMENT ON FUNCTION public.ecommerce_ordering_enabled() IS
  'False only when site_settings.ecommerce_mode explicitly disables shopping or checkout. Any other state means trading normally.';

-- ---------------------------------------------------------------------------
-- 3. Gate order creation.
--
-- Admins stay exempt so support can still key in an order during a hold.
-- order_items needs no policy change: its order_id FK references public.orders,
-- so blocking the parent already blocks the children.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;

CREATE POLICY "Create orders while ordering is open"
  ON public.orders FOR INSERT
  WITH CHECK (
    public.ecommerce_ordering_enabled()
    OR public.has_role(auth.uid(), 'admin')
  );

-- ---------------------------------------------------------------------------
-- 4. Seed the switch in its open position so the admin page shows a saved
--    state on first visit. DO NOTHING keeps a hold in place across re-runs.
-- ---------------------------------------------------------------------------
INSERT INTO public.site_settings (key, value)
VALUES (
  'ecommerce_mode',
  '{"shoppingEnabled":true,"addToCartEnabled":true,"checkoutEnabled":true,"noticeEn":"","noticeAr":""}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
