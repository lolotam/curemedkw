-- Fix product main_image URLs that were stored with the internal Docker network hostname
-- (http://kong:8000) instead of the public Supabase URL. These were created by the
-- upscale-image (PicsArt) edge function before the SUPABASE_PUBLIC_URL fix was applied.
UPDATE public.products
SET main_image = REPLACE(main_image, 'http://kong:8000', 'https://supabase.curemedkw.com')
WHERE main_image LIKE 'http://kong:8000%';
