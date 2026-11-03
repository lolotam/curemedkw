-- Persisted strict-evidence and recovery behavior; synthetic policy/account
-- fixtures do not prove runtime readiness, entitlement or native provider I/O.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('84000000-0000-4000-8000-000000000001','verification-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('84000000-0000-4000-8000-000000000001','admin');
SET LOCAL ROLE service_role;
SELECT public.integration_activate_payment_retention('84000000-0000-4000-8000-000000000001');
RESET ROLE;
CREATE TEMP TABLE verification_cases(label text PRIMARY KEY,order_id uuid,attempt_id uuid,attestation jsonb);
INSERT INTO verification_cases
SELECT label,md5('verification-order:'||label)::uuid,md5('verification-attempt:'||label)::uuid,
  jsonb_build_object('invoice_id','verification-invoice-'||label,'external_identifier',md5('verification-order:'||label)::uuid,
    'transaction_payment_id','verification-payment-'||label,'invoice_status','PAID','transaction_status','SUCCESS','details','{}'::jsonb)
FROM unnest(ARRAY['legacy','durable','mismatch','stale','expiry','retry','expired-final','changed-total']) label;
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,subtotal,total,payment_method)
SELECT order_id,'Synthetic buyer','buyer@example.test','50000001','Hawally','Hawally','Synthetic street',20,20,'pay_by_link'
FROM verification_cases;
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id)
SELECT attempt_id,order_id,20,'verification-key-'||label,attestation->>'invoice_id' FROM verification_cases;
INSERT INTO public.products(id,brand,name,price,sku,slug)
VALUES('84000000-0000-4000-8000-000000000002','flexitol','Synthetic item',10,'verification-item','verification-item');
INSERT INTO public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,line_total)
SELECT order_id,'84000000-0000-4000-8000-000000000002','Synthetic item',2,10,20 FROM verification_cases;
UPDATE public.integrations SET enabled=true,dispatch_mode='automatic_after_payment',configuration=jsonb_set(configuration,'{sandbox}',
  '{"appId":null,"serviceCode":"Next Day","autoConfirm":false,"pickupInstructions":"Synthetic call first",
    "origin":{"contactName":"Synthetic office","contactPhone":"+96550000002","address":{"countryCode":"KW",
      "governorate":"Hawally","area":"Hawally","block":"","street":"","building":"","addressLine":"Synthetic office"}},
    "parcel":{"count":1,"weightKg":1,"dimensionsCm":{"lengthCm":10,"widthCm":8,"heightCm":6}}}') WHERE provider='shipa';
DO $synthetic_configuration$
DECLARE config jsonb:=private.wa_legacy_config('{"enabled":true,"language":"en","admin_numbers":["50000002"]}');
BEGIN
  UPDATE public.whatsapp_settings SET integration_enabled=true,automation_enabled=true,account_identity='postora:synthetic',
    audiences=config->'audiences',recipients=config->'recipients';
  UPDATE private.wa_release_state SET state='active';
END
$synthetic_configuration$;
GRANT SELECT ON verification_cases TO service_role;
CREATE TEMP TABLE verification_receipts(label text PRIMARY KEY,document jsonb);
GRANT SELECT,INSERT,UPDATE ON verification_receipts TO service_role;
SET LOCAL ROLE service_role;
DO $legacy_owner$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM pg_temp.verification_cases WHERE label='legacy';
  PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.attestation,'signed_webhook');
END
$legacy_owner$;
RESET ROLE;
UPDATE public.whatsapp_settings SET cutover_version=1;
SET LOCAL ROLE service_role;
DO $durable_owners$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM pg_temp.verification_cases WHERE label<>'legacy' LOOP
    PERFORM public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.attestation,'signed_webhook');
  END LOOP;
END
$durable_owners$;
RESET ROLE;
DO $privileges$
BEGIN
  IF has_function_privilege('anon','public.wa_apply_verified_payment(uuid,uuid,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.wa_claim_pending_payment_verification(uuid,uuid)','EXECUTE')
    OR has_table_privilege('service_role','private.wa_payment_evidence','INSERT') THEN
    RAISE EXCEPTION 'Browser/service direct write bypassed strict evidence';
  END IF;
END
$privileges$;
SET LOCAL ROLE service_role;
DO $claim_and_strict_success$
DECLARE c record; claim jsonb; verified jsonb; first_result jsonb; replay jsonb; listed jsonb;
BEGIN
  FOR c IN SELECT * FROM pg_temp.verification_cases WHERE label IN ('legacy','durable') ORDER BY label LOOP
    claim:=public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000003');
    IF claim->>'attempt_count' IS DISTINCT FROM '1' OR claim->>'lease_token' IS NULL
      OR (claim->>'lease_expires_at')::timestamptz NOT BETWEEN clock_timestamp()+interval '44 seconds' AND clock_timestamp()+interval '46 seconds'
      OR public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000004') IS NOT NULL THEN
      RAISE EXCEPTION 'GET claim had wrong budget/lease or allowed overlapping worker';
    END IF;
    listed:=public.wa_list_pending_payment_verifications(c.order_id,1);
    IF jsonb_array_length(listed)<>1 OR listed->0 ? 'lease_token' OR listed#>>'{0,leased}' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Diagnostic list leaked lease authority or failed to report work';
    END IF;
    verified:=c.attestation||jsonb_build_object('amount_millis',20000,'currency','KWD',
      'pending_id',claim->'id','lease_token',claim->'lease_token');
    first_result:=public.wa_apply_verified_payment(c.order_id,c.attempt_id,verified,'signed_webhook');
    replay:=public.wa_apply_verified_payment(c.order_id,c.attempt_id,verified,'signed_webhook');
    IF first_result IS DISTINCT FROM replay OR first_result->>'evidence_id' IS NULL
      OR first_result-ARRAY['evidence_id','event_id','expansion_state']<>'{}'::jsonb THEN
      RAISE EXCEPTION 'Strict replay duplicated evidence/event or returned a false receipt';
    END IF;
    IF c.label='legacy' AND (first_result->'event_id'<>'null'::jsonb OR first_result->>'expansion_state' IS DISTINCT FROM 'legacy_owned') THEN
      RAISE EXCEPTION 'Strict GET scheduled the legacy send again';
    ELSIF c.label='durable' AND (first_result->>'event_id' IS NULL OR first_result->>'expansion_state' IS DISTINCT FROM 'enqueue_failed') THEN
      RAISE EXCEPTION 'Durable evidence skipped the visible expansion dependency';
    END IF;
    INSERT INTO pg_temp.verification_receipts VALUES(c.label,first_result);
  END LOOP;
END
$claim_and_strict_success$;
DO $mismatch_and_fencing$
DECLARE c record; claim jsonb; verified jsonb; invalid jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.verification_cases WHERE label='mismatch';
  claim:=public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000003');
  verified:=c.attestation||jsonb_build_object('amount_millis',20000,'currency','KWD','pending_id',claim->'id','lease_token',claim->'lease_token');
  FOREACH invalid IN ARRAY ARRAY[verified||'{"amount_millis":19999}',verified||'{"currency":"USD"}',
    verified||'{"transaction_payment_id":"different-transaction"}',verified||'{"invoice_status":"PENDING","transaction_status":"AUTHORIZE"}'] LOOP
    BEGIN
      PERFORM public.wa_apply_verified_payment(c.order_id,c.attempt_id,invalid,'payment_sweep');
      RAISE EXCEPTION 'Strict identity/amount/status mismatch accepted';
    EXCEPTION WHEN invalid_parameter_value OR serialization_failure THEN NULL; END;
  END LOOP;
  BEGIN
    PERFORM public.wa_apply_verified_payment(c.order_id,c.attempt_id,
      verified||jsonb_build_object('lease_token','84000000-0000-4000-8000-000000000099'::uuid),'payment_sweep');
    RAISE EXCEPTION 'A stale or invented GET lease completed strict evidence';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.wa_resolve_pending_payment_verification((claim->>'id')::uuid,(claim->>'lease_token')::uuid,
      '{"code":"payment_amount_mismatch"}','retry');
    RAISE EXCEPTION 'Deterministic evidence mismatch entered automatic retry';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.wa_resolve_pending_payment_verification((claim->>'id')::uuid,(claim->>'lease_token')::uuid,
    '{"code":"payment_amount_mismatch"}','evidence_mismatch');
  IF public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000003') IS NOT NULL THEN
    RAISE EXCEPTION 'Deterministic mismatch automatically retried';
  END IF;
END
$mismatch_and_fencing$;
RESET ROLE;
UPDATE private.wa_pending_payment_verifications SET first_seen=now()-interval '25 hours'
  WHERE order_id=(SELECT order_id FROM verification_cases WHERE label='stale');
SET LOCAL ROLE service_role;
DO $stale_success$
DECLARE c record; claim jsonb; verified jsonb; receipt jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.verification_cases WHERE label='stale';
  claim:=public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000003');
  verified:=c.attestation||'{"amount_millis":20000,"currency":"KWD"}';
  receipt:=public.wa_resolve_pending_payment_verification((claim->>'id')::uuid,(claim->>'lease_token')::uuid,verified,'resolved');
  IF receipt->>'evidence_id' IS NULL OR receipt->>'expansion_state' IS DISTINCT FROM 'skipped' THEN
    RAISE EXCEPTION 'Old payment lost evidence or created a late thank-you';
  END IF;
END
$stale_success$;
DO $retry_budget$
DECLARE c record; claim jsonb; receipt jsonb; i integer; delays integer[]:=ARRAY[1,5,15,30,60];
BEGIN
  SELECT * INTO c FROM pg_temp.verification_cases WHERE label='retry';
  FOR i IN 1..6 LOOP
    claim:=public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000003');
    IF claim->>'attempt_count' IS DISTINCT FROM i::text THEN RAISE EXCEPTION 'GET budget drifted'; END IF;
    receipt:=public.wa_resolve_pending_payment_verification((claim->>'id')::uuid,(claim->>'lease_token')::uuid,
      '{"code":"provider_unavailable"}','retry');
    IF i<6 THEN
      IF receipt->>'state' IS DISTINCT FROM 'unresolved' OR (receipt->>'next_attempt')::timestamptz NOT BETWEEN
        clock_timestamp()+make_interval(mins=>delays[i])-interval '1 second' AND clock_timestamp()+make_interval(mins=>delays[i])+interval '1 second'
        OR public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000003') IS NOT NULL THEN
        RAISE EXCEPTION 'Backoff changed or immediate GET retry was allowed';
      END IF;
      EXECUTE 'RESET ROLE';
      UPDATE private.wa_pending_payment_verifications SET next_attempt=clock_timestamp()-interval '1 second' WHERE order_id=c.order_id;
      EXECUTE 'SET LOCAL ROLE service_role';
    ELSIF receipt->>'state' IS DISTINCT FROM 'needs_review' OR receipt->>'safe_reason' IS DISTINCT FROM 'verification_attempts_exhausted' THEN
      RAISE EXCEPTION 'Six failed GETs did not stop for review';
    END IF;
  END LOOP;
  IF public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000003') IS NOT NULL THEN
    RAISE EXCEPTION 'A seventh GET was authorized';
  END IF;
END
$retry_budget$;
DO $first_expiry_claim$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM pg_temp.verification_cases WHERE label='expiry';
  INSERT INTO pg_temp.verification_receipts VALUES('expiry-claim',
    public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000003'));
END
$first_expiry_claim$;
RESET ROLE;
UPDATE private.wa_pending_payment_verifications SET lease_expires_at=clock_timestamp()-interval '1 second'
  WHERE order_id=(SELECT order_id FROM verification_cases WHERE label='expiry');
UPDATE private.wa_pending_payment_verifications SET attempt_count=6,lease_token=(gen_random_uuid()),lease_expires_at=now()-interval '1 minute'
  WHERE order_id=(SELECT order_id FROM verification_cases WHERE label='expired-final');
UPDATE public.orders SET total=21 WHERE id=(SELECT order_id FROM verification_cases WHERE label='changed-total');
SET LOCAL ROLE service_role;
DO $expired_worker_and_changed_total$
DECLARE c record; old_claim jsonb; claim jsonb; verified jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.verification_cases WHERE label='expiry';
  SELECT document INTO old_claim FROM pg_temp.verification_receipts WHERE label='expiry-claim';
  claim:=public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000004');
  IF claim->>'attempt_count' IS DISTINCT FROM '2' OR claim->'lease_token'=old_claim->'lease_token' THEN
    RAISE EXCEPTION 'Expired GET lease did not consume the common budget/new token';
  END IF;
  verified:=c.attestation||'{"amount_millis":20000,"currency":"KWD"}';
  BEGIN
    PERFORM public.wa_resolve_pending_payment_verification((old_claim->>'id')::uuid,(old_claim->>'lease_token')::uuid,verified,'resolved');
    RAISE EXCEPTION 'Expired worker overwrote the new GET lease';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM public.wa_resolve_pending_payment_verification((claim->>'id')::uuid,(claim->>'lease_token')::uuid,verified,'resolved');
  SELECT * INTO c FROM pg_temp.verification_cases WHERE label='expired-final';
  IF public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000003') IS NOT NULL THEN
    RAISE EXCEPTION 'Sixth expired lease authorized a seventh GET';
  END IF;
  SELECT * INTO c FROM pg_temp.verification_cases WHERE label='changed-total';
  claim:=public.wa_claim_pending_payment_verification(c.order_id,'84000000-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.wa_resolve_pending_payment_verification((claim->>'id')::uuid,(claim->>'lease_token')::uuid,
      c.attestation||'{"amount_millis":20000,"currency":"KWD"}','resolved');
    RAISE EXCEPTION 'Strict evidence ignored a changed current order total';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END
$expired_worker_and_changed_total$;
RESET ROLE;
DO $persisted_evidence$
DECLARE c record;
BEGIN
  IF (SELECT count(*) FROM private.wa_payment_evidence)<>4 OR (SELECT count(*) FROM private.order_payment_verifications)<>4
    OR (SELECT count(*) FROM public.whatsapp_notification_events)<>3 OR EXISTS(SELECT 1 FROM public.shipments)
    OR EXISTS(SELECT 1 FROM public.whatsapp_delivery_jobs) THEN
    RAISE EXCEPTION 'Evidence/event/receipt cardinality drifted or a send/shipment was invented';
  END IF;
  SELECT * INTO c FROM pg_temp.verification_cases WHERE label='durable';
  IF NOT EXISTS(SELECT 1 FROM private.order_payment_verifications WHERE order_id=c.order_id AND dispatch_decision='enqueued')
    OR NOT EXISTS(SELECT 1 FROM public.whatsapp_notification_events WHERE order_id=c.order_id
      AND expansion_state='enqueue_failed' AND safe_reason='expansion_pending' AND next_repair_at IS NOT NULL) THEN
    RAISE EXCEPTION 'GET after signed paid reclassified a fresh outcome as historical';
  END IF;
  IF public.wa_list_pending_payment_verifications(c.order_id,1)#>>'{0,leased}' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Resolved evidence was still reported as an active GET lease';
  END IF;
  SELECT * INTO c FROM pg_temp.verification_cases WHERE label='stale';
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_notification_events WHERE order_id=c.order_id
    AND expansion_state='skipped' AND safe_reason='notification_stale')
    OR NOT EXISTS(SELECT 1 FROM private.order_payment_verifications WHERE order_id=c.order_id AND dispatch_decision='integrity_hold') THEN
    RAISE EXCEPTION 'Stale evidence left an automatic late dispatch eligible';
  END IF;
  SELECT * INTO c FROM pg_temp.verification_cases WHERE label='mismatch';
  IF (SELECT payment_status FROM public.orders WHERE id=c.order_id)<>'paid'
    OR EXISTS(SELECT 1 FROM private.wa_payment_evidence WHERE order_id=c.order_id)
    OR NOT EXISTS(SELECT 1 FROM private.wa_pending_payment_verifications WHERE order_id=c.order_id AND state='evidence_mismatch') THEN
    RAISE EXCEPTION 'Strict mismatch erased signed paid or created evidence';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.wa_pending_payment_verifications WHERE
    order_id=(SELECT order_id FROM pg_temp.verification_cases WHERE label='expired-final') AND state='needs_review'
      AND safe_reason='verification_attempts_exhausted') THEN
    RAISE EXCEPTION 'Expired final worker remained endlessly retryable';
  END IF;
END
$persisted_evidence$;
ROLLBACK;
