-- Backfill master tags table from product tags arrays
INSERT INTO public.tags (name, slug)
SELECT DISTINCT
  trim(t)                                           AS name,
  regexp_replace(lower(trim(t)), '[^a-z0-9]+', '-', 'g') AS slug
FROM public.products, unnest(public.products.tags) AS t
WHERE trim(t) <> ''
ON CONFLICT (slug) DO NOTHING;