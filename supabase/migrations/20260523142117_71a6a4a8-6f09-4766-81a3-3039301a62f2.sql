
-- 1. app_logs: prevent identity spoofing on insert
DROP POLICY IF EXISTS "Anyone can insert logs" ON public.app_logs;
CREATE POLICY "Anyone can insert scoped logs"
  ON public.app_logs
  FOR INSERT
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND (
      user_email IS NULL
      OR (auth.uid() IS NOT NULL AND user_email = (auth.jwt() ->> 'email'))
    )
  );

-- 2. order_items: require parent order ownership / recent creation
DROP POLICY IF EXISTS "Anyone can insert order items for new orders" ON public.order_items;
CREATE POLICY "Insert order items for own/recent orders"
  ON public.order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          (o.user_id IS NOT NULL AND o.user_id = auth.uid())
          OR (o.user_id IS NULL AND o.created_at > now() - interval '10 minutes')
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    )
  );

-- 3. product_reviews: hide reviewer_email from anon
REVOKE SELECT (reviewer_email) ON public.product_reviews FROM anon;

-- 4. coupons: lock down public read, expose via SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Anyone can read active coupons" ON public.coupons;
CREATE POLICY "Admins can read coupons"
  ON public.coupons
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _subtotal numeric)
RETURNS TABLE (
  ok boolean,
  reason text,
  discount_type text,
  discount_value numeric,
  discount numeric,
  min_order_amount numeric,
  coupon_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.coupons%ROWTYPE;
  d numeric;
BEGIN
  SELECT * INTO c FROM public.coupons
    WHERE code = upper(trim(_code)) AND is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invalid coupon code', NULL::text, NULL::numeric, NULL::numeric, NULL::numeric, NULL::uuid;
    RETURN;
  END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN QUERY SELECT false, 'Coupon has expired', NULL::text, NULL::numeric, NULL::numeric, NULL::numeric, NULL::uuid;
    RETURN;
  END IF;
  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RETURN QUERY SELECT false, 'Coupon usage limit reached', NULL::text, NULL::numeric, NULL::numeric, NULL::numeric, NULL::uuid;
    RETURN;
  END IF;
  IF _subtotal < c.min_order_amount THEN
    RETURN QUERY SELECT false, 'Minimum order amount not met', NULL::text, NULL::numeric, NULL::numeric, c.min_order_amount, NULL::uuid;
    RETURN;
  END IF;
  IF c.discount_type::text = 'percent' THEN
    d := round((_subtotal * c.discount_value) / 100.0, 3);
  ELSE
    d := least(_subtotal, c.discount_value);
  END IF;
  RETURN QUERY SELECT true, NULL::text, c.discount_type::text, c.discount_value, d, c.min_order_amount, c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_coupon(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_coupon_usage(_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.coupons
    SET used_count = used_count + 1, updated_at = now()
    WHERE code = upper(trim(_code)) AND is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_coupon_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(text) TO anon, authenticated;

-- 5. storage: remove broad public LIST on image buckets (public URL access still works)
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
DROP POLICY IF EXISTS "Public read hero media" ON storage.objects;
DROP POLICY IF EXISTS "Public can read category images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read brands images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read buket images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read favicone" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;

CREATE POLICY "Admins can list image buckets"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id IN ('product-images','hero-media','category-images','brands-images','buket-images','favicone','avatars')
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 6. trigger helpers should not be callable directly
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.products_set_slug() FROM PUBLIC, anon, authenticated;
