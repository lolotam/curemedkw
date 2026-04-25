-- 1. Categories table
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view categories"
  ON public.categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert categories"
  ON public.categories FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update categories"
  ON public.categories FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete categories"
  ON public.categories FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_categories_sort ON public.categories (sort_order, name_en);

-- 2. Add category_id FK to products
ALTER TABLE public.products
  ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX idx_products_category_id ON public.products (category_id);

-- 3. Storage bucket for category images
INSERT INTO storage.buckets (id, name, public)
VALUES ('category-images', 'category-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read category images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'category-images');

CREATE POLICY "Admins can upload category images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'category-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update category images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'category-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete category images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'category-images' AND has_role(auth.uid(), 'admin'::app_role));