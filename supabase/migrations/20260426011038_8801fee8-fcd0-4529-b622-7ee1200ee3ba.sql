ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name_ar text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category_ar text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS short_description_ar text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS long_description_ar text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS usage_ar text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS benefits_ar text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ingredients_ar text[] NOT NULL DEFAULT '{}'::text[];