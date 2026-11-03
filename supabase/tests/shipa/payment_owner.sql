-- Actual-role, persisted SQL proof of the shared first-success owner.
-- Synthetic fixtures only; no provider request or application activation.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
  ('82000000-0000-4000-8000-000000000001','shared-owner-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES ('82000000-0000-4000-8000-000000000001','admin');
CREATE TEMP TABLE payment_owner_cases(label text PRIMARY KEY,order_id uuid,attempt_id uuid,attestation jsonb);
INSERT INTO payment_owner_cases
SELECT label,md5('owner-order:'||label)::uuid,md5('owner-attempt:'||label)::uuid,
  jsonb_build_object('invoice_id','owner-invoice-'||label,'external_identifier',md5('owner-order:'||label)::uuid,
    'transaction_payment_id','owner-transaction-'||label,'invoice_status','PAID','transaction_status','SUCCESS',
    'details',jsonb_build_object('invoice_reference','fixture-reference','transaction_id','fixture-transaction',
      'reference_id','fixture-reference-id','track_id','fixture-track','payment_method','fixture-method',
      'card_brand','fixture-brand','card_last4','1234'))
FROM unnest(ARRAY['first','pending','historical','cancelled','refunded','bad-config','bad-identity','guest-id','duplicate']) label;
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,
  subtotal,total,payment_method)
SELECT order_id,'Synthetic buyer','buyer@example.test','50000001','Hawally','Hawally','Synthetic street',20,20,'pay_by_link'
FROM payment_owner_cases;
INSERT INTO public.payment_attempts(id,order_id,amount,currency,idempotency_key,invoice_id)
SELECT attempt_id,order_id,20,'KWD','owner-key-'||label,attestation->>'invoice_id' FROM payment_owner_cases;
UPDATE public.orders SET payment_status='paid' WHERE id=(SELECT order_id FROM payment_owner_cases WHERE label='historical');
UPDATE public.orders SET order_status='cancelled' WHERE id=(SELECT order_id FROM payment_owner_cases WHERE label='cancelled');
UPDATE public.orders SET payment_status='refunded' WHERE id=(SELECT order_id FROM payment_owner_cases WHERE label='refunded');
UPDATE public.orders SET myfatoorah_payment_id='guest-forged-payment-reference'
  WHERE id=(SELECT order_id FROM payment_owner_cases WHERE label='guest-id');
INSERT INTO public.site_settings(key,value) VALUES('whatsapp_integration',
  '{"enabled":true,"language":"en","admin_numbers":["50000002"],"events":{"order_paid":true,"admin_new_order":true}}')
ON CONFLICT(key) DO UPDATE SET value=excluded.value;
GRANT SELECT ON payment_owner_cases TO service_role,anon,authenticated;
CREATE TEMP TABLE payment_owner_receipts(label text PRIMARY KEY,document jsonb);
GRANT SELECT,INSERT ON payment_owner_receipts TO service_role;

DO $inert_schema$
BEGIN
  IF EXISTS(SELECT 1 FROM private.integration_payment_release WHERE retention_ready)
    OR EXISTS(SELECT 1 FROM private.wa_release_state WHERE retention_ready) THEN
    RAISE EXCEPTION 'Fixture must start before explicit retention activation';
  END IF;
  -- Baseline direct writers still work after the additive schema phase.
  UPDATE public.orders SET payment_status='pending_status_update'
    WHERE id=(SELECT order_id FROM payment_owner_cases WHERE label='pending');
  UPDATE public.site_settings SET value=value||'{"api_key":""}' WHERE key='whatsapp_integration';
  IF has_function_privilege('anon','public.wa_record_provider_payment_outcome(uuid,uuid,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.wa_read_payment_owner(uuid,uuid)','EXECUTE')
    OR has_table_privilege('service_role','private.integration_invoice_bindings','INSERT') THEN
    RAISE EXCEPTION 'Shared owner inherited browser/direct-write authority';
  END IF;
END
$inert_schema$;
SET LOCAL ROLE anon;
DO $browser_denied$
BEGIN
  BEGIN
    PERFORM public.wa_read_payment_owner('82000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Browser read private payment ownership';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$browser_denied$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $activation$
DECLARE c record; result jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.payment_owner_cases WHERE label='first';
  BEGIN
    PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.attestation,'signed_webhook');
    RAISE EXCEPTION 'New owner ran before retention activation';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  BEGIN
    PERFORM public.integration_activate_payment_retention('82000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Unverified admin activated retention';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  result:=public.integration_activate_payment_retention('82000000-0000-4000-8000-000000000001');
  IF result IS DISTINCT FROM '{"retention_ready":true,"changed":true}'::jsonb THEN
    RAISE EXCEPTION 'Retention activation did not complete';
  END IF;
  IF public.integration_activate_payment_retention('82000000-0000-4000-8000-000000000001')->>'changed'<>'false' THEN
    RAISE EXCEPTION 'Retention rerun changed the release';
  END IF;
END
$activation$;
DO $non_success$
DECLARE c record; result jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.payment_owner_cases WHERE label='first';
  result:=public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,
    c.attestation||'{"invoice_status":"PENDING","transaction_status":"FAILED"}','signed_webhook');
  IF result->'outcome_id'<>'null'::jsonb OR result->>'payment_status'<>'payment_failed' THEN
    RAISE EXCEPTION 'Failed attempt took the first-success slot';
  END IF;
  SELECT * INTO c FROM pg_temp.payment_owner_cases WHERE label='pending';
  result:=public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,
    c.attestation||'{"invoice_status":"PENDING","transaction_status":"AUTHORIZE","transaction_payment_id":null}',
    'signed_webhook');
  IF result->'outcome_id'<>'null'::jsonb OR result->>'payment_status'<>'pending_payment' THEN
    RAISE EXCEPTION 'Pending attempt took ownership or required an invented transaction';
  END IF;
END
$non_success$;
RESET ROLE;
INSERT INTO public.payment_attempts(id,order_id,amount,currency,idempotency_key,invoice_id)
SELECT '82000000-0000-4000-8000-000000000003',order_id,20,'KWD','owner-success-retry','owner-invoice-success-retry'
  FROM payment_owner_cases WHERE label='first';
UPDATE payment_owner_cases SET attempt_id='82000000-0000-4000-8000-000000000003',
  attestation=attestation||'{"invoice_id":"owner-invoice-success-retry","transaction_payment_id":"owner-final-success"}'
  WHERE label='first';
SET LOCAL ROLE service_role;
DO $first_success$
DECLARE c record; result jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.payment_owner_cases WHERE label='first';
  result:=public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.attestation,'signed_webhook');
  IF result->>'outcome_id' IS NULL OR result->>'changed'<>'true' OR result->>'payment_status'<>'paid'
    OR result->>'order_status'<>'confirmed' OR result->>'verification_pending'<>'true'
    OR result#>>'{owner_snapshot,whatsapp,owner}'<>'legacy'
    OR result#>>'{owner_snapshot,whatsapp,configuration,recipients,admins,0}'<>'96550000002'
    OR result#>>'{owner_snapshot,shipa,decision}'<>'disabled'
    OR result#>>'{owner_snapshot,whatsapp,manual_only}'<>'false'
    OR result-ARRAY['outcome_id','owner_snapshot','changed','payment_status','order_status','verification_pending']<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Signed first success did not commit both policies independently of GET';
  END IF;
  INSERT INTO pg_temp.payment_owner_receipts VALUES('first',result);
END
$first_success$;
RESET ROLE;
UPDATE public.whatsapp_settings SET cutover_version=1,settings_revision=settings_revision+1;
UPDATE public.integrations SET dispatch_mode='automatic_after_payment',revision=revision+1 WHERE provider='shipa';
UPDATE public.site_settings SET value=value||'{"enabled":false,"admin_numbers":["50000003"]}'
  WHERE key='whatsapp_integration';
SET LOCAL ROLE service_role;
DO $replay$
DECLARE c record; original jsonb; result jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.payment_owner_cases WHERE label='first';
  SELECT document INTO original FROM pg_temp.payment_owner_receipts WHERE label='first';
  result:=public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.attestation,'signed_webhook');
  IF result->>'changed'<>'false' OR result->'outcome_id' IS DISTINCT FROM original->'outcome_id'
    OR result->'owner_snapshot' IS DISTINCT FROM original->'owner_snapshot' THEN
    RAISE EXCEPTION 'Replay moved ownership or changed recorded recipients after settings edit';
  END IF;
  result:=public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,
    c.attestation||'{"invoice_status":"PENDING","transaction_status":"FAILED"}','signed_webhook');
  IF result->>'payment_status'<>'paid' OR result->>'changed'<>'false' THEN
    RAISE EXCEPTION 'Stale failure downgraded paid status';
  END IF;
  result:=public.wa_read_payment_owner(c.order_id,(original->>'outcome_id')::uuid);
  IF result->>'attempt_id'<>c.attempt_id::text OR result->>'transaction_payment_id'<>'owner-final-success'
    OR result->'owner_snapshot' IS DISTINCT FROM original->'owner_snapshot' THEN
    RAISE EXCEPTION 'Owner lookup lost canonical payment identity';
  END IF;
END
$replay$;
DO $manual_and_protected$
DECLARE c record; result jsonb;
BEGIN
  FOR c IN SELECT * FROM pg_temp.payment_owner_cases WHERE label IN ('historical','cancelled','refunded') LOOP
    result:=public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.attestation,'signed_webhook');
    IF result#>>'{owner_snapshot,whatsapp,manual_only}' IS DISTINCT FROM 'true'
      OR NOT coalesce(result#>>'{owner_snapshot,shipa,decision}' IN ('already_paid_manual_only','integrity_hold'),false) THEN
      RAISE EXCEPTION 'Historical/cancelled/refunded order gained automatic authority';
    END IF;
    IF c.label='refunded' AND result->>'payment_status'<>'refunded' THEN
      RAISE EXCEPTION 'Success overwrote refund';
    ELSIF c.label='cancelled' AND result->>'order_status'<>'cancelled' THEN
      RAISE EXCEPTION 'Success reopened cancelled fulfilment';
    END IF;
  END LOOP;
END
$manual_and_protected$;
DO $identity_and_amount$
DECLARE c record; invalid jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.payment_owner_cases WHERE label='bad-identity';
  FOREACH invalid IN ARRAY ARRAY[
    c.attestation||'{"invoice_id":"unrelated-invoice"}',
    c.attestation||'{"external_identifier":"82000000-0000-4000-8000-000000000004"}',
    c.attestation||'{"transaction_payment_id":""}',
    c.attestation||'{"details":{"paid":true}}'] LOOP
    BEGIN
      PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,invalid,'signed_webhook');
      RAISE EXCEPTION 'Unbound identity or arbitrary order patch accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  FOREACH invalid IN ARRAY ARRAY[c.attestation||'{"amount_millis":19999,"currency":"KWD"}',
    c.attestation||'{"amount_millis":20000,"currency":"USD"}'] LOOP
    BEGIN
      PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,invalid,'verified_callback');
      RAISE EXCEPTION 'Incorrect GET amount/currency accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  BEGIN
    PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,
      c.attestation||'{"amount_millis":20000,"currency":"KWD","actor_id":"82000000-0000-4000-8000-000000000002"}',
      'admin_verification');
    RAISE EXCEPTION 'Forged admin identity obtained recovery authority';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF public.wa_read_payment_owner(c.order_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Rejected attestation left a partial owner';
  END IF;
END
$identity_and_amount$;
DO $guest_reference$
DECLARE c record; result jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.payment_owner_cases WHERE label='guest-id';
  result:=public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,
    c.attestation||'{"amount_millis":20000,"currency":"KWD"}','verified_callback');
  IF result->>'payment_status'<>'paid' OR public.wa_read_payment_owner(c.order_id)->>'transaction_payment_id'
    IS DISTINCT FROM c.attestation->>'transaction_payment_id' THEN
    RAISE EXCEPTION 'Guest-set payment reference owned callback identity';
  END IF;
END
$guest_reference$;
RESET ROLE;
-- These outcomes exist only in this rollback fixture. Nothing is sent.
UPDATE public.site_settings SET value=jsonb_set(value,'{admin_numbers}','["invalid-extension-x"]') WHERE key='whatsapp_integration';
INSERT INTO private.wa_pending_payment_verifications(invoice_id,transaction_payment_id,signed_external_identifier,
  signed_status,first_seen,attempt_count,next_attempt)
SELECT attestation->>'invoice_id',attestation->>'transaction_payment_id',upper(order_id::text),'PAID',
  now()-interval '10 minutes',2,now()+interval '5 minutes' FROM payment_owner_cases WHERE label='bad-config';
SET LOCAL ROLE service_role;
DO $config_failure$
DECLARE c record; result jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.payment_owner_cases WHERE label='bad-config';
  result:=public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.attestation,'signed_webhook');
  IF result->>'payment_status'<>'paid' OR result#>>'{owner_snapshot,whatsapp,configuration_error}'
    IS DISTINCT FROM 'notification_configuration_invalid' THEN
    RAISE EXCEPTION 'Bad notification configuration rolled back the signed paid status';
  END IF;
END
$config_failure$;
RESET ROLE;
INSERT INTO public.payment_attempts(order_id,amount,idempotency_key,invoice_id)
SELECT order_id,20,'owner-key-ambiguous',attestation->>'invoice_id' FROM payment_owner_cases WHERE label='duplicate';
SET LOCAL ROLE service_role;
DO $ambiguous_invoice$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM pg_temp.payment_owner_cases WHERE label='duplicate';
  BEGIN
    PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.attestation,'signed_webhook');
    RAISE EXCEPTION 'Ambiguous server invoice mapping selected an arbitrary attempt';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
END
$ambiguous_invoice$;
RESET ROLE;
DO $persisted_invariants$
DECLARE c record; paid public.orders; snapshot jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.payment_owner_cases WHERE label='first';
  SELECT * INTO paid FROM public.orders WHERE id=c.order_id;
  IF paid.paid_at IS NULL OR paid.payment_verified_at IS NULL OR paid.myfatoorah_invoice_reference<>'fixture-reference'
    OR paid.myfatoorah_transaction_id<>'fixture-transaction' OR paid.myfatoorah_reference_id<>'fixture-reference-id'
    OR paid.myfatoorah_track_id<>'fixture-track' OR paid.payment_online_method<>'fixture-method'
    OR paid.myfatoorah_card_brand<>'fixture-brand' OR paid.myfatoorah_card_last4<>'1234'
    OR paid.payment_error_code IS NOT NULL OR paid.payment_error_message IS NOT NULL THEN
    RAISE EXCEPTION 'Allowlisted baseline payment details were lost';
  END IF;
  IF EXISTS(SELECT 1 FROM private.wa_payment_evidence) OR EXISTS(SELECT 1 FROM public.whatsapp_notification_events)
    OR EXISTS(SELECT 1 FROM private.order_payment_verifications) OR EXISTS(SELECT 1 FROM public.shipments) THEN
    RAISE EXCEPTION 'Status transaction invented strict evidence, shipment or durable event';
  END IF;
  IF (SELECT count(*) FROM private.wa_pending_payment_verifications WHERE order_id=c.order_id)<>1
    OR NOT EXISTS(SELECT 1 FROM private.wa_pending_payment_verifications WHERE order_id=c.order_id
      AND attempt_id=c.attempt_id AND outcome_id=(SELECT id FROM private.wa_payment_outcomes WHERE order_id=c.order_id)
      AND invoice_id='owner-invoice-success-retry' AND transaction_payment_id='owner-final-success'
      AND state='unresolved' AND attempt_count=0 AND lease_token IS NULL) THEN
    RAISE EXCEPTION 'Signed success did not leave one durable canonical GET-recovery row';
  END IF;
  SELECT input_snapshot INTO snapshot FROM private.wa_payment_outcomes WHERE order_id=c.order_id;
  IF snapshot::text LIKE '%api_key%' OR snapshot::text LIKE '%ciphertext%' THEN
    RAISE EXCEPTION 'First-success policy snapshot retained credentials';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.wa_pending_payment_verifications pending JOIN pg_temp.payment_owner_cases cases
    ON cases.label='bad-config' AND cases.order_id=pending.order_id WHERE pending.attempt_id=cases.attempt_id
      AND pending.outcome_id IS NOT NULL AND pending.attempt_count=2 AND pending.first_seen=now()-interval '10 minutes'
      AND pending.next_attempt=now()+interval '5 minutes') THEN
    RAISE EXCEPTION 'Late invoice binding lost a signed tuple or reset its verification budget/age';
  END IF;
  BEGIN
    DELETE FROM public.payment_attempts WHERE id=c.attempt_id;
    RAISE EXCEPTION 'Retained payment attempt was deletable';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    DELETE FROM public.orders WHERE id=c.order_id;
    RAISE EXCEPTION 'Retained first-success order was deletable';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END
$persisted_invariants$;
ROLLBACK;
