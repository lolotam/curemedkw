BEGIN;
INSERT INTO auth.users(id,email) VALUES('8c000000-0000-4000-8000-000000000001','catalog-admin@example.test'),
  ('8c000000-0000-4000-8000-000000000002','catalog-shopper@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('8c000000-0000-4000-8000-000000000001','admin');
INSERT INTO public.categories(id,slug,name_en) VALUES
  ('8c000000-0000-4000-8000-0000000000c1','fixture-body-care','Body Care'),
  ('8c000000-0000-4000-8000-0000000000c2','fixture-antiseptic','Antiseptic');
-- An ABC body wash in two categories (one by category_id, one through the junction table, and that one
-- again through the junction), a Flexitol heel balm, and a Kapiva product with no category.
INSERT INTO public.products(id,brand,name,name_ar,category,category_ar,price,original_price,sku,slug,tags,category_id) VALUES
  ('8c000000-0000-4000-8000-0000000000a1','abc','Tea Tree Body Wash','غسول الجسم بزيت شجرة الشاي','Body Wash','غسول الجسم',
    3.5,4.5,'FX-ABC-1','fixture-tea-tree-body-wash','{tea tree}','8c000000-0000-4000-8000-0000000000c2'),
  ('8c000000-0000-4000-8000-0000000000a2','flexitol','Flexitol Heel Balm','فليكسيتول بلسم الكعب','Foot Care','العناية بالقدم',
    6.75,NULL,'FX-FLX-HEEL','fixture-flexitol-heel-balm','{heel,cracked heels}',NULL),
  ('8c000000-0000-4000-8000-0000000000a3','kapiva','Kapiva Wellness Juice','عصير كابيفا','Juices','عصائر',
    9,NULL,'FX-KAP-7','fixture-kapiva-juice','{}',NULL);
INSERT INTO public.product_categories(product_id,category_id) VALUES
  ('8c000000-0000-4000-8000-0000000000a1','8c000000-0000-4000-8000-0000000000c1'),
  ('8c000000-0000-4000-8000-0000000000a1','8c000000-0000-4000-8000-0000000000c2');
DELETE FROM public.site_settings WHERE key IN ('price_visibility','ecommerce_mode');
INSERT INTO public.site_settings(key,value) VALUES('price_visibility','{"global":false,"brands":{"abc":true}}');

DO $proof$
DECLARE
  abc uuid:='8c000000-0000-4000-8000-0000000000a1'; balm uuid:='8c000000-0000-4000-8000-0000000000a2';
  juice uuid:='8c000000-0000-4000-8000-0000000000a3';
  row public.agent_catalog_products; first record; query text; observed integer;
BEGIN
  -- The normalizer folds case, diacritics, tatweel, alef/teh marbuta/alef maksura forms and spacing,
  -- and pg_trgm sees Arabic letters as word characters in this database's locale.
  IF public.catalog_normalize('  HEEL   Balm ')<>'heel balm' OR public.catalog_normalize('بَلْسَم')<>'بلسم'
      OR public.catalog_normalize('بلـــسم')<>'بلسم' OR public.catalog_normalize('أإآٱ ة ى')<>'اااا ه ي' THEN
    RAISE EXCEPTION 'Unexpected normalization'; END IF;
  IF cardinality(extensions.show_trgm('بلسم'))=0 THEN RAISE EXCEPTION 'pg_trgm ignores Arabic letters'; END IF;

  -- ABC products link under the australian-bodycare slug; a hidden brand has no prices.
  SELECT * INTO row FROM public.agent_catalog_products WHERE id=abc;
  IF row.product_url<>'https://curemedkw.com/australian-bodycare/product/fixture-tea-tree-body-wash'
      OR row.brand_slug<>'australian-bodycare' OR row.brand_name_ar<>'ABC' THEN
    RAISE EXCEPTION 'Unexpected ABC product link: %',row.product_url; END IF;
  IF NOT row.price_hidden OR row.price_kwd IS NOT NULL OR row.original_price_kwd IS NOT NULL THEN
    RAISE EXCEPTION 'A hidden brand exposed its price'; END IF;
  IF row.category_slugs<>'{fixture-antiseptic,fixture-body-care}'::text[] OR row.tags<>'{tea tree}'::text[] THEN
    RAISE EXCEPTION 'Unexpected categories or tags: % %',row.category_slugs,row.tags; END IF;
  SELECT * INTO row FROM public.agent_catalog_products WHERE id=balm;
  IF row.price_hidden OR row.price_kwd<>6.75 OR row.category_slugs<>'{}'::text[] OR NOT row.in_stock THEN
    RAISE EXCEPTION 'Unexpected visible product: % % %',row.price_kwd,row.category_slugs,row.in_stock; END IF;
  -- With no ecommerce_mode row shopping reads as disabled; the setting turns it on.
  IF row.shopping_enabled THEN RAISE EXCEPTION 'Shopping enabled without a setting'; END IF;
  INSERT INTO public.site_settings(key,value) VALUES('ecommerce_mode','{"shoppingEnabled":true,"checkoutEnabled":true}');
  IF NOT (SELECT shopping_enabled FROM public.agent_catalog_products WHERE id=balm) THEN
    RAISE EXCEPTION 'shopping_enabled ignores ecommerce_mode'; END IF;
  UPDATE public.site_settings SET value='{"global":true,"brands":{}}' WHERE key='price_visibility';
  IF (SELECT price_kwd FROM public.agent_catalog_products WHERE id=balm) IS NOT NULL THEN
    RAISE EXCEPTION 'Global price hiding was ignored'; END IF;
  UPDATE public.site_settings SET value='{"global":false,"brands":{"abc":true}}' WHERE key='price_visibility';

  -- The heel balm is found in English and in Arabic, including by a different Arabic word for it.
  FOREACH query IN ARRAY ARRAY['heel balm','بلسم الكعب','كريم الكعب'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.agent_search_products(query) s WHERE s.id=balm AND s.score>=0.3) THEN
      RAISE EXCEPTION 'Search for % missed the heel balm',query; END IF;
  END LOOP;
  -- An exact SKU or slug, in any case, ranks first above every trigram score.
  SELECT s.id,s.score INTO first FROM public.agent_search_products('fx-kap-7') s LIMIT 1;
  IF first.id IS DISTINCT FROM juice OR first.score<=1 THEN RAISE EXCEPTION 'Exact SKU not first: %',first; END IF;
  SELECT s.id,s.score INTO first FROM public.agent_search_products('Fixture-Flexitol-Heel-Balm') s LIMIT 1;
  IF first.id IS DISTINCT FROM balm OR first.score<=1 THEN RAISE EXCEPTION 'Exact slug not first: %',first; END IF;
  -- Search rows carry the view's price hiding.
  IF (SELECT s.price_kwd FROM public.agent_search_products('Tea Tree Body Wash') s WHERE s.id=abc) IS NOT NULL THEN
    RAISE EXCEPTION 'Search exposed a hidden price'; END IF;
  -- A null, empty or blank query returns nothing; max_results is clamped to 1..25.
  IF EXISTS (SELECT 1 FROM public.agent_search_products(NULL)) OR EXISTS (SELECT 1 FROM public.agent_search_products(''))
      OR EXISTS (SELECT 1 FROM public.agent_search_products('   ')) THEN
    RAISE EXCEPTION 'A blank query returned rows'; END IF;
  SELECT count(*) INTO observed FROM public.agent_search_products('fixture',0);
  IF observed<>1 THEN RAISE EXCEPTION 'max_results 0 returned % rows',observed; END IF;

  -- Anonymous callers read the view and run the search, and cannot write the brand map or the view.
  SET LOCAL ROLE anon;
  IF (SELECT count(*) FROM public.agent_catalog_products WHERE id IN (abc,balm,juice))<>3
      OR (SELECT price_kwd FROM public.agent_catalog_products WHERE id=abc) IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public.agent_search_products('heel balm') s WHERE s.id=balm) THEN
    RAISE EXCEPTION 'anon cannot read the catalogue'; END IF;
  BEGIN
    INSERT INTO public.catalog_brands(key,slug,name_en,name_ar) VALUES('flexitol','x','x','x');
    RAISE EXCEPTION 'anon inserted a brand';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.catalog_brands SET slug='x' WHERE key='abc';
    RAISE EXCEPTION 'anon updated a brand';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.agent_catalog_products WHERE id=abc;
    RAISE EXCEPTION 'anon wrote through the view';
  -- Refused as not updatable before privileges are checked; the privilege checks below cover the grant.
  EXCEPTION WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN NULL; END;
  RESET ROLE;
  IF has_table_privilege('anon','public.catalog_brands','INSERT,UPDATE,DELETE')
      OR has_table_privilege('anon','public.agent_catalog_products','INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated','public.agent_catalog_products','INSERT,UPDATE,DELETE')
      OR NOT has_function_privilege('anon','public.agent_search_products(text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected catalogue privileges'; END IF;

  -- A signed-in customer's brand update matches no row; an administrator's goes through.
  PERFORM set_config('request.jwt.claim.sub','8c000000-0000-4000-8000-000000000002',true);
  PERFORM set_config('request.jwt.claims','{"sub":"8c000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  UPDATE public.catalog_brands SET name_en='Changed' WHERE key='abc';
  GET DIAGNOSTICS observed=ROW_COUNT;
  RESET ROLE;
  IF observed<>0 THEN RAISE EXCEPTION 'A customer changed the brand map'; END IF;
  PERFORM set_config('request.jwt.claim.sub','8c000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('request.jwt.claims','{"sub":"8c000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  UPDATE public.catalog_brands SET name_en='ABC' WHERE key='abc';
  GET DIAGNOSTICS observed=ROW_COUNT;
  RESET ROLE;
  IF observed<>1 THEN RAISE EXCEPTION 'An administrator could not update the brand map'; END IF;
END
$proof$;
ROLLBACK;
