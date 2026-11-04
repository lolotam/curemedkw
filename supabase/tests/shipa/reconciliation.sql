-- Positive detail is synthetic, but owner/receipt/intent/begin/result SQL is real.
-- No native HTTP, no new booking and no negative-lookup retry authority.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('8b000000-0000-4000-8000-000000000001','reconcile-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('8b000000-0000-4000-8000-000000000001','admin');
SET LOCAL ROLE service_role;
SELECT public.integration_activate_payment_retention('8b000000-0000-4000-8000-000000000001');
RESET ROLE;
UPDATE public.integrations SET enabled=true,dispatch_mode='automatic_after_payment',configuration=jsonb_set(configuration,'{sandbox}',
  '{"appId":null,"serviceCode":"Next Day","autoConfirm":false,"pickupInstructions":"Synthetic call first",
    "origin":{"contactName":"Synthetic office","contactPhone":"+96550000002","address":{"countryCode":"KW",
      "governorate":"Hawally","area":"Hawally","block":"","street":"Synthetic street","building":"2","addressLine":""}},
    "parcel":{"count":1,"weightKg":1,"dimensionsCm":{"lengthCm":10,"widthCm":8,"heightCm":6}}}') WHERE provider='shipa';
INSERT INTO private.integration_credentials(integration_id,provider,environment,key_version,nonce,ciphertext,revision,updated_by)
  SELECT id,'shipa','sandbox',1,encode(decode(repeat('ab',12),'hex'),'base64'),encode(decode(repeat('cd',17),'hex'),'base64'),1,
    '8b000000-0000-4000-8000-000000000001' FROM public.integrations WHERE provider='shipa';
INSERT INTO public.site_settings(key,value) VALUES('ecommerce_mode','{"shoppingEnabled":true,"checkoutEnabled":true}')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
CREATE TEMP TABLE reconciliation_cases(label text PRIMARY KEY,order_id uuid,attempt_id uuid,status jsonb,shipment_id uuid);
INSERT INTO reconciliation_cases SELECT label,md5('reconcile-order:'||label)::uuid,md5('reconcile-attempt:'||label)::uuid,
  jsonb_build_object('invoice_id','reconcile-invoice-'||label,'external_identifier',md5('reconcile-order:'||label)::uuid,
    'transaction_payment_id','reconcile-payment-'||label,'invoice_status','PAID','transaction_status','SUCCESS','details','{}'::jsonb),NULL
  FROM unnest(ARRAY['matching','identity','collision','active','marker','key']) label;
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,subtotal,total,payment_method)
  SELECT order_id,'Synthetic buyer','reconcile@example.test','50000001','Hawally','Hawally','Synthetic street',20,20,'pay_by_link' FROM reconciliation_cases;
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id)
  SELECT attempt_id,order_id,20,'reconcile-key-'||label,status->>'invoice_id' FROM reconciliation_cases;
INSERT INTO public.products(id,brand,name,price,sku,slug) VALUES
  ('8b000000-0000-4000-8000-000000000002','flexitol','Reconciliation item',10,'reconcile-item','reconcile-item');
INSERT INTO public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,line_total)
  SELECT order_id,'8b000000-0000-4000-8000-000000000002','Reconciliation item',2,10,20 FROM reconciliation_cases;
GRANT SELECT,UPDATE ON reconciliation_cases TO service_role;
CREATE TEMP TABLE reconciliation_receipts(label text PRIMARY KEY,context jsonb,detail jsonb);
GRANT SELECT,INSERT,UPDATE ON reconciliation_receipts TO service_role;
SET LOCAL ROLE service_role;
DO $possible_bookings$
DECLARE c record; claim jsonb; prepared jsonb;
BEGIN
  FOR c IN SELECT * FROM pg_temp.reconciliation_cases LOOP
    PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.status,'signed_webhook');
    claim:=public.wa_claim_pending_payment_verification(c.order_id,'8b000000-0000-4000-8000-000000000003');
    PERFORM public.wa_apply_verified_payment(c.order_id,c.attempt_id,c.status||jsonb_build_object('amount_millis',20000,
      'currency','KWD','pending_id',claim->'id','lease_token',claim->'lease_token'),'signed_webhook');
    prepared:=public.shipa_prepare_submission((public.shipa_enqueue_automatic(
      (public.wa_read_payment_owner(c.order_id)->>'outcome_id')::uuid)->>'shipment_id')::uuid);
    PERFORM public.shipa_begin_submission((prepared->>'shipment_id')::uuid,md5('reconcile-token:'||c.label)::uuid,
      prepared-ARRAY['ready','shipment_id','integration_id','environment','draft']);
    UPDATE pg_temp.reconciliation_cases SET shipment_id=(prepared->>'shipment_id')::uuid WHERE label=c.label;
    IF c.label<>'active' THEN
      PERFORM public.shipa_complete((prepared->>'shipment_id')::uuid,md5('reconcile-token:'||c.label)::uuid,
        '{"outcome":"uncertain","code":"timeout"}');
    END IF;
  END LOOP;
END
$possible_bookings$;
RESET ROLE;
CREATE TEMP TABLE reconciliation_before AS SELECT
  (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o) orders,
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY shipment_id) FROM private.shipa_submission_markers m) markers;
-- Explicit normalized positive identity facts, independent of the SQL matcher.
INSERT INTO reconciliation_receipts SELECT c.label,NULL,jsonb_build_object('shipaRef','recovered-'||c.label,
  'customerRef',s.customer_ref,'status','Created','type','Delivery','category','Next Day',
  'origin','{"contactName":"Synthetic office","city":"Hawally","country":"KWT"}'::jsonb,
  'destination','{"contactName":"Synthetic buyer","city":"Hawally","country":"KWT"}'::jsonb,
  'packages',jsonb_build_array(jsonb_build_object('customerRef',s.customer_ref||'-1','name','CureMed order',
    'weight',1,'length',10,'width',8,'height',6))) FROM reconciliation_cases c JOIN public.shipments s ON s.id=c.shipment_id;
SET LOCAL ROLE service_role;
DO $matching_and_negative_boundaries$
<<checked>>
DECLARE actor uuid:='8b000000-0000-4000-8000-000000000001'; c record; context jsonb; detail jsonb; result jsonb; invalid jsonb;
BEGIN
  FOR c IN SELECT * FROM pg_temp.reconciliation_cases WHERE label<>'active' LOOP
    context:=public.shipa_read_reconciliation_context(c.shipment_id,actor);
    IF context->>'state'<>'unknown' OR context::text ~ 'ciphertext|nonce|payload' THEN RAISE EXCEPTION 'Context invented authority or exposed a request/secret'; END IF;
    UPDATE pg_temp.reconciliation_receipts SET context=checked.context WHERE label=c.label;
  END LOOP;
  SELECT r.context,r.detail INTO context,detail FROM pg_temp.reconciliation_receipts r WHERE label='identity';
  FOR invalid IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    detail||'{"customerRef":"foreign-reference"}',jsonb_set(detail,'{origin,city}','"Kuwait City"'),
    jsonb_set(detail,'{destination,contactName}','"Someone else"'),jsonb_set(detail,'{packages,0,weight}','2'),
    jsonb_set(detail,'{packages,0,customerRef}','"foreign-parcel"'),detail||'{"category":"Same Day"}',
    jsonb_set(detail,'{packages,0,name}',to_jsonb(repeat('N',200))))) LOOP
    BEGIN
      PERFORM public.shipa_apply_reconciled_detail((context->>'shipment_id')::uuid,(context->>'attempt_token')::uuid,
        (context->>'updated_at')::timestamptz,context->>'credential_fingerprint',invalid,actor);
      RAISE EXCEPTION 'Matching customer reference alone or changed frozen facts resolved unknown';
    EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'shipa_reconciliation_facts_mismatch' THEN RAISE; END IF; END;
  END LOOP;
  FOR invalid IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    detail-'shipaRef',detail||'{"shipaRef":null}',detail||'{"shipaRef":""}',detail||'{"api_key":"fake"}',
    detail||'{"found":false}',jsonb_set(detail,'{destination,country}','"ARE"'),jsonb_set(detail,'{packages,0,weight}','null'),
    jsonb_set(detail,'{packages,0,name}',to_jsonb(repeat('N',201))))) LOOP
    BEGIN
      PERFORM public.shipa_apply_reconciled_detail((context->>'shipment_id')::uuid,(context->>'attempt_token')::uuid,
        (context->>'updated_at')::timestamptz,context->>'credential_fingerprint',invalid,actor); RAISE EXCEPTION 'Miss/incomplete/foreign-country/raw detail accepted';
    EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM<>'shipa_invalid_reconciliation_detail' THEN RAISE; END IF; END;
  END LOOP;
  SELECT r.context,r.detail INTO context,detail FROM pg_temp.reconciliation_receipts r WHERE label='matching';
  BEGIN
    PERFORM public.shipa_apply_reconciled_detail((context->>'shipment_id')::uuid,'8b000000-0000-4000-8000-000000000099',
      (context->>'updated_at')::timestamptz,context->>'credential_fingerprint',detail,actor); RAISE EXCEPTION 'Foreign attempt resolved unknown';
  EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'shipa_reconciliation_changed' THEN RAISE; END IF; END;
  result:=public.shipa_apply_reconciled_detail((context->>'shipment_id')::uuid,(context->>'attempt_token')::uuid,
    (context->>'updated_at')::timestamptz,context->>'credential_fingerprint',detail,actor);
  IF result->>'state'<>'created' OR result->>'shipa_ref'<>'recovered-matching' OR result->>'attempt_count'<>'1'
    OR result::text ~ 'fingerprint|payload|attempt_token|ciphertext|nonce' THEN RAISE EXCEPTION 'Positive match failed or exposed internal proof'; END IF;
  IF public.shipa_apply_reconciled_detail((context->>'shipment_id')::uuid,(context->>'attempt_token')::uuid,
    (context->>'updated_at')::timestamptz,context->>'credential_fingerprint',detail,actor)->>'changed'<>'false' THEN
    RAISE EXCEPTION 'Reconciliation replay changed the accepted booking'; END IF;
  result:=public.shipa_apply_reconciled_detail((context->>'shipment_id')::uuid,(context->>'attempt_token')::uuid,
    (context->>'updated_at')::timestamptz,context->>'credential_fingerprint',detail||'{"shipaRef":"different-reference"}',actor);
  IF result->>'shipa_ref'<>'recovered-matching' OR result->>'conflict'<>'true' THEN RAISE EXCEPTION 'Known accepted reference was overwritten'; END IF;
  SELECT r.context,r.detail INTO context,detail FROM pg_temp.reconciliation_receipts r WHERE label='collision';
  result:=public.shipa_apply_reconciled_detail((context->>'shipment_id')::uuid,(context->>'attempt_token')::uuid,
    (context->>'updated_at')::timestamptz,context->>'credential_fingerprint',detail||'{"shipaRef":"recovered-matching"}',actor);
  IF result->>'state'<>'unknown' OR result->>'last_error_code'<>'remote_reference_conflict' OR result->>'retry_at' IS NOT NULL THEN
    RAISE EXCEPTION 'Another shipment remote reference authorized duplicate ownership or retry'; END IF;
  context:=public.shipa_read_reconciliation_context((context->>'shipment_id')::uuid,actor);
  result:=public.shipa_apply_reconciled_detail((context->>'shipment_id')::uuid,(context->>'attempt_token')::uuid,
    (context->>'updated_at')::timestamptz,context->>'credential_fingerprint',detail,actor);
  IF result->>'state'<>'created' OR result->>'attempt_count'<>'1' THEN RAISE EXCEPTION 'Corrected positive lookup required a new attempt'; END IF;
END
$matching_and_negative_boundaries$;
RESET ROLE;
-- Corrupting the public copy cannot replace the permanent submitted hash.
UPDATE public.shipments SET payload=jsonb_set(payload,'{packages,0,weight}','2')
  WHERE id=(SELECT shipment_id FROM reconciliation_cases WHERE label='marker');
SET LOCAL ROLE service_role;
DO $marker_and_active_attempt$
DECLARE actor uuid:='8b000000-0000-4000-8000-000000000001'; target uuid;
BEGIN
  SELECT shipment_id INTO target FROM pg_temp.reconciliation_cases WHERE label='marker';
  BEGIN PERFORM public.shipa_read_reconciliation_context(target,actor); RAISE EXCEPTION 'Changed payload replaced the durable request';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN IF SQLERRM<>'shipa_reconciliation_marker_mismatch' THEN RAISE; END IF; END;
  SELECT shipment_id INTO target FROM pg_temp.reconciliation_cases WHERE label='active';
  BEGIN PERFORM public.shipa_read_reconciliation_context(target,actor); RAISE EXCEPTION 'Active submission treated as expired';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN IF SQLERRM<>'shipa_reconciliation_requires_unknown' THEN RAISE; END IF; END;
END
$marker_and_active_attempt$;
RESET ROLE;
UPDATE public.shipments SET lease_expires_at=clock_timestamp()-interval '1 second'
  WHERE id=(SELECT shipment_id FROM reconciliation_cases WHERE label='active');
UPDATE public.integrations SET enabled=false,environment='live' WHERE provider='shipa';
UPDATE public.site_settings SET value='{"shoppingEnabled":false,"checkoutEnabled":false}' WHERE key='ecommerce_mode';
SET LOCAL ROLE service_role;
DO $expiry_under_hold$
DECLARE context jsonb;
BEGIN
  context:=public.shipa_read_reconciliation_context((SELECT shipment_id FROM pg_temp.reconciliation_cases WHERE label='active'),
    '8b000000-0000-4000-8000-000000000001');
  IF context->>'state'<>'unknown' OR context->>'environment'<>'sandbox' THEN RAISE EXCEPTION 'Hold/environment switch hid recovery or rebound its credential'; END IF;
END
$expiry_under_hold$;
RESET ROLE;
UPDATE private.integration_credentials SET ciphertext=encode(decode(repeat('ef',17),'hex'),'base64') WHERE environment='sandbox';
SET LOCAL ROLE service_role;
DO $original_key_and_actor$
DECLARE actor uuid:='8b000000-0000-4000-8000-000000000001'; context jsonb; detail jsonb;
BEGIN
  SELECT r.context,r.detail INTO context,detail FROM pg_temp.reconciliation_receipts r WHERE label='key';
  BEGIN
    PERFORM public.shipa_apply_reconciled_detail((context->>'shipment_id')::uuid,(context->>'attempt_token')::uuid,
      (context->>'updated_at')::timestamptz,context->>'credential_fingerprint',detail,actor); RAISE EXCEPTION 'A replacement merchant credential adopted an unknown booking';
  EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'shipa_reconciliation_key_changed' THEN RAISE; END IF; END;
  BEGIN PERFORM public.shipa_read_reconciliation_context((context->>'shipment_id')::uuid,actor); RAISE EXCEPTION 'Original key mismatch was ignored';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN IF SQLERRM<>'shipa_reconciliation_original_key_unavailable' THEN RAISE; END IF; END;
  BEGIN PERFORM public.shipa_read_reconciliation_context((context->>'shipment_id')::uuid,'8b000000-0000-4000-8000-000000000099'); RAISE EXCEPTION 'Forged SQL actor accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$original_key_and_actor$;
RESET ROLE;
DO $durable_ownership_and_privileges$
BEGIN
  IF (SELECT orders FROM reconciliation_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o)
    OR (SELECT markers FROM reconciliation_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(m) ORDER BY shipment_id) FROM private.shipa_submission_markers m)
    OR (SELECT count(*) FROM private.shipa_reconciliation_proofs)<>3
    OR (SELECT count(*) FROM private.shipa_reconciliation_proofs WHERE disposition='accepted')<>2
    OR EXISTS(SELECT 1 FROM public.shipments WHERE attempt_count<>1 OR retry_count<>0 OR retry_at IS NOT NULL OR state='queued')
    OR (SELECT count(*) FROM public.shipment_events WHERE event_type='reconciled')<>2
    OR (SELECT count(*) FROM public.shipment_events WHERE event_type='lease_expired')<>1
    OR has_table_privilege('service_role','private.shipa_reconciliation_proofs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'Reconciliation changed payment/attempt ownership, duplicated evidence or granted retry/direct write'; END IF;
END
$durable_ownership_and_privileges$;
SET LOCAL ROLE authenticated;
DO $browser_denied$
BEGIN
  BEGIN PERFORM public.shipa_read_reconciliation_context(NULL,NULL); RAISE EXCEPTION 'Browser obtained internal reconciliation context';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$browser_denied$;
RESET ROLE;
ROLLBACK;
