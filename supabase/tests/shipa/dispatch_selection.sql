-- Disposable synthetic payment/intent setup; no HTTP or provider bookings.
-- Selection/binding are service-only reads, not claims or send authorization.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('89000000-0000-4000-8000-000000000001','selection-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('89000000-0000-4000-8000-000000000001','admin');
SET LOCAL ROLE service_role;
SELECT public.integration_activate_payment_retention('89000000-0000-4000-8000-000000000001');
RESET ROLE;
UPDATE public.integrations SET enabled=true,dispatch_mode='automatic_after_payment',environment='sandbox',
  configuration=jsonb_set(configuration,'{sandbox}',
  '{"appId":null,"serviceCode":"Next Day","autoConfirm":false,"pickupInstructions":"Synthetic call first",
    "origin":{"contactName":"Synthetic office","contactPhone":"+96550000002","address":{"countryCode":"KW",
      "governorate":"Hawally","area":"Hawally","block":"","street":"Synthetic street","building":"2","addressLine":""}},
    "parcel":{"count":1,"weightKg":1,"dimensionsCm":{"lengthCm":10,"widthCm":8,"heightCm":6}}}') WHERE provider='shipa';
INSERT INTO public.site_settings(key,value) VALUES('ecommerce_mode','{"shoppingEnabled":true,"checkoutEnabled":true}')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO private.integration_credentials(integration_id,provider,environment,key_version,nonce,ciphertext,revision,updated_by)
  SELECT id,'shipa','sandbox',1,encode(decode(repeat('ab',12),'hex'),'base64'),encode(decode(repeat('cd',17),'hex'),'base64'),1,
    '89000000-0000-4000-8000-000000000001'
  FROM public.integrations WHERE provider='shipa';
CREATE TEMP TABLE selection_cases(label text PRIMARY KEY,order_id uuid,attempt_id uuid,status jsonb);
INSERT INTO selection_cases SELECT label,md5('selection-order:'||label)::uuid,md5('selection-attempt:'||label)::uuid,
  jsonb_build_object('invoice_id','selection-invoice-'||label,'external_identifier',md5('selection-order:'||label)::uuid,
    'transaction_payment_id','selection-payment-'||label,'invoice_status','PAID','transaction_status','SUCCESS','details','{}'::jsonb)
FROM unnest(ARRAY['a-manual','b-auto','c-auto','d-auto','e-future','f-oldenv','g-cancelled','h-refunded',
  'i-delivered','j-unpaid','k-receipt-mismatch','l-total-changed','m-unknown','n-unreviewed','o-review','p-marker']) label;
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,subtotal,total,payment_method)
  SELECT order_id,'Synthetic buyer','selection@example.test','50000001','Hawally','Hawally','Synthetic street',20,20,'pay_by_link'
  FROM selection_cases;
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id)
  SELECT attempt_id,order_id,20,'selection-key-'||label,status->>'invoice_id' FROM selection_cases;
INSERT INTO public.products(id,brand,name,price,sku,slug)
  VALUES('89000000-0000-4000-8000-000000000002','flexitol','Selection item',10,'selection-item','selection-item');
INSERT INTO public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,line_total)
  SELECT order_id,'89000000-0000-4000-8000-000000000002','Selection item',2,10,20 FROM selection_cases;
GRANT SELECT ON selection_cases TO service_role;
SET LOCAL ROLE service_role;
DO $paid_intents$
DECLARE c record; claim jsonb; integrity jsonb; prepared jsonb;
BEGIN
  FOR c IN SELECT * FROM pg_temp.selection_cases LOOP
    PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.status,'signed_webhook');
    claim:=public.wa_claim_pending_payment_verification(c.order_id,'89000000-0000-4000-8000-000000000003');
    PERFORM public.wa_apply_verified_payment(c.order_id,c.attempt_id,c.status||jsonb_build_object('amount_millis',20000,
      'currency','KWD','pending_id',claim->'id','lease_token',claim->'lease_token'),'signed_webhook');
  END LOOP;
  SELECT * INTO c FROM pg_temp.selection_cases WHERE label='a-manual';
  integrity:=public.shipa_check_integrity(c.order_id,'{"environment":"sandbox"}');
  PERFORM public.shipa_request_manual(c.order_id,jsonb_build_object('environment','sandbox','overrides','{}'::jsonb,
    'expectedSettingsRevision',integrity->'settings_revision','expectedInputFingerprint',integrity->'input_fingerprint',
    'reviewReason','Synthetic packed confirmation','acknowledgePricing',false,'packedConfirmed',true),
    '89000000-0000-4000-8000-000000000001');
  FOR c IN SELECT * FROM pg_temp.selection_cases WHERE label IN ('m-unknown','p-marker') LOOP
    prepared:=public.shipa_prepare_submission((public.shipa_enqueue_automatic(
      (public.wa_read_payment_owner(c.order_id)->>'outcome_id')::uuid)->>'shipment_id')::uuid);
    PERFORM public.shipa_begin_submission((prepared->>'shipment_id')::uuid,md5('selection-token:'||c.label)::uuid,
      prepared-ARRAY['ready','shipment_id','integration_id','environment','draft']);
    IF c.label='m-unknown' THEN
      PERFORM public.shipa_complete((prepared->>'shipment_id')::uuid,md5('selection-token:'||c.label)::uuid,
        '{"outcome":"uncertain","code":"timeout"}');
    END IF;
  END LOOP;
END
$paid_intents$;
RESET ROLE;
ALTER TABLE selection_cases ADD COLUMN shipment_id uuid;
UPDATE selection_cases c SET shipment_id=s.id FROM public.shipments s WHERE s.order_id=c.order_id;
UPDATE public.shipments SET created_at='2000-01-01';
UPDATE public.shipments s SET created_at='2021-01-01'::timestamptz+
  (CASE c.label WHEN 'a-manual' THEN 0 WHEN 'b-auto' THEN 1 WHEN 'c-auto' THEN 2 ELSE 3 END)*interval '1 day'
  FROM selection_cases c WHERE c.order_id=s.order_id AND c.label IN ('a-manual','b-auto','c-auto','d-auto');
UPDATE public.shipments SET retry_at=now()+interval '1 hour' WHERE order_id=(SELECT order_id FROM selection_cases WHERE label='e-future');
UPDATE public.shipments SET environment='live' WHERE order_id=(SELECT order_id FROM selection_cases WHERE label='f-oldenv');
UPDATE public.orders SET order_status='cancelled' WHERE id=(SELECT order_id FROM selection_cases WHERE label='g-cancelled');
UPDATE public.orders SET payment_status='refunded' WHERE id=(SELECT order_id FROM selection_cases WHERE label='h-refunded');
UPDATE public.orders SET order_status='delivered' WHERE id=(SELECT order_id FROM selection_cases WHERE label='i-delivered');
UPDATE public.orders SET payment_status='pending' WHERE id=(SELECT order_id FROM selection_cases WHERE label='j-unpaid');
UPDATE private.order_payment_verifications SET amount_millis=21000 WHERE order_id=(SELECT order_id FROM selection_cases WHERE label='k-receipt-mismatch');
UPDATE public.orders SET total=21 WHERE id=(SELECT order_id FROM selection_cases WHERE label='l-total-changed');
UPDATE public.shipments SET source='manual' WHERE order_id=(SELECT order_id FROM selection_cases WHERE label='n-unreviewed');
UPDATE public.shipments SET state='needs_review' WHERE order_id=(SELECT order_id FROM selection_cases WHERE label='o-review');
-- A display-state/reset bug cannot erase the private permanent marker.
UPDATE public.shipments SET state='queued',attempt_count=0,attempt_token=NULL,submitted_at=NULL,payload=NULL,
  payload_hash=NULL,lease_expires_at=NULL,integration_revision=NULL,credential_fingerprint=NULL
  WHERE order_id=(SELECT order_id FROM selection_cases WHERE label='p-marker');
CREATE TEMP TABLE selection_before AS SELECT
  (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.shipments s) shipments,
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY shipment_id) FROM private.shipa_submission_markers m) markers,
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.shipment_events e) events,
  (SELECT worker_last_ok_at FROM public.integrations WHERE provider='shipa') heartbeat;
GRANT SELECT ON selection_before TO service_role;
SET LOCAL ROLE service_role;
DO $selection_is_bounded_not_authority$
DECLARE selected jsonb; replay jsonb; binding jsonb; target uuid; rejected integer;
BEGIN
  selected:=public.shipa_select_dispatch_candidates();
  replay:=public.shipa_select_dispatch_candidates();
  IF selected IS DISTINCT FROM replay OR jsonb_array_length(selected)<>3
    OR selected#>>'{0,order_id}'<>(SELECT order_id::text FROM pg_temp.selection_cases WHERE label='a-manual')
    OR selected#>>'{1,order_id}'<>(SELECT order_id::text FROM pg_temp.selection_cases WHERE label='b-auto')
    OR selected#>>'{2,order_id}'<>(SELECT order_id::text FROM pg_temp.selection_cases WHERE label='c-auto') THEN
    RAISE EXCEPTION 'Older ineligible work starved due work, order changed or selection was a claim';
  END IF;
  FOR binding IN SELECT value FROM jsonb_array_elements(selected) LOOP
    IF binding-ARRAY['shipment_id','order_id','integration_id','environment']<>'{}'::jsonb
      OR NOT binding ?& ARRAY['shipment_id','order_id','integration_id','environment'] THEN
      RAISE EXCEPTION 'Candidate leaked a draft, key, payload or extra authority';
    END IF;
  END LOOP;
  target:=(selected#>>'{0,shipment_id}')::uuid;
  IF public.shipa_select_dispatch_candidates(1,target)<>jsonb_build_array(selected->0)
    OR public.shipa_resolve_dispatch_binding(target)<>selected->0 THEN
    RAISE EXCEPTION 'Canonical targeted selection/binding disagreed';
  END IF;
  SELECT shipment_id INTO target FROM pg_temp.selection_cases WHERE label='m-unknown';
  binding:=public.shipa_resolve_dispatch_binding(target);
  IF binding->>'shipment_id'<>target::text OR public.shipa_select_dispatch_candidates(1,target)<>'[]'::jsonb THEN
    RAISE EXCEPTION 'Historical lookup hid unknown or conferred retry authority';
  END IF;
  IF public.shipa_resolve_dispatch_binding('89000000-0000-4000-8000-000000000099') IS NOT NULL THEN
    RAISE EXCEPTION 'Missing shipment invented a binding';
  END IF;
  BEGIN PERFORM public.shipa_resolve_dispatch_binding(NULL); RAISE EXCEPTION 'Null lookup accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  FOREACH rejected IN ARRAY ARRAY[NULL,0,4,-1] LOOP
    BEGIN PERFORM public.shipa_select_dispatch_candidates(rejected); RAISE EXCEPTION 'Invalid selection bound accepted';
      EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
END
$selection_is_bounded_not_authority$;
RESET ROLE;
DO $read_only_and_privileges$
BEGIN
  IF (SELECT shipments FROM selection_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.shipments s)
    OR (SELECT markers FROM selection_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(m) ORDER BY shipment_id) FROM private.shipa_submission_markers m)
    OR (SELECT events FROM selection_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.shipment_events e)
    OR (SELECT heartbeat FROM selection_before) IS DISTINCT FROM (SELECT worker_last_ok_at FROM public.integrations WHERE provider='shipa') THEN
    RAISE EXCEPTION 'Selection/lookup mutated shipment, marker, events or scheduler heartbeat';
  END IF;
  IF has_function_privilege('anon','public.shipa_resolve_dispatch_binding(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.shipa_select_dispatch_candidates(integer,uuid)','EXECUTE')
    OR has_function_privilege('service_role','private.shipa_dispatch_binding(public.shipments)','EXECUTE') THEN
    RAISE EXCEPTION 'Canonical binding or selection privileges leaked';
  END IF;
END
$read_only_and_privileges$;
UPDATE public.integrations SET dispatch_mode='manual_after_packing' WHERE provider='shipa';
SET LOCAL ROLE service_role;
DO $manual_recovery_without_auto_mode$
BEGIN
  IF jsonb_array_length(public.shipa_select_dispatch_candidates())<>1 OR
    public.shipa_select_dispatch_candidates()#>>'{0,order_id}'<>(SELECT order_id::text FROM pg_temp.selection_cases WHERE label='a-manual') THEN
    RAISE EXCEPTION 'Mode switch dispatched automatic backlog or hid reviewed manual work';
  END IF;
END
$manual_recovery_without_auto_mode$;
RESET ROLE;
UPDATE public.integrations SET enabled=false WHERE provider='shipa';
SET LOCAL ROLE service_role;
DO $disabled$
BEGIN IF public.shipa_select_dispatch_candidates()<>'[]'::jsonb THEN RAISE EXCEPTION 'Disabled integration selected work'; END IF; END
$disabled$;
RESET ROLE;
UPDATE public.integrations SET enabled=true WHERE provider='shipa';
UPDATE public.site_settings SET value='{"shoppingEnabled":false,"checkoutEnabled":true}' WHERE key='ecommerce_mode';
SET LOCAL ROLE service_role;
DO $ministry_hold$
BEGIN IF public.shipa_select_dispatch_candidates()<>'[]'::jsonb THEN RAISE EXCEPTION 'Shopping hold selected work'; END IF; END
$ministry_hold$;
RESET ROLE;
UPDATE public.site_settings SET value='{"shoppingEnabled":true,"checkoutEnabled":false}' WHERE key='ecommerce_mode';
SET LOCAL ROLE service_role;
DO $checkout_hold$
BEGIN IF public.shipa_select_dispatch_candidates()<>'[]'::jsonb THEN RAISE EXCEPTION 'Checkout hold selected work'; END IF; END
$checkout_hold$;
RESET ROLE;
UPDATE public.site_settings SET value='{"shoppingEnabled":true,"checkoutEnabled":true}' WHERE key='ecommerce_mode';
UPDATE private.integration_payment_release SET retention_ready=false;
SET LOCAL ROLE service_role;
DO $unactivated_retention$
BEGIN IF public.shipa_select_dispatch_candidates()<>'[]'::jsonb THEN RAISE EXCEPTION 'Unactivated retention selected work'; END IF; END
$unactivated_retention$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $browser_denied$
BEGIN
  BEGIN PERFORM public.shipa_select_dispatch_candidates(); RAISE EXCEPTION 'Browser selected private dispatch candidates';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.shipa_resolve_dispatch_binding('89000000-0000-4000-8000-000000000099'); RAISE EXCEPTION 'Browser read internal binding';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$browser_denied$;
RESET ROLE;
ROLLBACK;
