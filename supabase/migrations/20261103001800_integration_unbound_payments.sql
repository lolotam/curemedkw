-- Persist success-mapped signed tuples before their server invoice mapping
-- exists. SQL records no unsigned amount and performs no provider request.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,18);
ALTER TABLE private.wa_pending_payment_verifications ADD COLUMN IF NOT EXISTS signed_attestation jsonb
  CHECK(signed_attestation IS NULL OR (jsonb_typeof(signed_attestation)='object' AND octet_length(signed_attestation::text)<=8192));

CREATE OR REPLACE FUNCTION public.wa_find_canonical_payment_attempt(p_invoice_id text,p_external_identifier uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE attempt public.payment_attempts; candidates integer;
BEGIN
  IF p_invoice_id IS NULL OR length(p_invoice_id) NOT BETWEEN 1 AND 200 OR p_external_identifier IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_payment_identity';
  END IF;
  SELECT count(*) INTO candidates FROM public.payment_attempts WHERE provider='myfatoorah' AND invoice_id=p_invoice_id;
  IF candidates=0 THEN RETURN jsonb_build_object('state','missing'); END IF;
  IF candidates<>1 THEN RETURN jsonb_build_object('state','ambiguous'); END IF;
  SELECT * INTO STRICT attempt FROM public.payment_attempts WHERE provider='myfatoorah' AND invoice_id=p_invoice_id;
  IF attempt.order_id<>p_external_identifier OR attempt.amount<=0 OR attempt.amount='NaN'::numeric OR attempt.currency<>'KWD' THEN
    RETURN jsonb_build_object('state','mismatch');
  END IF;
  RETURN jsonb_build_object('state','found','order_id',attempt.order_id,'attempt_id',attempt.id,
    'amount_millis',attempt.amount*1000,'currency',attempt.currency);
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_unbound_summary(p_pending private.wa_pending_payment_verifications,p_payment jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('pending_id',p_pending.id,'processed',p_pending.order_id IS NOT NULL AND p_pending.attempt_id IS NOT NULL
      AND (p_pending.outcome_id IS NOT NULL OR p_pending.state='superseded'),
    'retryable',p_pending.order_id IS NULL AND p_pending.state='unresolved' AND p_pending.first_seen>now()-interval '5 minutes',
    'state',p_pending.state,'safe_reason',p_pending.safe_reason,'payment_result',p_payment)
$fn$;

CREATE OR REPLACE FUNCTION public.wa_record_unbound_payment_status(p_signed_status jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE pending private.wa_pending_payment_verifications; status jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.integration_payment_release WHERE singleton AND retention_ready) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shared_payment_activation_required';
  END IF;
  PERFORM private.wa_require_retention();
  IF private.integration_payment_status(p_signed_status,'signed_webhook')<>'paid' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unbound_success_required';
  END IF;
  status:=jsonb_set(p_signed_status,'{details}',private.integration_payment_details(p_signed_status->'details'));
  status:=jsonb_set(status,'{external_identifier}',to_jsonb(lower(status->>'external_identifier')));
  PERFORM 1 FROM public.whatsapp_settings WHERE singleton FOR SHARE;
  INSERT INTO private.wa_pending_payment_verifications(invoice_id,transaction_payment_id,signed_external_identifier,signed_status,
    signed_attestation,safe_reason) VALUES(status->>'invoice_id',status->>'transaction_payment_id',status->>'external_identifier',
      'PAID',status,'payment_attempt_mapping_pending') ON CONFLICT(invoice_id,transaction_payment_id) DO NOTHING;
  SELECT * INTO pending FROM private.wa_pending_payment_verifications
    WHERE invoice_id=status->>'invoice_id' AND transaction_payment_id=status->>'transaction_payment_id' FOR UPDATE;
  IF lower(pending.signed_external_identifier) IS DISTINCT FROM status->>'external_identifier' THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='pending_payment_identity_conflict';
  END IF;
  IF pending.signed_attestation IS NULL THEN
    UPDATE private.wa_pending_payment_verifications SET signed_attestation=status WHERE id=pending.id RETURNING * INTO pending;
  END IF;
  IF pending.order_id IS NULL AND pending.state='unresolved' AND pending.first_seen<=clock_timestamp()-interval '5 minutes' THEN
    UPDATE private.wa_pending_payment_verifications SET state='needs_review',safe_reason='payment_attempt_mapping_unresolved'
      WHERE id=pending.id RETURNING * INTO pending;
  END IF;
  RETURN private.integration_unbound_summary(pending);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_list_unbound_payment_statuses(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_verification_limit';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(document ORDER BY first_seen,id),'[]') FROM (
    SELECT id,first_seen,jsonb_build_object('pending_id',id,'first_seen',first_seen) document
    FROM private.wa_pending_payment_verifications WHERE order_id IS NULL AND state='unresolved'
      AND signed_attestation IS NOT NULL AND next_attempt<=now() ORDER BY first_seen,id LIMIT p_limit) due);
END
$fn$;

-- Binding must preserve age, budget, lease and terminal review history.
CREATE OR REPLACE FUNCTION private.integration_schedule_verification(p_outcome private.wa_payment_outcomes)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE pending private.wa_pending_payment_verifications;
BEGIN
  IF EXISTS(SELECT 1 FROM private.wa_payment_evidence WHERE outcome_id=p_outcome.id) THEN RETURN; END IF;
  INSERT INTO private.wa_pending_payment_verifications(order_id,attempt_id,outcome_id,invoice_id,
    transaction_payment_id,signed_external_identifier,signed_status)
    VALUES(p_outcome.order_id,p_outcome.attempt_id,p_outcome.id,p_outcome.invoice_id,
      p_outcome.transaction_payment_id,p_outcome.order_id::text,'PAID') ON CONFLICT(invoice_id,transaction_payment_id) DO NOTHING;
  SELECT * INTO pending FROM private.wa_pending_payment_verifications
    WHERE invoice_id=p_outcome.invoice_id AND transaction_payment_id=p_outcome.transaction_payment_id FOR UPDATE;
  IF pending.order_id IS NULL AND pending.attempt_id IS NULL AND pending.outcome_id IS NULL
    AND lower(pending.signed_external_identifier)=p_outcome.order_id::text AND pending.state IN ('unresolved','needs_review') THEN
    UPDATE private.wa_pending_payment_verifications SET order_id=p_outcome.order_id,attempt_id=p_outcome.attempt_id,
      outcome_id=p_outcome.id,safe_reason=CASE WHEN state='unresolved' THEN NULL ELSE safe_reason END
      WHERE id=pending.id RETURNING * INTO pending;
  END IF;
  IF pending.order_id IS DISTINCT FROM p_outcome.order_id OR pending.attempt_id IS DISTINCT FROM p_outcome.attempt_id
    OR pending.outcome_id IS DISTINCT FROM p_outcome.id THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='pending_payment_binding_conflict';
  END IF;
END
$fn$;

-- Recovery age also gates cutover-0 legacy expansion; late binding must
-- record paid status without manufacturing a fresh notification window.
CREATE OR REPLACE FUNCTION private.integration_record_first_success(p_order public.orders,p_attempt public.payment_attempts,
  p_status jsonb,p_source text)
RETURNS private.wa_payment_outcomes LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE settings public.whatsapp_settings; outcome private.wa_payment_outcomes;
  manual_only boolean; snapshot jsonb; wa jsonb; stale boolean;
BEGIN
  SELECT * INTO STRICT settings FROM public.whatsapp_settings WHERE singleton;
  PERFORM id FROM public.order_items WHERE order_id=p_order.id ORDER BY id FOR SHARE;
  stale:=EXISTS(SELECT 1 FROM private.wa_pending_payment_verifications WHERE invoice_id=p_attempt.invoice_id
    AND transaction_payment_id=p_status->>'transaction_payment_id' AND lower(signed_external_identifier)=p_order.id::text
    AND first_seen<=clock_timestamp()-interval '24 hours');
  manual_only:=stale OR p_order.payment_status IN ('paid','refunded','partially_refunded')
    OR p_order.order_status='cancelled' OR p_source='admin_verification';
  wa:=private.integration_whatsapp_snapshot(settings,manual_only);
  snapshot:=jsonb_build_object('version',1,'entrypoint',p_source,'whatsapp',wa,
    'shipa',private.integration_shipa_snapshot(p_order,p_source,manual_only),'facts',private.integration_payment_facts(p_order,p_attempt));
  INSERT INTO private.wa_payment_outcomes(order_id,attempt_id,invoice_id,transaction_payment_id,source,owner,
    provider,account_identity,settings_revision,integration_enabled,automation_enabled,input_snapshot,
    legacy_expansion_state,safe_reason)
    VALUES(p_order.id,p_attempt.id,p_attempt.invoice_id,p_status->>'transaction_payment_id',
      CASE WHEN p_source='signed_webhook' THEN 'signed_webhook' ELSE 'verified_callback' END,wa->>'owner',wa->>'provider',
      wa->>'account_identity',settings.settings_revision,(wa->>'integration_enabled')::boolean,(wa->>'automation_enabled')::boolean,snapshot,
      CASE WHEN manual_only THEN 'skipped' WHEN wa->>'configuration_error' IS NOT NULL THEN 'enqueue_failed' ELSE 'pending' END,
      CASE WHEN stale THEN 'notification_stale' WHEN manual_only THEN 'historical_or_manual_only' ELSE wa->>'configuration_error' END) RETURNING * INTO outcome;
  RETURN outcome;
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_bind_unbound_payment_status(p_pending_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE pending private.wa_pending_payment_verifications; identity jsonb; payment jsonb; mapped_state text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.integration_payment_release WHERE singleton AND retention_ready) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shared_payment_activation_required';
  END IF;
  SELECT * INTO pending FROM private.wa_pending_payment_verifications WHERE id=p_pending_id;
  IF NOT FOUND OR pending.signed_attestation IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='unbound_payment_missing';
  END IF;
  IF pending.order_id IS NOT NULL THEN RETURN private.integration_unbound_summary(pending); END IF;
  identity:=public.wa_find_canonical_payment_attempt(pending.invoice_id,(pending.signed_external_identifier)::uuid);
  IF identity->>'state'='found' AND pending.state IN ('unresolved','needs_review') THEN
    -- This acquires settings -> order -> attempt -> pending in the shared
    -- owner's order. Never lock the pending row before that call.
    payment:=public.wa_record_provider_payment_outcome((identity->>'order_id')::uuid,(identity->>'attempt_id')::uuid,
      pending.signed_attestation,'signed_webhook');
    SELECT * INTO pending FROM private.wa_pending_payment_verifications WHERE id=p_pending_id FOR UPDATE;
    IF pending.outcome_id IS NULL THEN
      UPDATE private.wa_pending_payment_verifications SET order_id=(identity->>'order_id')::uuid,
        attempt_id=(identity->>'attempt_id')::uuid,state='superseded',safe_reason='payment_superseded'
        WHERE id=pending.id RETURNING * INTO pending;
    END IF;
    RETURN private.integration_unbound_summary(pending,payment);
  END IF;
  PERFORM 1 FROM public.whatsapp_settings WHERE singleton FOR SHARE;
  SELECT * INTO pending FROM private.wa_pending_payment_verifications WHERE id=p_pending_id FOR UPDATE;
  IF pending.order_id IS NOT NULL OR pending.state<>'unresolved' THEN RETURN private.integration_unbound_summary(pending); END IF;
  mapped_state:=identity->>'state';
  UPDATE private.wa_pending_payment_verifications SET state=CASE
      WHEN mapped_state IN ('ambiguous','mismatch') THEN 'evidence_mismatch'
      WHEN first_seen<=clock_timestamp()-interval '5 minutes' THEN 'needs_review' ELSE state END,
    safe_reason=CASE mapped_state WHEN 'ambiguous' THEN 'payment_invoice_mapping_ambiguous'
      WHEN 'mismatch' THEN 'payment_identity_mismatch'
      ELSE CASE WHEN first_seen<=clock_timestamp()-interval '5 minutes' THEN 'payment_attempt_mapping_unresolved'
        ELSE 'payment_attempt_mapping_pending' END END,
    next_attempt=greatest(next_attempt,clock_timestamp()+interval '30 seconds') WHERE id=pending.id RETURNING * INTO pending;
  RETURN private.integration_unbound_summary(pending);
END
$fn$;

REVOKE ALL ON FUNCTION public.wa_find_canonical_payment_attempt(text,uuid),public.wa_record_unbound_payment_status(jsonb),
  public.wa_list_unbound_payment_statuses(integer),public.wa_bind_unbound_payment_status(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_find_canonical_payment_attempt(text,uuid),public.wa_record_unbound_payment_status(jsonb),
  public.wa_list_unbound_payment_statuses(integer),public.wa_bind_unbound_payment_status(uuid) TO service_role;
REVOKE ALL ON FUNCTION private.integration_unbound_summary(private.wa_pending_payment_verifications,jsonb),
  private.integration_schedule_verification(private.wa_payment_outcomes) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
