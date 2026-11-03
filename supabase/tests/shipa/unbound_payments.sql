-- Actual-role recovery proof; provider signature/HTTP remain handler gates.
BEGIN;
SET LOCAL ROLE service_role;
DO $inactive$
BEGIN
  BEGIN
    PERFORM public.wa_record_unbound_payment_status('{}');
    RAISE EXCEPTION 'Inactive shared writer accepted a tuple';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END
$inactive$;
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES('88000000-0000-4000-8000-000000000001','unbound-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('88000000-0000-4000-8000-000000000001','admin');
SET LOCAL ROLE service_role;
SELECT public.integration_activate_payment_retention('88000000-0000-4000-8000-000000000001');
RESET ROLE;
CREATE TEMP TABLE unbound_cases(label text PRIMARY KEY,order_id uuid,attempt_id uuid,attestation jsonb);
INSERT INTO unbound_cases SELECT label,md5('unbound-order:'||label)::uuid,md5('unbound-attempt:'||label)::uuid,
  jsonb_build_object('invoice_id','unbound-invoice-'||label,'external_identifier',md5('unbound-order:'||label)::uuid,
    'transaction_payment_id','unbound-payment-'||label,'invoice_status','PAID','transaction_status','SUCCESS','details','{}'::jsonb)
FROM unnest(ARRAY['early','late','foreign','ambiguous']) label;
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,subtotal,total,payment_method)
SELECT order_id,'Synthetic','unbound@example.test','50000001',20,20,'pay_by_link' FROM unbound_cases;
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key)
SELECT attempt_id,order_id,20,'unbound-key-'||label FROM unbound_cases;
CREATE TEMP TABLE unbound_results(label text PRIMARY KEY,document jsonb);
GRANT SELECT ON unbound_cases TO service_role;
GRANT SELECT,INSERT,UPDATE ON unbound_results TO service_role;
SET LOCAL ROLE service_role;
DO $record_and_replay$
DECLARE c record; recorded jsonb; replay jsonb; bad jsonb;
BEGIN
  FOR c IN SELECT * FROM pg_temp.unbound_cases LOOP
    recorded:=public.wa_record_unbound_payment_status(c.attestation);
    replay:=public.wa_record_unbound_payment_status(c.attestation);
    IF recorded<>replay OR recorded->>'processed'<>'false' OR recorded->>'retryable'<>'true' THEN
      RAISE EXCEPTION 'Unbound replay changed identity or falsely processed success'; END IF;
    INSERT INTO pg_temp.unbound_results VALUES(c.label,recorded);
  END LOOP;
  SELECT * INTO c FROM pg_temp.unbound_cases WHERE label='early';
  BEGIN
    PERFORM public.wa_record_unbound_payment_status(c.attestation||'{"amount_millis":1,"currency":"KWD"}');
    RAISE EXCEPTION 'Unsigned amount entered unbound authority';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.wa_record_unbound_payment_status(jsonb_set(c.attestation,'{external_identifier}',
      '"88000000-0000-4000-8000-000000000099"'));
    RAISE EXCEPTION 'Duplicate tuple was reassigned to another order';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  bad:=c.attestation||'{"invoice_status":"PENDING","transaction_status":"FAILED"}';
  BEGIN
    PERFORM public.wa_record_unbound_payment_status(bad);
    RAISE EXCEPTION 'Failed status occupied the successful recovery tuple';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF public.wa_claim_pending_payment_verification(NULL,'88000000-0000-4000-8000-000000000002') IS NOT NULL THEN
    RAISE EXCEPTION 'Unbound tuple authorized a provider GET'; END IF;
  IF jsonb_array_length(public.wa_list_unbound_payment_statuses(100))<>4 THEN RAISE EXCEPTION 'Due mapping work was invisible'; END IF;
  replay:=public.wa_bind_unbound_payment_status((SELECT (document->>'pending_id')::uuid FROM pg_temp.unbound_results WHERE label='early'));
  IF replay->>'processed'<>'false' OR replay->>'retryable'<>'true' THEN RAISE EXCEPTION 'Missing mapping did not remain pending'; END IF;
END
$record_and_replay$;
RESET ROLE;
DO $unbound_history$
BEGIN
  IF EXISTS(SELECT 1 FROM public.orders WHERE payment_status='paid') OR EXISTS(SELECT 1 FROM private.wa_payment_outcomes)
    OR EXISTS(SELECT 1 FROM private.wa_payment_evidence) OR EXISTS(SELECT 1 FROM private.wa_pending_payment_verifications
      WHERE attempt_count<>0 OR lease_token IS NOT NULL) THEN RAISE EXCEPTION 'Unbound status invented payment/GET evidence'; END IF;
END
$unbound_history$;
UPDATE private.wa_pending_payment_verifications SET first_seen=now()-interval '25 hours' WHERE invoice_id='unbound-invoice-late';
SET LOCAL ROLE service_role;
DO $five_minute_boundary$
DECLARE c record; result jsonb;
BEGIN
  SELECT * INTO c FROM pg_temp.unbound_cases WHERE label='late';
  result:=public.wa_record_unbound_payment_status(c.attestation);
  IF result->>'processed'<>'false' OR result->>'retryable'<>'false'
    OR result->>'safe_reason'<>'payment_attempt_mapping_unresolved' THEN RAISE EXCEPTION 'Old unmapped webhook kept requesting retries'; END IF;
END
$five_minute_boundary$;
RESET ROLE;
UPDATE public.payment_attempts attempt SET invoice_id=cases.attestation->>'invoice_id'
  FROM unbound_cases cases WHERE attempt.id=cases.attempt_id AND cases.label IN ('early','late','ambiguous');
-- A guest-set order invoice field cannot substitute for a canonical attempt.
UPDATE public.orders SET myfatoorah_invoice_id='unbound-invoice-foreign' WHERE id=md5('unbound-order:foreign')::uuid;
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id) VALUES
  ('88000000-0000-4000-8000-000000000003',md5('unbound-order:early')::uuid,20,'unbound-foreign','unbound-invoice-foreign'),
  ('88000000-0000-4000-8000-000000000004',md5('unbound-order:ambiguous')::uuid,20,'unbound-ambiguous-copy','unbound-invoice-ambiguous');
-- Advance only the synthetic due time; production binding does not reset it.
UPDATE private.wa_pending_payment_verifications SET next_attempt=now() WHERE invoice_id='unbound-invoice-early';
SET LOCAL ROLE service_role;
DO $binding_and_strict_evidence$
DECLARE c record; result jsonb; claim jsonb; strict_result jsonb; first_owner jsonb; second_status jsonb; second_pending jsonb;
BEGIN
  FOR c IN SELECT * FROM pg_temp.unbound_cases WHERE label IN ('early','late') LOOP
    result:=public.wa_bind_unbound_payment_status((SELECT (document->>'pending_id')::uuid FROM pg_temp.unbound_results WHERE label=c.label));
    IF result->>'processed'<>'true' OR result#>>'{payment_result,payment_status}'<>'paid' THEN
      RAISE EXCEPTION 'Proven canonical mapping failed to record signed paid status'; END IF;
    IF c.label='late' AND (result->>'state'<>'needs_review' OR result->>'safe_reason'<>'payment_attempt_mapping_unresolved') THEN
      RAISE EXCEPTION 'Late binding reset terminal review history'; END IF;
    IF public.wa_bind_unbound_payment_status((result->>'pending_id')::uuid)->>'processed'<>'true' THEN
      RAISE EXCEPTION 'Bound replay was not idempotent'; END IF;
  END LOOP;
  SELECT * INTO c FROM pg_temp.unbound_cases WHERE label='early';
  claim:=public.wa_claim_pending_payment_verification(c.order_id,'88000000-0000-4000-8000-000000000002');
  strict_result:=public.wa_apply_verified_payment(c.order_id,c.attempt_id,c.attestation||jsonb_build_object('amount_millis',20000,
    'currency','KWD','pending_id',claim->'id','lease_token',claim->'lease_token'),'payment_sweep');
  IF strict_result->>'evidence_id' IS NULL THEN RAISE EXCEPTION 'Bound tuple did not use the common strict-evidence owner'; END IF;
  IF public.wa_claim_pending_payment_verification(md5('unbound-order:late')::uuid,'88000000-0000-4000-8000-000000000002') IS NOT NULL THEN
    RAISE EXCEPTION 'Terminal mapping review was silently reopened'; END IF;
  FOR c IN SELECT * FROM pg_temp.unbound_cases WHERE label IN ('foreign','ambiguous') LOOP
    result:=public.wa_bind_unbound_payment_status((SELECT (document->>'pending_id')::uuid FROM pg_temp.unbound_results WHERE label=c.label));
    IF result->>'processed'<>'false' OR result->>'retryable'<>'false' OR result->>'state'<>'evidence_mismatch' THEN
      RAISE EXCEPTION 'Foreign/ambiguous invoice selected an order'; END IF;
  END LOOP;
END
$binding_and_strict_evidence$;
RESET ROLE;
DO $preserved_history$
BEGIN
  IF (SELECT count(*) FROM private.wa_payment_outcomes)<>2 OR (SELECT count(*) FROM private.wa_payment_evidence)<>1
    OR (SELECT first_seen FROM private.wa_pending_payment_verifications WHERE invoice_id='unbound-invoice-late')<>now()-interval '25 hours'
    OR EXISTS(SELECT 1 FROM public.orders WHERE id IN (md5('unbound-order:foreign')::uuid,md5('unbound-order:ambiguous')::uuid)
      AND payment_status='paid') THEN RAISE EXCEPTION 'Mapping repair lost history or paid an unrelated order'; END IF;
  IF EXISTS(SELECT 1 FROM private.wa_payment_outcomes WHERE order_id=md5('unbound-order:late')::uuid
    AND (legacy_expansion_state<>'skipped' OR safe_reason IS DISTINCT FROM 'notification_stale')) THEN
    RAISE EXCEPTION 'Old unbound success could schedule a late legacy notification'; END IF;
END
$preserved_history$;
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id) VALUES
  ('88000000-0000-4000-8000-000000000005',md5('unbound-order:early')::uuid,20,'unbound-second-success','unbound-second-invoice');
SET LOCAL ROLE service_role;
DO $second_success_keeps_first_owner$
DECLARE status jsonb; result jsonb; owner_before jsonb; owner_after jsonb;
BEGIN
  SELECT attestation||'{"invoice_id":"unbound-second-invoice","transaction_payment_id":"unbound-second-payment"}'
    INTO status FROM pg_temp.unbound_cases WHERE label='early';
  owner_before:=public.wa_read_payment_owner(md5('unbound-order:early')::uuid);
  result:=public.wa_record_unbound_payment_status(status);
  result:=public.wa_bind_unbound_payment_status((result->>'pending_id')::uuid);
  owner_after:=public.wa_read_payment_owner(md5('unbound-order:early')::uuid);
  IF result->>'processed'<>'true' OR result->>'state'<>'superseded' OR owner_before<>owner_after
    OR public.wa_claim_pending_payment_verification(md5('unbound-order:early')::uuid,'88000000-0000-4000-8000-000000000002') IS NOT NULL THEN
    RAISE EXCEPTION 'Second successful attempt replaced the owner or authorized another GET'; END IF;
END
$second_success_keeps_first_owner$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $browser_denied$
BEGIN
  BEGIN
    PERFORM public.wa_find_canonical_payment_attempt('unbound-invoice-early',md5('unbound-order:early')::uuid);
    RAISE EXCEPTION 'Browser queried canonical service authority';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.wa_record_unbound_payment_status('{}');
    RAISE EXCEPTION 'Browser recorded a signed attestation';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$browser_denied$;
ROLLBACK;
