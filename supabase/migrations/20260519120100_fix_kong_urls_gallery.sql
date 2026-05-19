-- Companion to 20260519120000_fix_kong_urls.sql: that migration repaired
-- products.main_image but missed gallery[] array entries. Same root cause —
-- upscale-image (PicsArt) edge function wrote the internal Docker hostname
-- http://kong:8000 instead of the public Supabase URL before SUPABASE_PUBLIC_URL
-- was wired into the function. Split into its own file (rather than editing
-- the prior migration) because the earlier file is already in the checksum
-- ledger on production and must not change.
UPDATE public.products
SET gallery = ARRAY(
  SELECT REPLACE(url, 'http://kong:8000', 'https://supabase.curemedkw.com')
  FROM unnest(gallery) AS url
)
WHERE EXISTS (
  SELECT 1 FROM unnest(gallery) AS u WHERE u LIKE 'http://kong:8000%'
);
