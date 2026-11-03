-- Payment-owned GET recovery and strict evidence. Provider I/O occurs only
-- after a lease commits; no transaction here calls an external service.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,14);
ALTER TABLE private.wa_pending_payment_verifications ADD COLUMN IF NOT EXISTS lease_worker_id uuid;

CREATE OR REPLACE FUNCTION public.wa_list_pending_payment_verifications(p_order_id uuid,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_verification_limit';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(document ORDER BY first_seen,id),'[]') FROM (
    SELECT id,first_seen,jsonb_build_object('id',id,'order_id',order_id,'attempt_id',attempt_id,'outcome_id',outcome_id,
      'invoice_id',invoice_id,'transaction_payment_id',transaction_payment_id,'state',state,'first_seen',first_seen,
      'attempt_count',attempt_count,'next_attempt',next_attempt,'leased',state='unresolved' AND coalesce(lease_expires_at>now(),false),
      'safe_reason',safe_reason) document
    FROM private.wa_pending_payment_verifications WHERE p_order_id IS NULL OR order_id=p_order_id
    ORDER BY first_seen,id LIMIT p_limit) pending);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_claim_pending_payment_verification(p_order_id uuid,p_worker_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE pending private.wa_pending_payment_verifications;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.integration_payment_release WHERE singleton AND retention_ready) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shared_payment_activation_required';
  END IF;
  PERFORM private.wa_require_retention();
  IF p_worker_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verification_worker_required'; END IF;
  PERFORM 1 FROM public.whatsapp_settings WHERE singleton FOR SHARE;
  WITH exhausted AS (
    SELECT id FROM private.wa_pending_payment_verifications
    WHERE state='unresolved' AND attempt_count=6 AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())
      AND (p_order_id IS NULL OR order_id=p_order_id) ORDER BY first_seen,id LIMIT 100 FOR UPDATE SKIP LOCKED
  ) UPDATE private.wa_pending_payment_verifications expired_pending SET state='needs_review',safe_reason='verification_attempts_exhausted',
      lease_token=NULL,lease_expires_at=NULL,lease_worker_id=NULL FROM exhausted WHERE expired_pending.id=exhausted.id;
  SELECT * INTO pending FROM private.wa_pending_payment_verifications
    WHERE state='unresolved' AND attempt_id IS NOT NULL AND outcome_id IS NOT NULL AND attempt_count<6
      AND next_attempt<=clock_timestamp() AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())
      AND (p_order_id IS NULL OR order_id=p_order_id) ORDER BY next_attempt,id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE private.wa_pending_payment_verifications SET attempt_count=attempt_count+1,last_attempt=clock_timestamp(),
    lease_token=(gen_random_uuid()),lease_expires_at=clock_timestamp()+interval '45 seconds',lease_worker_id=p_worker_id
    WHERE id=pending.id RETURNING * INTO pending;
  RETURN jsonb_build_object('id',pending.id,'order_id',pending.order_id,'attempt_id',pending.attempt_id,'outcome_id',pending.outcome_id,
    'invoice_id',pending.invoice_id,'transaction_payment_id',pending.transaction_payment_id,
    'external_identifier',pending.signed_external_identifier,'attempt_count',pending.attempt_count,
    'lease_token',pending.lease_token,'lease_expires_at',pending.lease_expires_at);
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_verified_status(p_verified jsonb,p_source text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE status jsonb; mapped text; identity text;
BEGIN
  IF jsonb_typeof(p_verified) IS DISTINCT FROM 'object' OR octet_length(p_verified::text)>8192 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_payment_attestation';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('signed_webhook','verified_callback','payment_sweep','admin_verification') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_verified_payment_source';
  END IF;
  status:=p_verified-ARRAY['pending_id','lease_token'];
  mapped:=private.integration_payment_status(status,CASE WHEN p_source='admin_verification'
    THEN 'admin_verification' ELSE 'verified_callback' END);
  PERFORM private.integration_payment_details(status->'details');
  IF mapped<>'paid' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verified_success_required'; END IF;
  FOREACH identity IN ARRAY ARRAY['pending_id','lease_token'] LOOP
    IF jsonb_typeof(p_verified->identity) IS DISTINCT FROM 'string' OR (p_verified->>identity) !~*
      '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verification_lease_required';
    END IF;
  END LOOP;
  IF p_source='admin_verification' THEN
    IF jsonb_typeof(status->'actor_id') IS DISTINCT FROM 'string' OR status->>'actor_id' !~*
      '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verified_admin_actor_required';
    END IF;
    PERFORM private.wa_require_admin((status->>'actor_id')::uuid);
  END IF;
  RETURN status;
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_verified_event(p_outcome private.wa_payment_outcomes,
  p_evidence private.wa_payment_evidence,p_order public.orders,p_pending private.wa_pending_payment_verifications)
RETURNS public.whatsapp_notification_events LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE event public.whatsapp_notification_events; reason text; expansion text;
BEGIN
  IF p_outcome.owner='legacy' THEN RETURN event; END IF;
  reason:=CASE WHEN p_outcome.input_snapshot#>>'{whatsapp,manual_only}'='true' THEN 'historical_or_manual_only'
    WHEN p_order.payment_status<>'paid' OR p_order.order_status='cancelled' THEN 'order_no_longer_eligible'
    WHEN p_pending.first_seen<=clock_timestamp()-interval '24 hours' THEN 'notification_stale'
    WHEN NOT p_outcome.integration_enabled OR NOT p_outcome.automation_enabled THEN 'automation_disabled'
    ELSE p_outcome.input_snapshot#>>'{whatsapp,configuration_error}' END;
  expansion:=CASE WHEN reason='notification_configuration_invalid' OR reason IS NULL THEN 'enqueue_failed' ELSE 'skipped' END;
  INSERT INTO public.whatsapp_notification_events(order_id,outcome_id,evidence_id,provider,account_identity,settings_revision,
    expansion_state,safe_reason,next_repair_at)
    VALUES(p_order.id,p_outcome.id,p_evidence.id,p_outcome.provider,p_outcome.account_identity,p_outcome.settings_revision,
      expansion,coalesce(reason,'expansion_pending'),CASE WHEN reason IS NULL THEN clock_timestamp() ELSE NULL END)
    ON CONFLICT(order_id,event_kind) DO NOTHING;
  SELECT * INTO event FROM public.whatsapp_notification_events WHERE order_id=p_order.id AND event_kind='order.paid' FOR UPDATE;
  IF event.outcome_id IS DISTINCT FROM p_outcome.id OR event.evidence_id IS DISTINCT FROM p_evidence.id THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='immutable_notification_evidence_conflict';
  END IF;
  INSERT INTO private.wa_event_input_revisions(event_id,input_revision,settings_revision,input_snapshot)
    VALUES(event.id,1,p_outcome.settings_revision,p_outcome.input_snapshot) ON CONFLICT DO NOTHING;
  RETURN event;
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_verified_shipa_receipt(p_outcome private.wa_payment_outcomes,
  p_evidence private.wa_payment_evidence,p_order public.orders,p_pending private.wa_pending_payment_verifications)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE decision text:=p_outcome.input_snapshot#>>'{shipa,decision}'; receipt private.order_payment_verifications;
BEGIN
  IF decision='enqueued' AND (p_order.payment_status<>'paid' OR p_order.order_status='cancelled'
    OR p_pending.first_seen<=clock_timestamp()-interval '24 hours') THEN decision:='integrity_hold'; END IF;
  INSERT INTO private.order_payment_verifications(order_id,outcome_id,provider,payment_attempt_id,invoice_id,payment_id,
    amount_millis,currency,source,dispatch_decision)
    VALUES(p_order.id,p_outcome.id,'myfatoorah',p_evidence.attempt_id,p_evidence.invoice_id,p_evidence.transaction_payment_id,
      (p_evidence.amount*1000)::bigint,p_evidence.currency,CASE
        WHEN p_outcome.input_snapshot->>'entrypoint'='admin_verification' THEN 'manual_reverification'
        WHEN p_outcome.source='signed_webhook' THEN 'webhook' ELSE 'callback' END,decision)
    ON CONFLICT(order_id) DO NOTHING;
  SELECT * INTO receipt FROM private.order_payment_verifications WHERE order_id=p_order.id;
  IF receipt.outcome_id IS DISTINCT FROM p_outcome.id OR receipt.payment_attempt_id IS DISTINCT FROM p_evidence.attempt_id
    OR receipt.invoice_id IS DISTINCT FROM p_evidence.invoice_id OR receipt.payment_id IS DISTINCT FROM p_evidence.transaction_payment_id
    OR receipt.amount_millis IS DISTINCT FROM (p_evidence.amount*1000)::bigint OR receipt.currency IS DISTINCT FROM p_evidence.currency THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='immutable_shipa_payment_evidence_conflict';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_verified_evidence(p_outcome private.wa_payment_outcomes,
  p_attempt public.payment_attempts,p_status jsonb,p_source text)
RETURNS private.wa_payment_evidence LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE evidence private.wa_payment_evidence;
BEGIN
  IF p_outcome.attempt_id IS DISTINCT FROM p_attempt.id OR p_outcome.invoice_id IS DISTINCT FROM p_attempt.invoice_id
    OR p_outcome.transaction_payment_id IS DISTINCT FROM p_status->>'transaction_payment_id' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='first_success_evidence_mismatch';
  END IF;
  INSERT INTO private.wa_payment_evidence(outcome_id,order_id,attempt_id,invoice_id,transaction_payment_id,amount,currency,source)
    VALUES(p_outcome.id,p_outcome.order_id,p_attempt.id,p_attempt.invoice_id,p_outcome.transaction_payment_id,
      p_attempt.amount,p_attempt.currency,p_source) ON CONFLICT(outcome_id) DO NOTHING;
  SELECT * INTO evidence FROM private.wa_payment_evidence WHERE outcome_id=p_outcome.id;
  IF evidence.attempt_id IS DISTINCT FROM p_attempt.id OR evidence.invoice_id IS DISTINCT FROM p_attempt.invoice_id
    OR evidence.transaction_payment_id IS DISTINCT FROM p_outcome.transaction_payment_id
    OR evidence.amount IS DISTINCT FROM p_attempt.amount OR evidence.currency IS DISTINCT FROM p_attempt.currency THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='immutable_payment_evidence_conflict';
  END IF;
  RETURN evidence;
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_apply_verified_payment(p_order_id uuid,p_attempt_id uuid,p_verified_result jsonb,p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE ordered public.orders; attempt public.payment_attempts; outcome private.wa_payment_outcomes;
  pending private.wa_pending_payment_verifications; evidence private.wa_payment_evidence;
  event public.whatsapp_notification_events; status jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.integration_payment_release WHERE singleton AND retention_ready) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shared_payment_activation_required';
  END IF;
  status:=private.integration_verified_status(p_verified_result,p_source);
  PERFORM 1 FROM public.whatsapp_settings WHERE singleton FOR SHARE;
  PERFORM 1 FROM public.integrations WHERE provider='shipa' FOR SHARE;
  SELECT * INTO ordered FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='payment_order_missing'; END IF;
  attempt:=private.integration_bind_invoice(p_order_id,p_attempt_id,status,'verified_callback');
  SELECT * INTO outcome FROM private.wa_payment_outcomes WHERE order_id=p_order_id FOR UPDATE;
  IF outcome.id IS NULL OR ordered.total IS DISTINCT FROM attempt.amount
    OR (outcome.input_snapshot#>>'{facts,stored_order_total}')::numeric IS DISTINCT FROM attempt.amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verified_order_amount_mismatch';
  END IF;
  SELECT * INTO pending FROM private.wa_pending_payment_verifications WHERE id=(p_verified_result->>'pending_id')::uuid FOR UPDATE;
  IF NOT FOUND OR pending.order_id IS DISTINCT FROM p_order_id OR pending.attempt_id IS DISTINCT FROM p_attempt_id
    OR pending.outcome_id IS DISTINCT FROM outcome.id OR pending.invoice_id IS DISTINCT FROM status->>'invoice_id'
    OR pending.transaction_payment_id IS DISTINCT FROM status->>'transaction_payment_id'
    OR pending.lease_token IS DISTINCT FROM (p_verified_result->>'lease_token')::uuid
    OR pending.attempt_count<1 OR pending.state NOT IN ('unresolved','resolved') THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='verification_lease_conflict';
  END IF;
  evidence:=private.integration_verified_evidence(outcome,attempt,status,p_source);
  event:=private.integration_verified_event(outcome,evidence,ordered,pending);
  PERFORM private.integration_verified_shipa_receipt(outcome,evidence,ordered,pending);
  UPDATE private.wa_pending_payment_verifications SET state='resolved',safe_reason=NULL WHERE id=pending.id;
  RETURN jsonb_build_object('evidence_id',evidence.id,'event_id',event.id,
    'expansion_state',CASE WHEN outcome.owner='legacy' THEN 'legacy_owned' ELSE event.expansion_state END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_resolve_pending_payment_verification(p_pending_id uuid,p_lease_token uuid,
  p_verified_result jsonb,p_terminal_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE pending private.wa_pending_payment_verifications; code text; delay_minutes integer;
BEGIN
  SELECT * INTO pending FROM private.wa_pending_payment_verifications WHERE id=p_pending_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='pending_payment_missing'; END IF;
  IF p_terminal_state='resolved' THEN
    RETURN public.wa_apply_verified_payment(pending.order_id,pending.attempt_id,
      p_verified_result||jsonb_build_object('pending_id',p_pending_id,'lease_token',p_lease_token),'payment_sweep');
  END IF;
  IF p_terminal_state IS NULL OR p_terminal_state NOT IN ('retry','evidence_mismatch','needs_review') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_verification_resolution';
  END IF;
  PERFORM private.wa_check_keys(p_verified_result,ARRAY['code']);
  code:=p_verified_result->>'code';
  IF code IS NULL OR code NOT IN ('provider_unavailable','provider_timeout','provider_response_invalid',
    'payment_identity_mismatch','payment_amount_mismatch','verification_unsupported') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_verification_reason';
  END IF;
  IF (p_terminal_state='retry' AND code NOT IN ('provider_unavailable','provider_timeout','provider_response_invalid'))
    OR (p_terminal_state='evidence_mismatch' AND code NOT IN ('payment_identity_mismatch','payment_amount_mismatch')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_verification_resolution';
  END IF;
  PERFORM 1 FROM public.whatsapp_settings WHERE singleton FOR SHARE;
  PERFORM 1 FROM public.orders WHERE id=pending.order_id FOR UPDATE;
  SELECT * INTO pending FROM private.wa_pending_payment_verifications WHERE id=p_pending_id FOR UPDATE;
  IF pending.state<>'unresolved' OR pending.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='verification_lease_conflict';
  END IF;
  IF p_terminal_state='retry' AND pending.attempt_count=6 THEN
    p_terminal_state:='needs_review'; code:='verification_attempts_exhausted';
  ELSIF p_terminal_state='retry' AND pending.first_seen<=clock_timestamp()-interval '24 hours' THEN
    p_terminal_state:='needs_review'; code:='notification_stale';
  END IF;
  delay_minutes:=(ARRAY[1,5,15,30,60])[pending.attempt_count];
  UPDATE private.wa_pending_payment_verifications SET state=CASE WHEN p_terminal_state='retry' THEN 'unresolved' ELSE p_terminal_state END,
    next_attempt=CASE WHEN p_terminal_state='retry' THEN clock_timestamp()+make_interval(mins=>delay_minutes) ELSE next_attempt END,
    safe_reason=code,lease_token=NULL,lease_expires_at=NULL,lease_worker_id=NULL WHERE id=pending.id RETURNING * INTO pending;
  RETURN jsonb_build_object('id',pending.id,'state',pending.state,'attempt_count',pending.attempt_count,
    'next_attempt',pending.next_attempt,'safe_reason',pending.safe_reason);
END
$fn$;

REVOKE ALL ON FUNCTION public.wa_list_pending_payment_verifications(uuid,integer),
  public.wa_claim_pending_payment_verification(uuid,uuid),public.wa_apply_verified_payment(uuid,uuid,jsonb,text),
  public.wa_resolve_pending_payment_verification(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_list_pending_payment_verifications(uuid,integer),
  public.wa_claim_pending_payment_verification(uuid,uuid),public.wa_apply_verified_payment(uuid,uuid,jsonb,text),
  public.wa_resolve_pending_payment_verification(uuid,uuid,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION private.integration_verified_status(jsonb,text),
  private.integration_verified_event(private.wa_payment_outcomes,private.wa_payment_evidence,public.orders,private.wa_pending_payment_verifications),
  private.integration_verified_shipa_receipt(private.wa_payment_outcomes,private.wa_payment_evidence,public.orders,private.wa_pending_payment_verifications),
  private.integration_verified_evidence(private.wa_payment_outcomes,public.payment_attempts,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
