-- Completion needs the exact current token, not a service credential alone.
-- Permanent failure/exhaustion follows the agreed review policy. It does not
-- create retry authority; explicit staff retry is a separate audited contract.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,1);

CREATE OR REPLACE FUNCTION private.wa_validate_delivery_outcome(p_outcome jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE kind text; code text; retry_after numeric;
BEGIN
  kind:=p_outcome->>'kind'; code:=p_outcome->>'code';
  IF kind='accepted' THEN
    PERFORM private.wa_check_keys(p_outcome,ARRAY['kind','providerMessageId']);
    IF jsonb_typeof(p_outcome->'providerMessageId') IS DISTINCT FROM 'string' OR
      length(p_outcome->>'providerMessageId') NOT BETWEEN 1 AND 250 OR
      btrim(p_outcome->>'providerMessageId')<>p_outcome->>'providerMessageId' OR
      (p_outcome->>'providerMessageId')~'[[:cntrl:]]' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_delivery_outcome';
    END IF;
  ELSIF kind IN ('not_accepted','uncertain') THEN
    PERFORM private.wa_check_keys(p_outcome,CASE WHEN kind='uncertain' THEN ARRAY['kind','code']
      ELSE ARRAY['kind','code','retryable','retryAfterSeconds'] END);
    IF code IS NULL OR code NOT IN ('wa_recipient_invalid','wa_message_invalid','wa_provider_not_accepted',
      'wa_evolution_endpoint_invalid','wa_evolution_redirect_rejected','wa_evolution_timeout','wa_evolution_response_too_large',
      'wa_evolution_response_invalid','wa_evolution_unreachable','wa_evolution_rate_limited','wa_evolution_rejected',
      'wa_evolution_rejection_unconfirmed','wa_evolution_server_error','wa_postora_endpoint_invalid',
      'wa_postora_redirect_rejected','wa_postora_timeout','wa_postora_response_too_large','wa_postora_response_invalid',
      'wa_postora_unreachable','wa_postora_unauthorized','wa_postora_not_connected','wa_postora_rate_limited',
      'wa_postora_rejection_unconfirmed','wa_postora_server_error','wa_postora_send_failed','wa_delivery_internal_error') OR
      (kind='not_accepted' AND jsonb_typeof(p_outcome->'retryable') IS DISTINCT FROM 'boolean') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_delivery_outcome';
    END IF;
    -- Only an explicit proven-before-acceptance classification can authorize
    -- automatic retry. Current captured provider adapters never emit this yet.
    IF kind='not_accepted' AND (p_outcome->>'retryable')::boolean AND code<>'wa_provider_not_accepted' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unproven_retry_classification';
    END IF;
    IF p_outcome?'retryAfterSeconds' THEN
      IF jsonb_typeof(p_outcome->'retryAfterSeconds') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_delivery_outcome';
      END IF;
      retry_after:=(p_outcome->>'retryAfterSeconds')::numeric;
      IF retry_after<0 OR retry_after>86400 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_delivery_outcome'; END IF;
    END IF;
  ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_delivery_outcome';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_finish_delivery(p_job_id uuid,p_attempt_token uuid,p_outcome jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE candidate public.whatsapp_delivery_jobs; job public.whatsapp_delivery_jobs;
  attempt public.whatsapp_delivery_attempts; kind text; completion_reason text; provider_id text;
  next_state text; due timestamptz; observed_at timestamptz; lease_id uuid; late boolean; identity_conflict boolean:=false;
BEGIN
  PERFORM private.wa_require_retention();
  PERFORM private.wa_validate_delivery_outcome(p_outcome);
  IF p_job_id IS NULL OR p_attempt_token IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_delivery_binding'; END IF;
  SELECT * INTO candidate FROM public.whatsapp_delivery_jobs WHERE id=p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='delivery_job_missing'; END IF;
  PERFORM 1 FROM public.whatsapp_account_dispatch WHERE provider=candidate.provider AND account_identity=candidate.account_identity FOR UPDATE;
  SELECT * INTO STRICT job FROM public.whatsapp_delivery_jobs WHERE id=p_job_id FOR UPDATE;
  IF job.attempt_token IS DISTINCT FROM p_attempt_token THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='delivery_attempt_conflict'; END IF;
  lease_id:=p_attempt_token;
  SELECT * INTO attempt FROM public.whatsapp_delivery_attempts WHERE job_id=job.id AND attempt_token=lease_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='delivery_attempt_conflict'; END IF;
  kind:=p_outcome->>'kind'; provider_id:=p_outcome->>'providerMessageId'; completion_reason:=p_outcome->>'code'; observed_at:=clock_timestamp();
  IF job.state IN ('accepted','delivered','read','failed') THEN
    RETURN private.wa_delivery_summary(job,false,kind='accepted' AND job.provider_message_id IS DISTINCT FROM provider_id);
  END IF;
  late:=attempt.finished_at IS NOT NULL;
  IF late AND NOT (attempt.outcome='uncertain' AND job.state='needs_review' AND kind='accepted') THEN
    IF attempt.outcome='not_accepted' AND job.state='queued' AND kind IN ('accepted','uncertain') THEN
      -- Contradictory evidence must stop a scheduled safe retry immediately.
      UPDATE public.whatsapp_delivery_jobs SET state='needs_review',safe_reason='delivery_result_conflict',updated_at=observed_at
        WHERE id=job.id RETURNING * INTO job;
      INSERT INTO private.wa_delivery_transitions(job_id,attempt_token,transition,safe_reason)
        VALUES(job.id,p_attempt_token,'result_conflict','delivery_result_conflict');
      RETURN private.wa_delivery_summary(job,true,true);
    END IF;
    RETURN private.wa_delivery_summary(job,false);
  END IF;
  IF job.state NOT IN ('sending','needs_review') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='delivery_state_conflict'; END IF;
  next_state:=CASE WHEN kind='accepted' THEN 'accepted' ELSE 'needs_review' END; due:=job.due_at;
  IF kind='not_accepted' AND (p_outcome->>'retryable')::boolean AND job.attempt_count<3 THEN
    next_state:='queued';
    due:=observed_at+make_interval(secs=>greatest(CASE WHEN job.attempt_count=1 THEN 60 ELSE 300 END,
      coalesce((p_outcome->>'retryAfterSeconds')::numeric,0))::double precision);
  END IF;
  IF kind='not_accepted' AND job.attempt_count>=3 THEN completion_reason:='delivery_attempts_exhausted'; END IF;
  BEGIN
    UPDATE public.whatsapp_delivery_jobs SET state=next_state,provider_message_id=provider_id,
      safe_reason=completion_reason,due_at=due,updated_at=observed_at WHERE id=job.id RETURNING * INTO job;
  EXCEPTION WHEN unique_violation THEN
    -- A reused provider identity cannot bind two jobs or authorize a resend.
    identity_conflict:=true; kind:='uncertain'; completion_reason:='provider_identity_conflict';
    UPDATE public.whatsapp_delivery_jobs SET state='needs_review',safe_reason=completion_reason,updated_at=observed_at
      WHERE id=job.id RETURNING * INTO job;
  END;
  UPDATE public.whatsapp_delivery_attempts SET outcome=kind,retryable=CASE WHEN kind='not_accepted' THEN (p_outcome->>'retryable')::boolean ELSE false END,
    provider_message_id=provider_id,safe_reason=completion_reason,finished_at=observed_at WHERE id=attempt.id;
  INSERT INTO private.wa_delivery_transitions(job_id,attempt_token,transition,safe_reason)
    VALUES(job.id,p_attempt_token,CASE WHEN late THEN 'late_result' ELSE 'finished' END,completion_reason);
  PERFORM private.wa_release_delivery_slot(job);
  RETURN private.wa_delivery_summary(job,true,identity_conflict);
END
$fn$;

REVOKE ALL ON FUNCTION private.wa_validate_delivery_outcome(jsonb),public.wa_finish_delivery(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.wa_finish_delivery(uuid,uuid,jsonb) TO service_role;
COMMIT;
