BEGIN;
SELECT pg_advisory_xact_lock(20261112,1);

-- A read-only product catalogue for the external sales agent (the Postora WhatsApp bot). It reads the
-- live tables through PostgREST with the anon key, so it is always in sync with the storefront and sees
-- exactly what an anonymous shopper may see: the view runs with the caller's rights and existing RLS.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- The brand slugs and names the storefront hard-codes in src/lib/brands.ts, owned by the database so the
-- view can build product links. Keep both in step when a brand is added.
CREATE TABLE IF NOT EXISTS public.catalog_brands (
  key public.brand_key PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text NOT NULL
);
INSERT INTO public.catalog_brands(key,slug,name_en,name_ar) VALUES
  ('flexitol','flexitol','Flexitol','فليكسيتول'),
  ('kapiva','kapiva','Kapiva','كابيفا'),
  ('nada','nada','NADA','ندا'),
  ('abc','australian-bodycare','ABC','ABC'),
  ('lafes','lafes','Lafe''s','لافز'),
  ('hartington','hartington','Hartington','هارتنجتون'),
  ('phytophar','phytophar','Phytophar','فيتوفار'),
  ('hualunhongli','hualunhongli','Hualunhongli','هيلون-هونجلاي')
ON CONFLICT (key) DO NOTHING;
ALTER TABLE public.catalog_brands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_brands FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.catalog_brands TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.catalog_brands TO authenticated;
DROP POLICY IF EXISTS "Anyone can view catalog brands" ON public.catalog_brands;
CREATE POLICY "Anyone can view catalog brands" ON public.catalog_brands FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can insert catalog brands" ON public.catalog_brands;
CREATE POLICY "Admins can insert catalog brands" ON public.catalog_brands
  FOR INSERT WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
DROP POLICY IF EXISTS "Admins can update catalog brands" ON public.catalog_brands;
CREATE POLICY "Admins can update catalog brands" ON public.catalog_brands
  FOR UPDATE USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
DROP POLICY IF EXISTS "Admins can delete catalog brands" ON public.catalog_brands;
CREATE POLICY "Admins can delete catalog brands" ON public.catalog_brands
  FOR DELETE USING (public.has_role(auth.uid(),'admin'::public.app_role));

-- Search text: lower case, no Arabic diacritics (tashkeel, superscript alef) or tatweel, one alef form,
-- teh marbuta as heh, alef maksura as yeh, and single spaces.
CREATE OR REPLACE FUNCTION public.catalog_normalize(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT btrim(regexp_replace(
    translate(regexp_replace(lower(p_text),U&'[\064B-\0652\0670\0640]','','g'),
      U&'\0623\0625\0622\0671\0629\0649',U&'\0627\0627\0627\0627\0647\064A'),
    '\s+',' ','g'))
$fn$;

-- One row per product. Prices are NULL wherever the storefront hides them (site_settings.price_visibility,
-- true meaning hidden). shopping_enabled is false unless ecommerce_mode explicitly enables shopping.
-- Settings are compared as text so a malformed value reads as not set instead of failing the query.
CREATE OR REPLACE VIEW public.agent_catalog_products WITH (security_invoker=true) AS
SELECT
  p.id,
  p.sku,
  p.slug,
  p.brand AS brand_key,
  b.slug AS brand_slug,
  b.name_en AS brand_name_en,
  b.name_ar AS brand_name_ar,
  p.name AS name_en,
  p.name_ar,
  p.category AS category_en,
  p.category_ar,
  CASE WHEN visibility.price_hidden THEN NULL ELSE p.price END AS price_kwd,
  CASE WHEN visibility.price_hidden THEN NULL ELSE p.original_price END AS original_price_kwd,
  visibility.price_hidden,
  p.stock_status<>'out_of_stock' AS in_stock,
  p.stock_status,
  settings.shopping_enabled,
  p.size,
  p.tags,
  category_list.category_slugs,
  p.short_description AS short_description_en,
  p.short_description_ar,
  p.main_image,
  'https://curemedkw.com/'||b.slug||'/product/'||p.slug AS product_url,
  p.updated_at
FROM public.products p
LEFT JOIN public.catalog_brands b ON b.key=p.brand
CROSS JOIN (SELECT
    (SELECT value FROM public.site_settings WHERE key='price_visibility') AS price_visibility,
    coalesce((SELECT value->>'shoppingEnabled' FROM public.site_settings WHERE key='ecommerce_mode')='true',false)
      AS shopping_enabled) settings
CROSS JOIN LATERAL (SELECT coalesce(settings.price_visibility->>'global'='true',false)
    OR coalesce(settings.price_visibility->'brands'->>(p.brand::text)='true',false) AS price_hidden) visibility
CROSS JOIN LATERAL (SELECT coalesce(array_agg(DISTINCT c.slug ORDER BY c.slug),'{}'::text[]) AS category_slugs
    FROM public.categories c
    WHERE c.id=p.category_id
      OR c.id IN (SELECT pc.category_id FROM public.product_categories pc WHERE pc.product_id=p.id)) category_list;
REVOKE ALL ON public.agent_catalog_products FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.agent_catalog_products TO anon,authenticated;

-- Products matching a shopper's words, best first. An exact SKU or slug scores 2, above any trigram score
-- (at most 1); other rows rank by the closest of their names, brand, categories, tags, SKU and slug, and
-- are returned from 0.3. A blank query returns nothing; max_results is clamped to 1..25.
CREATE OR REPLACE FUNCTION public.agent_search_products(q text,max_results integer DEFAULT 8)
RETURNS TABLE(id uuid,sku text,slug text,brand_key public.brand_key,brand_slug text,brand_name_en text,
  brand_name_ar text,name_en text,name_ar text,category_en text,category_ar text,price_kwd numeric,
  original_price_kwd numeric,price_hidden boolean,in_stock boolean,stock_status public.stock_status,
  shopping_enabled boolean,size text,tags text[],category_slugs text[],short_description_en text,
  short_description_ar text,main_image text,product_url text,updated_at timestamptz,score real)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $fn$
  SELECT v.*,ranked.score
  FROM (SELECT public.catalog_normalize(agent_search_products.q) AS words,
      lower(btrim(agent_search_products.q)) AS exact) needle
  CROSS JOIN public.agent_catalog_products v
  CROSS JOIN LATERAL (SELECT CASE WHEN lower(v.sku)=needle.exact OR lower(v.slug)=needle.exact THEN 2::real
    ELSE (SELECT max(extensions.word_similarity(needle.words,public.catalog_normalize(field)))
      FROM unnest(ARRAY[v.name_en,v.name_ar,v.brand_name_en,v.brand_name_ar,v.category_en,v.category_ar,
        array_to_string(v.tags,' '),v.sku,v.slug]) field) END AS score) ranked
  WHERE needle.words<>'' AND ranked.score>=0.3
  ORDER BY ranked.score DESC,v.name_en,v.id
  LIMIT least(greatest(coalesce(agent_search_products.max_results,8),1),25)
$fn$;

-- The search runs with the caller's rights, so the browser roles also need the normalizer it calls.
REVOKE ALL ON FUNCTION public.catalog_normalize(text),public.agent_search_products(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_normalize(text),public.agent_search_products(text,integer)
  TO anon,authenticated,service_role;

CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON public.products
  USING gin (public.catalog_normalize(name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_ar_trgm_idx ON public.products
  USING gin (public.catalog_normalize(name_ar) extensions.gin_trgm_ops);
COMMIT;
