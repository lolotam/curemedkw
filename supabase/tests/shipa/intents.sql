-- Actual receipts and atomic intent/adoption on a disposable fixture only.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('85000000-0000-4000-8000-000000000001','intent-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('85000000-0000-4000-8000-000000000001','admin');
SET LOCAL ROLE service_role;
SELECT public.integration_activate_payment_retention('85000000-0000-4000-8000-000000000001');
RESET ROLE;
CREATE TEMP TABLE intent_cases(label text PRIMARY KEY,order_id uuid,attempt_id uuid,status jsonb);
INSERT INTO intent_cases SELECT label,md5('intent-order:'||label)::uuid,md5('intent-attempt:'||label)::uuid,
  jsonb_build_object('invoice_id','intent-invoice-'||label,'external_identifier',md5('intent-order:'||label)::uuid,
    'transaction_payment_id','intent-payment-'||label,'invoice_status','PAID','transaction_status','SUCCESS','details','{}'::jsonb)
FROM unnest(ARRAY['manual','automatic','bad-address','no-proof','items-changed']) label;
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,street,building,
  subtotal,total,payment_method)
SELECT order_id,'Synthetic buyer','buyer@example.test','50000001','Hawally','Hawally','','Synthetic street','2',20,20,'pay_by_link'
FROM intent_cases;
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id)
SELECT attempt_id,order_id,20,'intent-key-'||label,status->>'invoice_id' FROM intent_cases;
INSERT INTO public.products(id,brand,name,price,sku,slug) VALUES
  ('85000000-0000-4000-8000-000000000002','flexitol','Synthetic original item',10,'intent-item','intent-item'),
  ('85000000-0000-4000-8000-000000000003','flexitol','Synthetic replacement item',10,'intent-other-item','intent-other-item');
INSERT INTO public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,line_total)
SELECT order_id,'85000000-0000-4000-8000-000000000002','Synthetic original item',2,10,20 FROM intent_cases;
UPDATE public.orders SET customer_name=repeat('x',1001) WHERE id=(SELECT order_id FROM intent_cases WHERE label='bad-address');
UPDATE public.orders SET payment_status='paid' WHERE id=(SELECT order_id FROM intent_cases WHERE label='no-proof');
UPDATE public.integrations SET enabled=true,configuration=jsonb_set(configuration,'{sandbox}',
  '{"appId":null,"serviceCode":"Next Day","autoConfirm":false,"pickupInstructions":"Synthetic call first",
    "origin":{"contactName":"Synthetic office","contactPhone":"+96550000002","address":{"countryCode":"KW",
      "governorate":"Hawally","area":"Hawally","block":"","street":"Synthetic street","building":"2","addressLine":""}},
    "parcel":{"count":1,"weightKg":1,"dimensionsCm":{"lengthCm":10,"widthCm":8,"heightCm":6}}}') WHERE provider='shipa';
INSERT INTO public.site_settings(key,value) VALUES('ecommerce_mode','{"shoppingEnabled":false,"checkoutEnabled":true}')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
GRANT SELECT ON intent_cases TO service_role;
CREATE TEMP TABLE intent_receipts(label text PRIMARY KEY,document jsonb);
GRANT SELECT,INSERT ON intent_receipts TO service_role;
SET LOCAL ROLE service_role;
DO $first_manual_policy$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM pg_temp.intent_cases WHERE label='manual';
  PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.status,'signed_webhook');
END
$first_manual_policy$;
RESET ROLE;
UPDATE public.integrations SET dispatch_mode='automatic_after_payment' WHERE provider='shipa';
SET LOCAL ROLE service_role;
DO $first_automatic_policy$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM pg_temp.intent_cases WHERE label NOT IN ('manual','no-proof') LOOP
    PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.status,'signed_webhook');
  END LOOP;
END
$first_automatic_policy$;
RESET ROLE;
UPDATE public.order_items SET product_id='85000000-0000-4000-8000-000000000003',product_name_snapshot='Synthetic replacement item'
  WHERE order_id=(SELECT order_id FROM intent_cases WHERE label='items-changed');
SET LOCAL ROLE service_role;
DO $strict_receipts_enqueue_atomically$
DECLARE c record; claim jsonb; verified jsonb;
BEGIN
  FOR c IN SELECT * FROM pg_temp.intent_cases WHERE label<>'no-proof' LOOP
    claim:=public.wa_claim_pending_payment_verification(c.order_id,'85000000-0000-4000-8000-000000000004');
    verified:=c.status||jsonb_build_object('amount_millis',20000,'currency','KWD','pending_id',claim->'id','lease_token',claim->'lease_token');
    PERFORM public.wa_apply_verified_payment(c.order_id,c.attempt_id,verified,'signed_webhook');
    PERFORM public.wa_apply_verified_payment(c.order_id,c.attempt_id,verified,'signed_webhook');
  END LOOP;
END
$strict_receipts_enqueue_atomically$;
RESET ROLE;
DO $queue_policy$
DECLARE signature text;
BEGIN
  IF (SELECT count(*) FROM public.shipments)<>3 OR EXISTS(SELECT 1 FROM public.shipments
    WHERE order_id=(SELECT order_id FROM intent_cases WHERE label='manual')) THEN
    RAISE EXCEPTION 'Strict replay duplicated an intent or mode switch backfilled a manual payment';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.shipments WHERE order_id=(SELECT order_id FROM intent_cases WHERE label='automatic')
    AND state='queued' AND source='automatic' AND attempt_count=0 AND attempt_token IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.shipments WHERE order_id=(SELECT order_id FROM intent_cases WHERE label='bad-address')
      AND state='needs_review' AND attempt_count=0)
    OR NOT EXISTS(SELECT 1 FROM public.shipments WHERE order_id=(SELECT order_id FROM intent_cases WHERE label='items-changed')
      AND state='needs_review' AND last_error_code='paid_items_changed') THEN
    RAISE EXCEPTION 'Address normalization or immutable paid items escaped queue review';
  END IF;
  IF EXISTS(SELECT 1 FROM public.orders WHERE payment_status<>'paid') THEN
    RAISE EXCEPTION 'Invalid Shipa delivery data rolled back signed paid status';
  END IF;
  IF has_function_privilege('authenticated','public.shipa_request_manual(uuid,jsonb,uuid)','EXECUTE')
    OR has_table_privilege('service_role','private.shipa_reviews','INSERT') THEN
    RAISE EXCEPTION 'Browser/direct service writes obtained staff-review authority';
  END IF;
  FOREACH signature IN ARRAY ARRAY['private.shipa_require_paid_receipt(public.orders)',
    'private.shipa_paid_items_match(uuid)','private.shipa_has_possible_dispatch(public.shipments)',
    'private.shipa_require_ordering_open()','private.shipa_review_request(jsonb)',
    'private.shipa_require_reviewable_integrity(jsonb,jsonb)','private.shipa_adopt_review(public.orders,public.integrations,jsonb,uuid)'] LOOP
    IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR has_function_privilege('service_role',signature,'EXECUTE') THEN
      RAISE EXCEPTION 'Intent helper inherited permissive default execution';
    END IF;
  END LOOP;
END
$queue_policy$;
SET LOCAL ROLE anon;
DO $browser_denied$
BEGIN
  BEGIN
    PERFORM public.shipa_enqueue_automatic('85000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'Browser obtained automatic intent ownership';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$browser_denied$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $hold_and_missing_proof$
DECLARE c record; integrity jsonb; request jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.intent_cases WHERE label='automatic';
  integrity:=public.shipa_check_integrity(c.order_id,'{"environment":"sandbox"}');
  request:=jsonb_build_object('environment','sandbox','overrides','{}'::jsonb,'expectedSettingsRevision',0,
    'expectedInputFingerprint',integrity->'input_fingerprint','reviewReason','Packed and checked',
    'acknowledgePricing',false,'packedConfirmed',true);
  BEGIN
    PERFORM public.shipa_request_manual(c.order_id,request,'85000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'Unverified admin UUID obtained staff-review authority';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.shipa_request_manual(c.order_id,request,'85000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Manual booking request bypassed the Ministry ordering hold';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'shipa_ordering_disabled' THEN RAISE; END IF;
  END;
  INSERT INTO pg_temp.intent_receipts VALUES('automatic-request',request);
END
$hold_and_missing_proof$;
RESET ROLE;
UPDATE public.site_settings SET value='{"shoppingEnabled":true,"checkoutEnabled":true}' WHERE key='ecommerce_mode';
SET LOCAL ROLE service_role;
DO $manual_adoption_and_replay$
DECLARE c record; request jsonb; first_result jsonb; replay jsonb; original jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.intent_cases WHERE label='automatic';
  SELECT document INTO request FROM pg_temp.intent_receipts WHERE label='automatic-request';
  original:=public.shipa_enqueue_automatic((public.wa_read_payment_owner(c.order_id)->>'outcome_id')::uuid);
  first_result:=public.shipa_request_manual(c.order_id,request,'85000000-0000-4000-8000-000000000001');
  replay:=public.shipa_request_manual(c.order_id,request,'85000000-0000-4000-8000-000000000001');
  IF first_result->'shipment_id' IS DISTINCT FROM original->'shipment_id' OR first_result->>'changed' IS DISTINCT FROM 'true'
    OR replay->>'changed' IS DISTINCT FROM 'false' OR replay->'shipment_id' IS DISTINCT FROM first_result->'shipment_id' THEN
    RAISE EXCEPTION 'Manual adoption or repeated click recreated an existing intent';
  END IF;
  INSERT INTO pg_temp.intent_receipts VALUES('adopted',first_result);
  SELECT * INTO c FROM pg_temp.intent_cases WHERE label='no-proof';
  BEGIN
    PERFORM public.shipa_request_manual(c.order_id,request,'85000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Browser/admin marked-paid field minted a shipping receipt';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'shipa_verified_paid_receipt_required' THEN RAISE; END IF;
  END;
  SELECT * INTO c FROM pg_temp.intent_cases WHERE label='manual';
  IF public.shipa_enqueue_automatic((public.wa_read_payment_owner(c.order_id)->>'outcome_id')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'Later automatic mode manufactured historical work';
  END IF;
END
$manual_adoption_and_replay$;
RESET ROLE;
UPDATE public.products SET price=11 WHERE id='85000000-0000-4000-8000-000000000002';
SET LOCAL ROLE service_role;
DO $pricing_acknowledgement$
DECLARE c record; integrity jsonb; request jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.intent_cases WHERE label='automatic';
  SELECT document INTO request FROM pg_temp.intent_receipts WHERE label='automatic-request';
  BEGIN
    PERFORM public.shipa_request_manual(c.order_id,request,'85000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Changed catalog reused stale staff fingerprint';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  SELECT * INTO c FROM pg_temp.intent_cases WHERE label='manual';
  integrity:=public.shipa_check_integrity(c.order_id,'{"environment":"sandbox"}');
  request:=jsonb_build_object('environment','sandbox','overrides','{}'::jsonb,'expectedSettingsRevision',0,
    'expectedInputFingerprint',integrity->'input_fingerprint','reviewReason','Honor the original paid catalog price',
    'acknowledgePricing',false,'packedConfirmed',true);
  BEGIN
    PERFORM public.shipa_request_manual(c.order_id,request,'85000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Unacknowledged current catalog mismatch was submitted for booking';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'shipa_integrity_requires_correction' THEN RAISE; END IF;
  END;
  PERFORM public.shipa_request_manual(c.order_id,request||'{"acknowledgePricing":true}','85000000-0000-4000-8000-000000000001');
  SELECT * INTO c FROM pg_temp.intent_cases WHERE label='items-changed';
  integrity:=public.shipa_check_integrity(c.order_id,'{"environment":"sandbox"}');
  request:=jsonb_set(request||'{"acknowledgePricing":true}','{expectedInputFingerprint}',integrity->'input_fingerprint');
  BEGIN
    PERFORM public.shipa_request_manual(c.order_id,request,'85000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Staff pricing flag overrode changed paid items';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'shipa_paid_items_changed' THEN RAISE; END IF;
  END;
END
$pricing_acknowledgement$;
RESET ROLE;
-- Simulate retained submission context, then a corrupted display state. A later
-- local review must still refuse to create again from this possible dispatch.
UPDATE public.shipments SET state='needs_review',attempt_count=1,attempt_token=(gen_random_uuid()),submitted_at=now(),
  payload='{}',payload_hash=repeat('a',64) WHERE order_id=(SELECT order_id FROM intent_cases WHERE label='manual');
SET LOCAL ROLE service_role;
DO $possible_dispatch_stays_blocked$
DECLARE c record; integrity jsonb; request jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.intent_cases WHERE label='manual';
  integrity:=public.shipa_check_integrity(c.order_id,'{"environment":"sandbox"}');
  request:=jsonb_build_object('environment','sandbox','overrides','{}'::jsonb,'expectedSettingsRevision',0,
    'expectedInputFingerprint',integrity->'input_fingerprint','reviewReason','A later local review',
    'acknowledgePricing',true,'packedConfirmed',true);
  BEGIN
    PERFORM public.shipa_request_manual(c.order_id,request,'85000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'needs_review plus local validation erased possible dispatch evidence';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'shipa_possible_dispatch_requires_reconciliation' THEN RAISE; END IF;
  END;
END
$possible_dispatch_stays_blocked$;
RESET ROLE;
DO $audit_and_billing$
BEGIN
  IF (SELECT count(*) FROM private.shipa_reviews)<>2 OR (SELECT count(*) FROM public.shipments)<>4
    OR EXISTS(SELECT 1 FROM public.orders WHERE subtotal<>20 OR total<>20)
    OR NOT EXISTS(SELECT 1 FROM private.shipa_reviews WHERE pricing_acknowledged AND reason='Honor the original paid catalog price') THEN
    RAISE EXCEPTION 'Review replay duplicated audit, mutated billing, or lost explicit acknowledgement';
  END IF;
END
$audit_and_billing$;
ROLLBACK;
