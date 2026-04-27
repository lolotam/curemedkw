ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Kuwait',
  ADD COLUMN IF NOT EXISTS governorate text NOT NULL DEFAULT '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Kuwait',
  ADD COLUMN IF NOT EXISTS governorate text NOT NULL DEFAULT '';