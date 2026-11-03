-- Actual SQL begin/expiry/late-result proof. Synthetic ciphertext is presence
-- metadata only; no key decryption, native booking or runtime readiness claim.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('86000000-0000-4000-8000-000000000001','submission-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('86000000-0000-4000-8000-000000000001','admin');
SET LOCAL ROLE service_role;
SELECT public.integration_activate_payment_retention('86000000-0000-4000-8000-000000000001');
RESET ROLE;
CREATE TEMP TABLE submission_cases(label text PRIMARY KEY,order_id uuid,attempt_id uuid,status jsonb);
INSERT INTO submission_cases SELECT label,md5('submission-order:'||label)::uuid,md5('submission-attempt:'||label)::uuid,
  jsonb_build_object('invoice_id','submission-invoice-'||label,'external_identifier',md5('submission-order:'||label)::uuid,
    'transaction_payment_id','submission-payment-'||label,'invoice_status','PAID','transaction_status','SUCCESS','details','{}'::jsonb)
FROM unnest(ARRAY['accepted','lost-response','credential','input','hold','manual','manual-stale','items','payload','duplicate-token','ledger-reset','catalog']) label;
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,street,building,subtotal,total,payment_method)
SELECT order_id,'Synthetic buyer','buyer@example.test','50000001','Hawally','Hawally','','Synthetic street','2',20,20,'pay_by_link' FROM submission_cases;
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id)
SELECT attempt_id,order_id,20,'submission-key-'||label,status->>'invoice_id' FROM submission_cases;
INSERT INTO public.products(id,brand,name,price,sku,slug)
SELECT md5('submission-product:'||label)::uuid,'flexitol','Synthetic item',10,'submission-item-'||label,'submission-item-'||label FROM submission_cases;
INSERT INTO public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,line_total)
SELECT order_id,md5('submission-product:'||label)::uuid,'Synthetic item',2,10,20 FROM submission_cases;
UPDATE public.integrations SET enabled=true,dispatch_mode='automatic_after_payment',configuration=jsonb_set(configuration,'{sandbox}',
  '{"appId":null,"serviceCode":"Next Day","autoConfirm":false,"pickupInstructions":"Synthetic call first, 09:00-16:00",
    "origin":{"contactName":"Synthetic office","contactPhone":"+96550000002","address":{"countryCode":"KW",
      "governorate":"Hawally","area":"Hawally","block":"","street":"Synthetic office street","building":"2","addressLine":""}},
    "parcel":{"count":1,"weightKg":1,"dimensionsCm":{"lengthCm":10,"widthCm":8,"heightCm":6}}}') WHERE provider='shipa';
INSERT INTO private.integration_credentials(integration_id,environment,provider,key_version,nonce,ciphertext,revision,updated_by)
SELECT id,'sandbox','shipa',1,encode(decode(repeat('ab',12),'hex'),'base64'),encode(decode(repeat('cd',17),'hex'),'base64'),1,
  '86000000-0000-4000-8000-000000000001' FROM public.integrations WHERE provider='shipa';
INSERT INTO public.site_settings(key,value) VALUES('ecommerce_mode','{"shoppingEnabled":true,"checkoutEnabled":true}')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
GRANT SELECT ON submission_cases TO service_role;
CREATE TEMP TABLE submission_receipts(label text PRIMARY KEY,document jsonb);
GRANT SELECT,INSERT ON submission_receipts TO service_role;
SET LOCAL ROLE service_role;
DO $paid_intents$
DECLARE c record; claim jsonb;
BEGIN
  FOR c IN SELECT * FROM pg_temp.submission_cases LOOP
    PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.status,'signed_webhook');
    claim:=public.wa_claim_pending_payment_verification(c.order_id,'86000000-0000-4000-8000-000000000002');
    PERFORM public.wa_apply_verified_payment(c.order_id,c.attempt_id,c.status||jsonb_build_object('amount_millis',20000,
      'currency','KWD','pending_id',claim->'id','lease_token',claim->'lease_token'),'signed_webhook');
    INSERT INTO pg_temp.submission_receipts SELECT c.label,public.shipa_prepare_submission(
      (public.shipa_enqueue_automatic((public.wa_read_payment_owner(c.order_id)->>'outcome_id')::uuid)->>'shipment_id')::uuid);
  END LOOP;
END
$paid_intents$;
RESET ROLE;
DO $preparation_and_privileges$
DECLARE signature text;
BEGIN
  IF EXISTS(SELECT 1 FROM submission_receipts WHERE document->>'ready' IS DISTINCT FROM 'true')
    OR EXISTS(SELECT 1 FROM private.shipa_submission_markers)
    OR EXISTS(SELECT 1 FROM public.shipments WHERE state<>'queued' OR attempt_count<>0 OR attempt_token IS NOT NULL) THEN
    RAISE EXCEPTION 'Preparation issued send authority or failed valid synthetic data';
  END IF;
  IF has_table_privilege('service_role','private.shipa_submission_markers','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_function_privilege('authenticated','public.shipa_begin_submission(uuid,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Direct writes/browser obtained permanent marker authority';
  END IF;
  FOR signature IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.proname LIKE 'shipa_%' LOOP
    IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'Private helper execution leaked'; END IF;
  END LOOP;
END
$preparation_and_privileges$;
SET LOCAL ROLE anon;
DO $browser_denied$
BEGIN
  BEGIN
    PERFORM public.shipa_prepare_submission('86000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'Browser obtained private preparation payload';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$browser_denied$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $payload_and_acceptance$
DECLARE prepared jsonb; request jsonb; started jsonb; second jsonb; credential jsonb;
BEGIN
  SELECT document INTO prepared FROM pg_temp.submission_receipts WHERE label='payload';
  request:=prepared-ARRAY['ready','shipment_id','integration_id','environment','draft'];
  BEGIN
    PERFORM public.shipa_begin_submission((prepared->>'shipment_id')::uuid,gen_random_uuid(),
      request||'{"credential_fingerprint":"short"}');
    RAISE EXCEPTION 'Malformed preparation metadata was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM<>'shipa_invalid_prepared_request' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.shipa_begin_submission((prepared->>'shipment_id')::uuid,gen_random_uuid(),
      jsonb_set(request,'{payload,destination,options,amountToCollect}','1'));
    RAISE EXCEPTION 'Payload changed after SQL preparation was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM<>'shipa_prepared_payload_mismatch' THEN RAISE; END IF;
  END;
  SELECT document INTO prepared FROM pg_temp.submission_receipts WHERE label='accepted';
  credential:=public.shipa_read_credential((prepared->>'integration_id')::uuid,'sandbox');
  IF credential->'credential_fingerprint' IS DISTINCT FROM prepared->'credential_fingerprint'
    OR credential->'credential_revision' IS DISTINCT FROM prepared->'credential_revision' THEN
    RAISE EXCEPTION 'Worker credential loader lost its exact key binding';
  END IF;
  request:=prepared-ARRAY['ready','shipment_id','integration_id','environment','draft'];
  started:=public.shipa_begin_submission((prepared->>'shipment_id')::uuid,'86000000-0000-4000-8000-000000000003',request);
  IF started->>'ready' IS DISTINCT FROM 'true' OR started->'payload' IS DISTINCT FROM prepared->'payload'
    OR (started->>'lease_expires_at')::timestamptz NOT BETWEEN clock_timestamp()+interval '44 seconds' AND clock_timestamp()+interval '46 seconds'
    OR started#>>'{payload,destination,options,amountToCollect}' IS DISTINCT FROM '0'
    OR started#>>'{payload,origin,address}' IS DISTINCT FROM 'Synthetic office street, 2' THEN
    RAISE EXCEPTION 'Begin lost immutable payload/lease, prepaid amount or provided structured address';
  END IF;
  INSERT INTO pg_temp.submission_receipts VALUES('started',started);
  second:=public.shipa_begin_submission((prepared->>'shipment_id')::uuid,'86000000-0000-4000-8000-000000000003',request);
  IF second->>'ready' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Repeated begin reauthorized HTTP'; END IF;
  PERFORM public.shipa_complete((prepared->>'shipment_id')::uuid,'86000000-0000-4000-8000-000000000003',
    '{"outcome":"accepted","shipaRef":"SB-submission-accepted","orderStatus":"Created"}');
  SELECT document INTO prepared FROM pg_temp.submission_receipts WHERE label='duplicate-token';
  BEGIN
    PERFORM public.shipa_begin_submission((prepared->>'shipment_id')::uuid,'86000000-0000-4000-8000-000000000003',
      prepared-ARRAY['ready','shipment_id','integration_id','environment','draft']);
    RAISE EXCEPTION 'An attempt identity was shared across shipments';
  EXCEPTION WHEN serialization_failure THEN
    IF SQLERRM<>'shipa_submission_marker_conflict' THEN RAISE; END IF;
  END;
END
$payload_and_acceptance$;
DO $lost_response_and_ledger$
DECLARE prepared jsonb; started jsonb;
BEGIN
  FOREACH prepared IN ARRAY ARRAY[
    (SELECT document FROM pg_temp.submission_receipts WHERE label='lost-response'),
    (SELECT document FROM pg_temp.submission_receipts WHERE label='ledger-reset')] LOOP
    started:=public.shipa_begin_submission((prepared->>'shipment_id')::uuid,gen_random_uuid(),
      prepared-ARRAY['ready','shipment_id','integration_id','environment','draft']);
    IF started->>'ready' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Initial durable marker was not created'; END IF;
  END LOOP;
END
$lost_response_and_ledger$;
RESET ROLE;
UPDATE public.shipments SET lease_expires_at=clock_timestamp()-interval '1 second'
  WHERE order_id=(SELECT order_id FROM submission_cases WHERE label='lost-response');
UPDATE public.shipments SET state='queued',attempt_count=0,attempt_token=NULL,submitted_at=NULL,payload=NULL,payload_hash=NULL,
  integration_revision=NULL,credential_fingerprint=NULL,lease_expires_at=NULL
  WHERE order_id=(SELECT order_id FROM submission_cases WHERE label='ledger-reset');
SET LOCAL ROLE service_role;
DO $expired_and_erased_display_fields$
DECLARE prepared jsonb; summary jsonb; started jsonb; ordered uuid; request jsonb;
BEGIN
  SELECT document INTO prepared FROM pg_temp.submission_receipts WHERE label='lost-response';
  PERFORM public.shipa_expire_leases((prepared->>'shipment_id')::uuid);
  summary:=public.shipa_read_shipment((prepared->>'shipment_id')::uuid,'86000000-0000-4000-8000-000000000001');
  IF summary->>'state' IS DISTINCT FROM 'unknown' OR public.shipa_prepare_submission((prepared->>'shipment_id')::uuid)->>'ready'
    IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Lost HTTP/begin response became new creation authority'; END IF;
  EXECUTE 'RESET ROLE';
  SELECT attempt_token INTO ordered FROM private.shipa_submission_markers WHERE shipment_id=(prepared->>'shipment_id')::uuid;
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM public.shipa_complete((prepared->>'shipment_id')::uuid,ordered,
    '{"outcome":"accepted","shipaRef":"SB-late-accepted","orderStatus":null}');
  SELECT document INTO prepared FROM pg_temp.submission_receipts WHERE label='ledger-reset';
  IF public.shipa_begin_submission((prepared->>'shipment_id')::uuid,gen_random_uuid(),
    prepared-ARRAY['ready','shipment_id','integration_id','environment','draft'])->>'ready' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Reset display/context fields erased permanent dispatch evidence';
  END IF;
END
$expired_and_erased_display_fields$;
RESET ROLE;
UPDATE public.site_settings SET value='{"shoppingEnabled":false,"checkoutEnabled":true}' WHERE key='ecommerce_mode';
SET LOCAL ROLE service_role;
DO $hold$
DECLARE prepared jsonb;
BEGIN
  SELECT document INTO prepared FROM pg_temp.submission_receipts WHERE label='hold';
  BEGIN
    PERFORM public.shipa_begin_submission((prepared->>'shipment_id')::uuid,gen_random_uuid(),prepared-ARRAY['ready','shipment_id','integration_id','environment','draft']);
    RAISE EXCEPTION 'New submission bypassed Ministry hold';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'shipa_ordering_disabled' THEN RAISE; END IF;
  END;
END
$hold$;
RESET ROLE;
UPDATE public.site_settings SET value='{"shoppingEnabled":true,"checkoutEnabled":true}' WHERE key='ecommerce_mode';
UPDATE public.orders SET customer_name='Changed valid name' WHERE id=(SELECT order_id FROM submission_cases WHERE label='input');
UPDATE public.products SET price=11 WHERE id=md5('submission-product:catalog')::uuid;
UPDATE public.order_items SET product_id=md5('submission-product:payload')::uuid
  WHERE order_id=(SELECT order_id FROM submission_cases WHERE label='items');
UPDATE private.integration_credentials SET ciphertext=encode(decode(repeat('ef',17),'hex'),'base64') WHERE environment='sandbox';
SET LOCAL ROLE service_role;
DO $loaded_key_fingerprint$
DECLARE previous jsonb; prepared jsonb; request jsonb; summary jsonb;
BEGIN
  SELECT document INTO previous FROM pg_temp.submission_receipts WHERE label='credential';
  prepared:=public.shipa_prepare_submission((previous->>'shipment_id')::uuid);
  IF prepared->>'ready' IS DISTINCT FROM 'true' OR prepared->'credential_fingerprint'=previous->'credential_fingerprint' THEN
    RAISE EXCEPTION 'Ciphertext change with reused revision escaped key binding';
  END IF;
  request:=jsonb_set(prepared-ARRAY['ready','shipment_id','integration_id','environment','draft'],'{credential_fingerprint}',previous->'credential_fingerprint');
  summary:=public.shipa_begin_submission((prepared->>'shipment_id')::uuid,gen_random_uuid(),request);
  IF summary->>'ready' IS DISTINCT FROM 'false' OR summary->>'code' IS DISTINCT FROM 'prepared_inputs_changed' THEN
    RAISE EXCEPTION 'Previously loaded key was silently substituted during begin';
  END IF;
END
$loaded_key_fingerprint$;
RESET ROLE;
UPDATE private.integration_credentials SET ciphertext=encode(decode(repeat('cd',17),'hex'),'base64') WHERE environment='sandbox';
SET LOCAL ROLE service_role;
DO $input_and_catalog_races$
DECLARE prepared jsonb; v_label text; summary jsonb;
BEGIN
  FOREACH v_label IN ARRAY ARRAY['input','items','catalog'] LOOP
    SELECT document INTO prepared FROM pg_temp.submission_receipts WHERE label=v_label;
    summary:=public.shipa_begin_submission((prepared->>'shipment_id')::uuid,gen_random_uuid(),prepared-ARRAY['ready','shipment_id','integration_id','environment','draft']);
    IF summary->>'ready' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Changed inputs crossed the begin fence'; END IF;
  END LOOP;
END
$input_and_catalog_races$;
RESET ROLE;
UPDATE public.products SET price=11 WHERE id IN (md5('submission-product:manual')::uuid,md5('submission-product:manual-stale')::uuid);
SET LOCAL ROLE service_role;
DO $explicit_price_review$
DECLARE c record; integrity jsonb; request jsonb; shipment_id uuid;
BEGIN
  FOR c IN SELECT * FROM pg_temp.submission_cases WHERE label IN ('manual','manual-stale') LOOP
    integrity:=public.shipa_check_integrity(c.order_id,'{"environment":"sandbox"}');
    request:=jsonb_build_object('environment','sandbox','overrides','{}'::jsonb,'expectedSettingsRevision',0,
      'expectedInputFingerprint',integrity->'input_fingerprint','reviewReason','Honor the original paid price',
      'acknowledgePricing',true,'packedConfirmed',true);
    shipment_id:=(public.shipa_request_manual(c.order_id,request,'86000000-0000-4000-8000-000000000001')->>'shipment_id')::uuid;
    INSERT INTO pg_temp.submission_receipts VALUES('reviewed-'||c.label,public.shipa_prepare_submission(shipment_id));
  END LOOP;
END
$explicit_price_review$;
RESET ROLE;
UPDATE public.products SET price=12 WHERE id=md5('submission-product:manual-stale')::uuid;
SET LOCAL ROLE service_role;
DO $manual_review_is_fingerprint_bound$
DECLARE prepared jsonb; summary jsonb;
BEGIN
  SELECT document INTO prepared FROM pg_temp.submission_receipts WHERE label='reviewed-manual';
  summary:=public.shipa_begin_submission((prepared->>'shipment_id')::uuid,gen_random_uuid(),prepared-ARRAY['ready','shipment_id','integration_id','environment','draft']);
  IF summary->>'ready' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Explicit matching price review did not permit manual begin'; END IF;
  SELECT document INTO prepared FROM pg_temp.submission_receipts WHERE label='reviewed-manual-stale';
  summary:=public.shipa_begin_submission((prepared->>'shipment_id')::uuid,gen_random_uuid(),prepared-ARRAY['ready','shipment_id','integration_id','environment','draft']);
  IF summary->>'ready' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Changed catalog reused an old pricing acknowledgement'; END IF;
END
$manual_review_is_fingerprint_bound$;
RESET ROLE;
DO $durability$
BEGIN
  IF (SELECT count(*) FROM private.shipa_submission_markers)<>4
    OR (SELECT count(*) FROM public.shipments WHERE state='created')<>2
    OR EXISTS(SELECT 1 FROM public.shipments WHERE attempt_count>1)
    OR EXISTS(SELECT 1 FROM public.shipments shipment JOIN submission_cases cases ON cases.order_id=shipment.order_id
      WHERE cases.label IN ('payload','duplicate-token','credential','input','items','catalog','hold','manual-stale') AND shipment.attempt_count<>0) THEN
    RAISE EXCEPTION 'Failed begin created a marker, erased history, or authorized another attempt';
  END IF;
END
$durability$;
ROLLBACK;
