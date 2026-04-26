-- ============================================================
-- Phase 1: full e-commerce + user system schema
-- ============================================================

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('pay_by_link','cod');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending','paid','failed','refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('new','confirmed','processing','shipped','delivered','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.coupon_type AS ENUM ('percent','fixed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM ('order','system','message');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------- PROFILES ----------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  address_line text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  block text NOT NULL DEFAULT '',
  street text NOT NULL DEFAULT '',
  building text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- CARTS ----------
CREATE TABLE public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX idx_carts_user ON public.carts(user_id);
CREATE INDEX idx_carts_session ON public.carts(session_id);

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cart"
  ON public.carts FOR SELECT
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR (user_id IS NULL AND session_id IS NOT NULL)
    OR public.has_role(auth.uid(),'admin')
  );

CREATE POLICY "Anyone can create cart"
  ON public.carts FOR INSERT
  WITH CHECK (
    (user_id IS NULL AND session_id IS NOT NULL)
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );

CREATE POLICY "Users can update own cart"
  ON public.carts FOR UPDATE
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR (user_id IS NULL AND session_id IS NOT NULL)
    OR public.has_role(auth.uid(),'admin')
  );

CREATE POLICY "Users can delete own cart"
  ON public.carts FOR DELETE
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR (user_id IS NULL AND session_id IS NOT NULL)
    OR public.has_role(auth.uid(),'admin')
  );

CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- CART ITEMS ----------
CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price_snapshot numeric(10,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);

CREATE INDEX idx_cart_items_cart ON public.cart_items(cart_id);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view cart items of accessible carts"
  ON public.cart_items FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id
      AND ((c.user_id IS NOT NULL AND c.user_id = auth.uid())
           OR (c.user_id IS NULL AND c.session_id IS NOT NULL)
           OR public.has_role(auth.uid(),'admin')))
  );

CREATE POLICY "Anyone can insert into accessible carts"
  ON public.cart_items FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id
      AND ((c.user_id IS NOT NULL AND c.user_id = auth.uid())
           OR (c.user_id IS NULL AND c.session_id IS NOT NULL)
           OR public.has_role(auth.uid(),'admin')))
  );

CREATE POLICY "Anyone can update accessible cart items"
  ON public.cart_items FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id
      AND ((c.user_id IS NOT NULL AND c.user_id = auth.uid())
           OR (c.user_id IS NULL AND c.session_id IS NOT NULL)
           OR public.has_role(auth.uid(),'admin')))
  );

CREATE POLICY "Anyone can delete accessible cart items"
  ON public.cart_items FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id
      AND ((c.user_id IS NOT NULL AND c.user_id = auth.uid())
           OR (c.user_id IS NULL AND c.session_id IS NOT NULL)
           OR public.has_role(auth.uid(),'admin')))
  );

-- ---------- ORDERS ----------
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1000;

CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.order_number_seq');
  RETURN 'CM-' || lpad(n::text, 6, '0');
END;
$$;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT public.next_order_number(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  address_line text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  block text NOT NULL DEFAULT '',
  street text NOT NULL DEFAULT '',
  building text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  subtotal numeric(10,3) NOT NULL DEFAULT 0,
  discount_amount numeric(10,3) NOT NULL DEFAULT 0,
  coupon_code text,
  total numeric(10,3) NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL,
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  order_status public.order_status NOT NULL DEFAULT 'new',
  admin_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(order_status);
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON public.orders FOR SELECT
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin')
  );

CREATE POLICY "Anyone can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update orders"
  ON public.orders FOR UPDATE
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can delete orders"
  ON public.orders FOR DELETE
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- ORDER ITEMS ----------
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  product_image_snapshot text NOT NULL DEFAULT '',
  brand_snapshot text NOT NULL DEFAULT '',
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,3) NOT NULL,
  line_total numeric(10,3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON public.order_items(order_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND ((o.user_id IS NOT NULL AND o.user_id = auth.uid())
           OR public.has_role(auth.uid(),'admin')))
  );

CREATE POLICY "Anyone can insert order items for new orders"
  ON public.order_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update order items"
  ON public.order_items FOR UPDATE
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can delete order items"
  ON public.order_items FOR DELETE
  USING (public.has_role(auth.uid(),'admin'));

-- ---------- COUPONS ----------
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type public.coupon_type NOT NULL,
  discount_value numeric(10,3) NOT NULL CHECK (discount_value >= 0),
  min_order_amount numeric(10,3) NOT NULL DEFAULT 0,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active coupons"
  ON public.coupons FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can insert coupons"
  ON public.coupons FOR INSERT
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can update coupons"
  ON public.coupons FOR UPDATE
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can delete coupons"
  ON public.coupons FOR DELETE
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- PRODUCT REVIEWS ----------
CREATE TABLE public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL,
  reviewer_email text,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  is_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_reviews_product ON public.product_reviews(product_id);
CREATE INDEX idx_product_reviews_approved ON public.product_reviews(is_approved) WHERE is_approved = true;

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a review"
  ON public.product_reviews FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read approved reviews"
  ON public.product_reviews FOR SELECT
  USING (is_approved = true OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can update reviews"
  ON public.product_reviews FOR UPDATE
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can delete reviews"
  ON public.product_reviews FOR DELETE
  USING (public.has_role(auth.uid(),'admin'));

-- ---------- SITE SETTINGS ----------
CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read site settings"
  ON public.site_settings FOR SELECT USING (true);

CREATE POLICY "Admins can insert site settings"
  ON public.site_settings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can update site settings"
  ON public.site_settings FOR UPDATE
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults
INSERT INTO public.site_settings (key, value) VALUES
  ('price_visibility', '{"global": false, "brands": {"flexitol": false, "kapiva": false, "nada": false, "abc": false, "lafes": false, "hartington": false, "phytophar": false}}'::jsonb),
  ('signup_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------- NOTIFICATIONS ----------
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  type public.notification_type NOT NULL DEFAULT 'system',
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can delete notifications"
  ON public.notifications FOR DELETE
  USING (public.has_role(auth.uid(),'admin'));

-- ---------- USER NOTIFICATION TEMPLATES ----------
CREATE TABLE public.user_notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  subject text NOT NULL,
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read templates"
  ON public.user_notification_templates FOR SELECT
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can insert templates"
  ON public.user_notification_templates FOR INSERT
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can update templates"
  ON public.user_notification_templates FOR UPDATE
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can delete templates"
  ON public.user_notification_templates FOR DELETE
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_user_notif_templates_updated_at
  BEFORE UPDATE ON public.user_notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default templates
INSERT INTO public.user_notification_templates (key, subject, body) VALUES
  ('order_confirmed', 'Your order {{order_number}} is confirmed', 'Thank you for your order! We have confirmed it and will start processing shortly.'),
  ('order_processing', 'Your order {{order_number}} is being prepared', 'Your order is being prepared for shipment.'),
  ('order_shipped', 'Your order {{order_number}} has shipped', 'Great news — your order is on its way!'),
  ('order_delivered', 'Your order {{order_number}} was delivered', 'Your order has been delivered. Thank you for shopping with us!'),
  ('order_cancelled', 'Your order {{order_number}} was cancelled', 'Your order has been cancelled. Contact us if you have any questions.')
ON CONFLICT (key) DO NOTHING;

-- ---------- AVATARS BUCKET ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );