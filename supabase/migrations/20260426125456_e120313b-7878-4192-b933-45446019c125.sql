-- Junction table for many-to-many products <-> categories
CREATE TABLE IF NOT EXISTS public.product_categories (
  product_id  uuid NOT NULL REFERENCES public.products(id)  ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_category ON public.product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_product  ON public.product_categories(product_id);

-- RLS
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view product categories"
ON public.product_categories
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert product categories"
ON public.product_categories
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete product categories"
ON public.product_categories
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Backfill from existing single category_id
INSERT INTO public.product_categories (product_id, category_id)
SELECT id, category_id
FROM public.products
WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;