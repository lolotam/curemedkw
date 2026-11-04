-- Real persisted values and role boundaries, never mocked SQL or payment proof.
BEGIN;
INSERT INTO public.products(id,brand,name,price,sku,slug) VALUES
  ('81000000-0000-4000-8000-000000000001','flexitol','Synthetic item',10,'shipa-integrity-fixture','shipa-integrity-fixture');
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,
  subtotal,total,payment_method) VALUES
  ('81000000-0000-4000-8000-000000000002','Synthetic buyer','buyer@example.test','50000001',
    'Hawally','Hawally','Synthetic street, building 2',20,20,'pay_by_link');
INSERT INTO public.order_items(id,order_id,product_id,product_name_snapshot,quantity,unit_price,line_total) VALUES
  ('81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001','Synthetic item',2,10,20);
UPDATE public.integrations SET configuration=jsonb_set(configuration,'{sandbox}',jsonb_build_object(
  'appId',NULL,'serviceCode','Next Day','autoConfirm',false,'pickupInstructions','Call before collection',
  'origin',jsonb_build_object('contactName','Synthetic office','contactPhone','+96550000001',
    'address',jsonb_build_object('countryCode','KW','governorate','Hawally','area','Hawally',
      'block','','street','','building','','addressLine','Synthetic office address')),
  'parcel',jsonb_build_object('count',1,'weightKg',1,'dimensionsCm',jsonb_build_object('lengthCm',10,'widthCm',8,'heightCm',6))))
  WHERE provider='shipa';
CREATE TEMP TABLE shipa_integrity_receipts(label text PRIMARY KEY,summary jsonb);
GRANT SELECT,INSERT ON shipa_integrity_receipts TO service_role;

DO $grants$
BEGIN
  IF has_function_privilege('anon','public.shipa_check_integrity(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.shipa_check_integrity(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('service_role','private.shipa_kuwait_phone(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Integrity object inherited permissive browser/helper grants';
  END IF;
END
$grants$;
SET LOCAL ROLE anon;
DO $denied$
BEGIN
  BEGIN
    PERFORM public.shipa_check_integrity('81000000-0000-4000-8000-000000000002','{"environment":"sandbox"}');
    RAISE EXCEPTION 'Browser obtained integrity authority';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$denied$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $valid$
DECLARE v_summary jsonb; v_second jsonb; v_request jsonb;
BEGIN
  v_summary:=public.shipa_check_integrity('81000000-0000-4000-8000-000000000002','{"environment":"sandbox"}');
  v_second:=public.shipa_check_integrity('81000000-0000-4000-8000-000000000002','{"environment":"sandbox"}');
  IF v_summary->>'accepted' IS DISTINCT FROM 'true' OR v_summary->'reasons'<>'[]'::jsonb
    OR v_summary->>'input_fingerprint' IS DISTINCT FROM v_second->>'input_fingerprint'
    OR v_summary->>'input_fingerprint' !~ '^[a-f0-9]{64}$'
    OR v_summary-ARRAY['accepted','reasons','input_fingerprint','settings_revision']<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Valid stable input failed or leaked raw snapshots';
  END IF;
  INSERT INTO pg_temp.shipa_integrity_receipts VALUES('baseline',v_summary);
  FOREACH v_request IN ARRAY ARRAY[
    '{"environment":"sandbox","trusted_payment":true}'::jsonb,
    '{"environment":"sandbox","overrides":{"price":1}}'::jsonb,
    '{"environment":"sandbox","overrides":{"destination":{"paid":true}}}'::jsonb,
    '{"environment":"sandbox","overrides":null}'::jsonb,
    '{"environment":"other"}'::jsonb] LOOP
    BEGIN
      PERFORM public.shipa_check_integrity('81000000-0000-4000-8000-000000000002',v_request);
      RAISE EXCEPTION 'Review supplied authority or invalid shape';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  v_second:=public.shipa_check_integrity('81000000-0000-4000-8000-000000000002',
    '{"environment":"sandbox","overrides":{"destination":{"addressLine":"Reviewed alternate address"}}}');
  IF v_second->>'accepted'<>'true' OR v_second->>'input_fingerprint'=v_summary->>'input_fingerprint' THEN
    RAISE EXCEPTION 'Permitted address correction escaped fingerprint';
  END IF;
END
$valid$;
RESET ROLE;

UPDATE public.products SET price=12 WHERE id='81000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
DO $catalog$
DECLARE v_summary jsonb;
BEGIN
  v_summary:=public.shipa_check_integrity('81000000-0000-4000-8000-000000000002','{"environment":"sandbox"}');
  IF v_summary->>'accepted'<>'false' OR NOT (v_summary->'reasons' ? 'catalog_price_mismatch')
    OR v_summary->>'input_fingerprint'=(SELECT summary->>'input_fingerprint' FROM pg_temp.shipa_integrity_receipts WHERE label='baseline') THEN
    RAISE EXCEPTION 'Catalog change preserved an old review or repriced the order';
  END IF;
END
$catalog$;
RESET ROLE;
UPDATE public.products SET price=10 WHERE id='81000000-0000-4000-8000-000000000001';
INSERT INTO public.coupons(id,code,discount_type,discount_value,max_uses,used_count) VALUES
  ('81000000-0000-4000-8000-000000000004','SHIPAFIXTURE','percent',12.345,5,1);
UPDATE public.orders SET coupon_code='SHIPAFIXTURE',discount_amount=2.469,total=17.531
  WHERE id='81000000-0000-4000-8000-000000000002';
SET LOCAL ROLE service_role;
DO $coupon$
DECLARE v_summary jsonb;
BEGIN
  v_summary:=public.shipa_check_integrity('81000000-0000-4000-8000-000000000002','{"environment":"sandbox"}');
  IF v_summary->>'accepted'<>'true' THEN RAISE EXCEPTION 'Three-decimal coupon formula drifted'; END IF;
  INSERT INTO pg_temp.shipa_integrity_receipts VALUES('coupon',v_summary);
END
$coupon$;
RESET ROLE;
UPDATE public.coupons SET used_count=5 WHERE code='SHIPAFIXTURE';
SET LOCAL ROLE service_role;
DO $coupon_limit$
DECLARE v_summary jsonb;
BEGIN
  v_summary:=public.shipa_check_integrity('81000000-0000-4000-8000-000000000002','{"environment":"sandbox"}');
  IF v_summary->>'accepted'<>'false' OR NOT (v_summary->'reasons' ? 'coupon_requires_review')
    OR v_summary->>'input_fingerprint'=(SELECT summary->>'input_fingerprint' FROM pg_temp.shipa_integrity_receipts WHERE label='coupon') THEN
    RAISE EXCEPTION 'Exhausted coupon bypassed conservative review';
  END IF;
END
$coupon_limit$;
RESET ROLE;
UPDATE public.coupons SET used_count=1,expires_at=now()-interval '1 second' WHERE code='SHIPAFIXTURE';
SET LOCAL ROLE service_role;
DO $coupon_expiry$
BEGIN
  IF NOT (public.shipa_check_integrity('81000000-0000-4000-8000-000000000002',
    '{"environment":"sandbox"}')->'reasons' ? 'coupon_requires_review') THEN
    RAISE EXCEPTION 'Expired coupon bypassed review';
  END IF;
END
$coupon_expiry$;
RESET ROLE;

UPDATE public.orders SET coupon_code='MISSING_CODE_A' WHERE id='81000000-0000-4000-8000-000000000002';
SET LOCAL ROLE service_role;
INSERT INTO pg_temp.shipa_integrity_receipts SELECT 'missing_coupon',
  public.shipa_check_integrity('81000000-0000-4000-8000-000000000002','{"environment":"sandbox"}');
RESET ROLE;
UPDATE public.orders SET coupon_code='MISSING_CODE_B' WHERE id='81000000-0000-4000-8000-000000000002';
SET LOCAL ROLE service_role;
DO $missing_coupon$
DECLARE v_summary jsonb;
BEGIN
  v_summary:=public.shipa_check_integrity('81000000-0000-4000-8000-000000000002','{"environment":"sandbox"}');
  IF NOT (v_summary->'reasons' ? 'coupon_requires_review') OR v_summary->>'input_fingerprint'=
    (SELECT summary->>'input_fingerprint' FROM pg_temp.shipa_integrity_receipts WHERE label='missing_coupon') THEN
    RAISE EXCEPTION 'Different missing coupon preserved a prior review fingerprint';
  END IF;
END
$missing_coupon$;
RESET ROLE;

UPDATE public.orders SET coupon_code=NULL,discount_amount=0,total=20
  WHERE id='81000000-0000-4000-8000-000000000002';
INSERT INTO private.integration_credentials(integration_id,environment,provider,key_version,nonce,ciphertext,revision,updated_by)
  SELECT id,'sandbox','shipa',1,encode(decode(repeat('ab',12),'hex'),'base64'),
    encode(decode(repeat('cd',17),'hex'),'base64'),1,'81000000-0000-4000-8000-000000000005'
    FROM public.integrations WHERE provider='shipa';
SET LOCAL ROLE service_role;
INSERT INTO pg_temp.shipa_integrity_receipts SELECT 'credential',
  public.shipa_check_integrity('81000000-0000-4000-8000-000000000002','{"environment":"sandbox"}');
RESET ROLE;
UPDATE private.integration_credentials SET ciphertext=encode(decode(repeat('ef',17),'hex'),'base64')
  WHERE provider='shipa' AND environment='sandbox';
SET LOCAL ROLE service_role;
DO $credential_binding$
DECLARE v_summary jsonb;
BEGIN
  v_summary:=public.shipa_check_integrity('81000000-0000-4000-8000-000000000002','{"environment":"sandbox"}');
  IF v_summary->>'input_fingerprint'=(SELECT summary->>'input_fingerprint'
    FROM pg_temp.shipa_integrity_receipts WHERE label='credential') THEN
    RAISE EXCEPTION 'Exact encrypted envelope change escaped review fingerprint';
  END IF;
  v_summary:=public.shipa_check_integrity('81000000-0000-4000-8000-000000000002',
    '{"environment":"sandbox","overrides":{"destination":{"contactPhone":"٥٠٠٠٠٠٠١"}}}');
  IF v_summary->>'accepted'<>'true' THEN RAISE EXCEPTION 'Arabic digit Kuwait contact rejected'; END IF;
END
$credential_binding$;
RESET ROLE;

UPDATE public.orders SET coupon_code=NULL,discount_amount=0,total=20,customer_phone='invalid-phone'
  WHERE id='81000000-0000-4000-8000-000000000002';
UPDATE public.order_items SET line_total=19 WHERE id='81000000-0000-4000-8000-000000000003';
SET LOCAL ROLE service_role;
DO $tamper$
DECLARE v_summary jsonb;
BEGIN
  v_summary:=public.shipa_check_integrity('81000000-0000-4000-8000-000000000002','{"environment":"sandbox"}');
  IF v_summary->>'accepted'<>'false' OR NOT (v_summary->'reasons' ?& ARRAY['destination_incomplete','item_total_mismatch','subtotal_mismatch']) THEN
    RAISE EXCEPTION 'Address/item tampering escaped integrity';
  END IF;
END
$tamper$;
RESET ROLE;
DO $unchanged$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id='81000000-0000-4000-8000-000000000002'
    AND subtotal=20 AND total=20 AND payment_status='pending' AND address_line='Synthetic street, building 2'
    AND customer_phone='invalid-phone') OR EXISTS(SELECT 1 FROM public.shipments)
    OR EXISTS(SELECT 1 FROM private.order_payment_verifications) THEN
    RAISE EXCEPTION 'Integrity mutated billing/payment or created dispatch evidence';
  END IF;
END
$unchanged$;
ROLLBACK;
\echo Shipa persisted integrity, coupon review, override fingerprint and role proofs passed
