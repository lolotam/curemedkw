-- Normalized synthetic GET observations; no native HTTP or booking occurs.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('8a000000-0000-4000-8000-000000000001','tracking-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('8a000000-0000-4000-8000-000000000001','admin');
SET LOCAL ROLE service_role;
SELECT public.integration_activate_payment_retention('8a000000-0000-4000-8000-000000000001');
RESET ROLE;
UPDATE public.integrations SET enabled=true,dispatch_mode='automatic_after_payment',configuration=jsonb_set(configuration,'{sandbox}',
  '{"appId":null,"serviceCode":"Next Day","autoConfirm":false,"pickupInstructions":"Synthetic call first",
    "origin":{"contactName":"Synthetic office","contactPhone":"+96550000002","address":{"countryCode":"KW",
      "governorate":"Hawally","area":"Hawally","block":"","street":"Synthetic street","building":"2","addressLine":""}},
    "parcel":{"count":1,"weightKg":1,"dimensionsCm":{"lengthCm":10,"widthCm":8,"heightCm":6}}}') WHERE provider='shipa';
INSERT INTO private.integration_credentials(integration_id,provider,environment,key_version,nonce,ciphertext,revision,updated_by)
  SELECT id,'shipa','sandbox',1,encode(decode(repeat('ab',12),'hex'),'base64'),encode(decode(repeat('cd',17),'hex'),'base64'),1,
    '8a000000-0000-4000-8000-000000000001' FROM public.integrations WHERE provider='shipa';
INSERT INTO public.site_settings(key,value) VALUES('ecommerce_mode','{"shoppingEnabled":true,"checkoutEnabled":true}')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
CREATE TEMP TABLE tracking_cases(label text PRIMARY KEY,order_id uuid,attempt_id uuid,status jsonb,shipment_id uuid);
INSERT INTO tracking_cases SELECT label,md5('tracking-order:'||label)::uuid,md5('tracking-attempt:'||label)::uuid,
  jsonb_build_object('invoice_id','tracking-invoice-'||label,'external_identifier',md5('tracking-order:'||label)::uuid,
    'transaction_payment_id','tracking-payment-'||label,'invoice_status','PAID','transaction_status','SUCCESS','details','{}'::jsonb),NULL
  FROM unnest(ARRAY['created','unknown']) label;
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,subtotal,total,payment_method)
  SELECT order_id,'Synthetic buyer','tracking@example.test','50000001','Hawally','Hawally','Synthetic street',20,20,'pay_by_link' FROM tracking_cases;
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id)
  SELECT attempt_id,order_id,20,'tracking-key-'||label,status->>'invoice_id' FROM tracking_cases;
INSERT INTO public.products(id,brand,name,price,sku,slug) VALUES
  ('8a000000-0000-4000-8000-000000000002','flexitol','Tracking item',10,'tracking-item','tracking-item');
INSERT INTO public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,line_total)
  SELECT order_id,'8a000000-0000-4000-8000-000000000002','Tracking item',2,10,20 FROM tracking_cases;
GRANT SELECT,UPDATE ON tracking_cases TO service_role;
CREATE TEMP TABLE tracking_receipts(label text PRIMARY KEY,document jsonb);
GRANT SELECT,INSERT,UPDATE ON tracking_receipts TO service_role;
SET LOCAL ROLE service_role;
DO $accepted_and_unknown$
DECLARE c record; claim jsonb; prepared jsonb; started jsonb;
BEGIN
  FOR c IN SELECT * FROM pg_temp.tracking_cases LOOP
    PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.status,'signed_webhook');
    claim:=public.wa_claim_pending_payment_verification(c.order_id,'8a000000-0000-4000-8000-000000000003');
    PERFORM public.wa_apply_verified_payment(c.order_id,c.attempt_id,c.status||jsonb_build_object('amount_millis',20000,
      'currency','KWD','pending_id',claim->'id','lease_token',claim->'lease_token'),'signed_webhook');
    prepared:=public.shipa_prepare_submission((public.shipa_enqueue_automatic(
      (public.wa_read_payment_owner(c.order_id)->>'outcome_id')::uuid)->>'shipment_id')::uuid);
    started:=public.shipa_begin_submission((prepared->>'shipment_id')::uuid,md5('tracking-token:'||c.label)::uuid,
      prepared-ARRAY['ready','shipment_id','integration_id','environment','draft']);
    UPDATE pg_temp.tracking_cases SET shipment_id=(prepared->>'shipment_id')::uuid WHERE label=c.label;
    PERFORM public.shipa_complete((prepared->>'shipment_id')::uuid,(started->>'attempt_token')::uuid,
      CASE c.label WHEN 'created' THEN '{"outcome":"accepted","shipaRef":"tracking-accepted","orderStatus":"Created"}'::jsonb
        ELSE '{"outcome":"uncertain","code":"timeout"}'::jsonb END);
  END LOOP;
END
$accepted_and_unknown$;
RESET ROLE;
CREATE TEMP TABLE tracking_before AS SELECT
  (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o) orders,
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY shipment_id) FROM private.shipa_submission_markers m) markers,
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.shipment_events e) events;
SET LOCAL ROLE service_role;
DO $tracking_and_fences$
DECLARE actor uuid:='8a000000-0000-4000-8000-000000000001'; shipment uuid; unknown_id uuid; context jsonb;
  observation jsonb; saved jsonb; invalid jsonb;
BEGIN
  SELECT shipment_id INTO shipment FROM pg_temp.tracking_cases WHERE label='created';
  SELECT shipment_id INTO unknown_id FROM pg_temp.tracking_cases WHERE label='unknown';
  IF public.shipa_read_tracking_snapshot(shipment,actor) IS NOT NULL THEN RAISE EXCEPTION 'Snapshot invented before provider observation'; END IF;
  context:=public.shipa_read_tracking_context(shipment,actor);
  IF context->>'environment'<>'sandbox' OR context->>'shipa_ref'<>'tracking-accepted'
    OR context::text ~ 'ciphertext|nonce|payload' THEN RAISE EXCEPTION 'Internal tracking context invalid or leaked secret/draft'; END IF;
  observation:=jsonb_build_object('shipaRef',context->'shipa_ref','customerRef',context->'customer_ref','status','In Transit',
    'story','[{"status":"Created","statusCode":"S1","date":1730000000},{"status":null,"statusCode":null,"date":null}]'::jsonb,
    'tracking','{"available":true,"location":{"latitude":29.33,"longitude":48.02},"eta":"10 minutes","duration":{"text":null,"value":600},"distance":null}'::jsonb);
  saved:=public.shipa_record_tracking_observation(shipment,(context->>'attempt_token')::uuid,(context->>'updated_at')::timestamptz,
    context->>'credential_fingerprint',observation,actor);
  IF saved->>'provider_status'<>'In Transit' OR saved#>>'{tracking,available}'<>'true'
    OR saved#>>'{story,0,date}'<>'1730000000' OR saved::text ~ 'credential|attempt_token|payload|customerRef|ciphertext|nonce' THEN
    RAISE EXCEPTION 'Safe tracking projection lost raw-unit history or leaked internal metadata'; END IF;
  INSERT INTO pg_temp.tracking_receipts VALUES('context',context),('observation',observation),('saved',saved);
  BEGIN
    PERFORM public.shipa_record_tracking_observation(shipment,(context->>'attempt_token')::uuid,(context->>'updated_at')::timestamptz,
      context->>'credential_fingerprint',observation,actor); RAISE EXCEPTION 'Stale response overwrote newer observation';
  EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'shipa_tracking_changed' THEN RAISE; END IF; END;
  context:=public.shipa_read_tracking_context(shipment,actor);
  BEGIN
    PERFORM public.shipa_record_tracking_observation(shipment,(context->>'attempt_token')::uuid,(context->>'updated_at')::timestamptz,
      context->>'credential_fingerprint',observation||'{"shipaRef":"another-reference"}',actor);
    RAISE EXCEPTION 'Different provider reference accepted';
  EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'shipa_tracking_reference_mismatch' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.shipa_record_tracking_observation(shipment,(context->>'attempt_token')::uuid,(context->>'updated_at')::timestamptz,
      context->>'credential_fingerprint',observation||'{"customerRef":"another-merchant-reference"}',actor);
    RAISE EXCEPTION 'Different merchant reference accepted';
  EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'shipa_tracking_reference_mismatch' THEN RAISE; END IF; END;
  FOR invalid IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    observation||'{"apiKey":"fake"}',jsonb_set(observation,'{tracking,location,latitude}','91'),
    jsonb_set(observation,'{tracking,location,longitude}','181'),jsonb_set(observation,'{tracking,eta}','true'),
    jsonb_set(observation,'{tracking,duration,value}','1.5'),jsonb_set(observation,'{story,0,date}','"invented-units"'),
    jsonb_set(observation,'{status}',to_jsonb(E'bad\nstatus'::text)),
    jsonb_set(observation,'{story}',(SELECT jsonb_agg('{"status":null,"statusCode":null,"date":null}'::jsonb) FROM generate_series(1,2001))))) LOOP
    BEGIN
      PERFORM public.shipa_record_tracking_observation(shipment,(context->>'attempt_token')::uuid,(context->>'updated_at')::timestamptz,
        context->>'credential_fingerprint',invalid,actor); RAISE EXCEPTION 'Malformed tracking accepted';
    EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM<>'shipa_invalid_tracking_observation' THEN RAISE; END IF; END;
  END LOOP;
  IF public.shipa_read_tracking_snapshot(shipment,actor) IS DISTINCT FROM saved THEN RAISE EXCEPTION 'Rejected observation erased last good snapshot'; END IF;
  BEGIN PERFORM public.shipa_read_tracking_context(unknown_id,actor); RAISE EXCEPTION 'Unknown obtained ordinary tracking context';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN IF SQLERRM<>'shipa_tracking_requires_created' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.shipa_record_tracking_observation(unknown_id,md5('tracking-token:unknown')::uuid,now(),
      context->>'credential_fingerprint',observation,actor); RAISE EXCEPTION 'Tracking reclassified unknown';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN IF SQLERRM<>'shipa_tracking_requires_created' THEN RAISE; END IF; END;
  BEGIN PERFORM public.shipa_read_tracking_snapshot(shipment,'8a000000-0000-4000-8000-000000000099'); RAISE EXCEPTION 'Forged SQL actor accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$tracking_and_fences$;
RESET ROLE;
-- Existing-booking tracking remains readable under hold, disabled settings and
-- a different active environment; it cannot create or resubmit anything.
UPDATE public.integrations SET enabled=false,environment='live' WHERE provider='shipa';
UPDATE public.site_settings SET value='{"shoppingEnabled":false,"checkoutEnabled":false}' WHERE key='ecommerce_mode';
SET LOCAL ROLE service_role;
DO $historical_and_unavailable_position$
DECLARE actor uuid:='8a000000-0000-4000-8000-000000000001'; context jsonb; observation jsonb; saved jsonb;
BEGIN
  context:=public.shipa_read_tracking_context((SELECT shipment_id FROM pg_temp.tracking_cases WHERE label='created'),actor);
  observation:=(SELECT document FROM pg_temp.tracking_receipts WHERE label='observation')||'{"status":null,"story":[],"tracking":{"available":false}}';
  saved:=public.shipa_record_tracking_observation((context->>'shipment_id')::uuid,(context->>'attempt_token')::uuid,
    (context->>'updated_at')::timestamptz,context->>'credential_fingerprint',observation,actor);
  IF saved->'provider_status'<>'null'::jsonb OR saved->'tracking'<>'{"available":false}'::jsonb THEN
    RAISE EXCEPTION 'Unavailable live position was fabricated or treated as booking failure'; END IF;
  UPDATE pg_temp.tracking_receipts SET document=context WHERE label='context';
  UPDATE pg_temp.tracking_receipts SET document=saved WHERE label='saved';
END
$historical_and_unavailable_position$;
RESET ROLE;
UPDATE private.integration_credentials SET ciphertext=encode(decode(repeat('ef',17),'hex'),'base64') WHERE environment='sandbox';
SET LOCAL ROLE service_role;
DO $key_rotation_refuses_old_result$
DECLARE actor uuid:='8a000000-0000-4000-8000-000000000001'; context jsonb;
BEGIN
  context:=public.shipa_read_tracking_context((SELECT shipment_id FROM pg_temp.tracking_cases WHERE label='created'),actor);
  BEGIN
    PERFORM public.shipa_record_tracking_observation((context->>'shipment_id')::uuid,(context->>'attempt_token')::uuid,
      (context->>'updated_at')::timestamptz,(SELECT document->>'credential_fingerprint' FROM pg_temp.tracking_receipts WHERE label='context'),
      (SELECT document FROM pg_temp.tracking_receipts WHERE label='observation'),actor);
    RAISE EXCEPTION 'Rotated-key response accepted';
  EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'shipa_tracking_key_changed' THEN RAISE; END IF; END;
END
$key_rotation_refuses_old_result$;
RESET ROLE;
DO $durable_state_and_privileges$
BEGIN
  IF (SELECT orders FROM tracking_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o)
    OR (SELECT markers FROM tracking_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(m) ORDER BY shipment_id) FROM private.shipa_submission_markers m)
    OR (SELECT events FROM tracking_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.shipment_events e)
    OR NOT EXISTS(SELECT 1 FROM public.shipments WHERE state='unknown' AND attempt_count=1 AND retry_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.shipments WHERE state='created' AND provider_status='In Transit' AND attempt_count=1)
    OR has_table_privilege('service_role','private.shipa_tracking_snapshots','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'Tracking altered payment/booking ownership, acceptance, markers, audit or direct table privileges'; END IF;
END
$durable_state_and_privileges$;
SET LOCAL ROLE authenticated;
DO $browser_denied$
BEGIN
  BEGIN PERFORM public.shipa_read_tracking_snapshot(NULL,NULL); RAISE EXCEPTION 'Browser called tracking RPC';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$browser_denied$;
RESET ROLE;
ROLLBACK;
