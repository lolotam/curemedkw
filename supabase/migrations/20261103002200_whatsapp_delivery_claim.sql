-- Additive feature objects only. No deployed payment writer or application
-- table policy/trigger is activated here. No function performs network I/O.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,1);

ALTER TABLE public.whatsapp_delivery_attempts
  ADD COLUMN IF NOT EXISTS credential_binding text,
  ADD COLUMN IF NOT EXISTS session_generation bigint;
CREATE TABLE IF NOT EXISTS private.wa_delivery_transitions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.whatsapp_delivery_jobs(id) ON DELETE RESTRICT,
  attempt_token uuid NOT NULL,
  transition text NOT NULL CHECK(transition IN ('claimed','expired','finished','late_result','result_conflict')),
  safe_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.wa_delivery_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.wa_delivery_transitions FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE private.wa_delivery_transitions_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.wa_delivery_summary(p_job public.whatsapp_delivery_jobs,p_changed boolean,p_conflict boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('job_id',p_job.id,'state',p_job.state,'attempt_count',p_job.attempt_count,
    'provider_message_id',p_job.provider_message_id,'due_at',p_job.due_at,'safe_reason',p_job.safe_reason,
    'parked_reason',p_job.parked_reason,'updated_at',p_job.updated_at,'changed',p_changed,'conflict',p_conflict)
$fn$;

-- Caller holds account before job. Retaining the job token/expiry allows a
-- definitive late result for that attempt, without granting another attempt.
CREATE OR REPLACE FUNCTION private.wa_release_delivery_slot(p_job public.whatsapp_delivery_jobs)
RETURNS void LANGUAGE sql SET search_path=pg_catalog,public AS $fn$
  UPDATE public.whatsapp_account_dispatch SET active_job_id=NULL,lease_expires_at=NULL,
    next_slot_at=greatest(next_slot_at,clock_timestamp()+interval '1 second')
    WHERE provider=p_job.provider AND account_identity=p_job.account_identity AND active_job_id=p_job.id
$fn$;

CREATE OR REPLACE FUNCTION public.wa_expire_delivery_leases(p_job_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE slot public.whatsapp_account_dispatch; job public.whatsapp_delivery_jobs;
  observed_at timestamptz; lease_id uuid; expired integer:=0;
BEGIN
  PERFORM private.wa_require_retention();
  FOR slot IN SELECT * FROM public.whatsapp_account_dispatch
    WHERE active_job_id IS NOT NULL AND lease_expires_at<=clock_timestamp()
      AND (p_job_id IS NULL OR active_job_id=p_job_id)
    ORDER BY provider,account_identity LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
    observed_at:=clock_timestamp();
    SELECT * INTO STRICT job FROM public.whatsapp_delivery_jobs WHERE id=slot.active_job_id FOR UPDATE;
    IF job.state='sending' THEN
      IF job.lease_expires_at IS NULL OR job.attempt_token IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='delivery_lease_inconsistent';
      END IF;
      IF job.lease_expires_at>observed_at THEN CONTINUE; END IF;
      lease_id:=job.attempt_token;
      UPDATE public.whatsapp_delivery_jobs SET state='needs_review',safe_reason='delivery_lease_expired',updated_at=observed_at
        WHERE id=job.id;
      UPDATE public.whatsapp_delivery_attempts SET outcome='uncertain',retryable=false,
        safe_reason='delivery_lease_expired',finished_at=observed_at
        WHERE job_id=job.id AND attempt_token=lease_id AND finished_at IS NULL;
      INSERT INTO private.wa_delivery_transitions(job_id,attempt_token,transition,safe_reason)
        VALUES(job.id,job.attempt_token,'expired','delivery_lease_expired');
      expired:=expired+1;
    END IF;
    PERFORM private.wa_release_delivery_slot(job);
  END LOOP;
  RETURN jsonb_build_object('expired',expired);
END
$fn$;

-- A refusal carries no content, credential or recipient. A parked job keeps
-- its original provider/content; a later explicit requeue is a separate gate.
CREATE OR REPLACE FUNCTION private.wa_delivery_gate(p_job public.whatsapp_delivery_jobs,p_settings public.whatsapp_settings)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE owner private.wa_payment_outcomes; event public.whatsapp_notification_events;
  order_state record; label text; enabled_audience boolean:=false;
BEGIN
  IF p_job.provider<>p_settings.provider THEN RETURN 'provider_changed'; END IF;
  IF p_job.account_identity IS DISTINCT FROM p_settings.account_identity THEN RETURN 'account_changed'; END IF;
  IF NOT p_settings.integration_enabled THEN RETURN 'integration_paused'; END IF;
  IF p_job.order_id IS NOT NULL THEN
    SELECT order_status,payment_status INTO order_state FROM public.orders WHERE id=p_job.order_id;
    IF NOT FOUND THEN RETURN 'order_missing'; END IF;
    IF lower(order_state.order_status::text) IN ('cancelled','canceled') OR
      lower(order_state.payment_status::text) IN ('refunded','partially_refunded','partial_refund','cancelled','canceled') THEN
      RETURN 'order_cancelled_or_refunded';
    END IF;
  END IF;
  IF p_job.job_class IN ('automation','legacy_event') AND p_job.outcome_id IS NOT NULL THEN
    SELECT * INTO owner FROM private.wa_payment_outcomes WHERE id=p_job.outcome_id;
    IF NOT FOUND OR owner.order_id IS DISTINCT FROM p_job.order_id OR owner.provider<>p_job.provider
      OR owner.account_identity IS DISTINCT FROM p_job.account_identity THEN RETURN 'payment_owner_mismatch'; END IF;
  END IF;
  IF p_job.job_class='automation' THEN
    SELECT * INTO event FROM public.whatsapp_notification_events WHERE id=p_job.event_id;
    IF owner.owner IS DISTINCT FROM 'durable' OR event.outcome_id IS DISTINCT FROM owner.id
      OR event.order_id IS DISTINCT FROM p_job.order_id OR event.expansion_state IS DISTINCT FROM 'expanded'
      OR event.provider IS DISTINCT FROM p_job.provider OR event.account_identity IS DISTINCT FROM p_job.account_identity
      OR NOT EXISTS(SELECT 1 FROM private.wa_payment_evidence evidence WHERE evidence.id=event.evidence_id AND evidence.outcome_id=owner.id) THEN
      RETURN 'payment_owner_mismatch';
    END IF;
    IF NOT p_settings.automation_enabled THEN RETURN 'automation_paused'; END IF;
    FOREACH label IN ARRAY p_job.audience_labels LOOP
      IF label IN ('buyer','admins','custom') AND p_settings.audiences#>ARRAY[label,'enabled']='true'::jsonb THEN enabled_audience:=true; END IF;
    END LOOP;
    IF NOT enabled_audience THEN RETURN 'audience_paused'; END IF;
  ELSIF p_job.job_class='legacy_event' THEN
    -- Request-backed shipped/old-shape events need the later explicit legacy
    -- event context contract; a request UUID alone cannot establish an event.
    IF owner.owner IS DISTINCT FROM 'legacy' THEN RETURN 'legacy_event_context_required'; END IF;
    -- Canonical buyer/admin audience switches are the current projection of
    -- order_paid/admin_new_order; the migration-time legacy_events is stale.
    IF p_settings.audiences#>ARRAY[p_job.audience,'enabled'] IS DISTINCT FROM 'true'::jsonb THEN RETURN 'audience_paused'; END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM private.wa_send_requests request WHERE request.id=p_job.request_id
      AND request.job_class=p_job.job_class AND request.actor_id IS NOT NULL) THEN RETURN 'manual_request_required'; END IF;
  END IF;
  RETURN NULL;
END
$fn$;

-- INTERNAL service-only response includes ciphertext and delivery PII. It must
-- never be forwarded to a browser or logged. Decrypt and validate locally;
-- commit this RPC before the single provider call. No browser actor is trusted.
CREATE OR REPLACE FUNCTION public.wa_claim_delivery(p_job_id uuid,p_actor_kind text,
  p_request_deadline timestamptz,p_actor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE settings public.whatsapp_settings; release private.wa_release_state; candidate public.whatsapp_delivery_jobs;
  job public.whatsapp_delivery_jobs; slot public.whatsapp_account_dispatch; credential private.wa_credentials;
  connection public.evolution_connections; media public.whatsapp_media_objects; reason text;
  observed_at timestamptz; next_token uuid; lease_id uuid; session_generation bigint;
BEGIN
  PERFORM private.wa_expansion_actor(p_actor_kind,p_actor_id);
  PERFORM private.wa_require_retention();
  IF p_request_deadline IS NULL OR NOT isfinite(p_request_deadline) OR
    p_request_deadline>clock_timestamp()+interval '55 seconds' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_delivery_deadline';
  END IF;
  SELECT * INTO STRICT settings FROM public.whatsapp_settings WHERE singleton FOR SHARE;
  SELECT * INTO STRICT release FROM private.wa_release_state WHERE singleton;
  IF p_job_id IS NULL THEN
    SELECT * INTO candidate FROM public.whatsapp_delivery_jobs WHERE state='queued' AND parked_reason IS NULL
      AND due_at<=clock_timestamp() AND provider=settings.provider AND account_identity=settings.account_identity
      ORDER BY due_at,CASE audience WHEN 'buyer' THEN 1 WHEN 'admins' THEN 2 ELSE 3 END,created_at,id LIMIT 1;
  ELSE SELECT * INTO candidate FROM public.whatsapp_delivery_jobs WHERE id=p_job_id;
  END IF;
  IF candidate.id IS NULL THEN RETURN jsonb_build_object('claimed',false,'job_id',p_job_id,'code','no_due_job','retry_at',NULL); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_account_dispatch WHERE provider=candidate.provider AND account_identity=candidate.account_identity) THEN
    -- ON CONFLICT against an existing locked slot would wait before SKIP
    -- LOCKED. Only bootstrap a missing slot; the database try-lock also
    -- makes simultaneous first-slot creation refuse without that wait.
    IF NOT pg_try_advisory_xact_lock(20261103,22) THEN
      RETURN jsonb_build_object('claimed',false,'job_id',candidate.id,'code','account_busy','retry_at',NULL);
    END IF;
    INSERT INTO public.whatsapp_account_dispatch(provider,account_identity)
      VALUES(candidate.provider,candidate.account_identity) ON CONFLICT DO NOTHING;
  END IF;
  SELECT * INTO slot FROM public.whatsapp_account_dispatch WHERE provider=candidate.provider
    AND account_identity=candidate.account_identity FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false,'job_id',candidate.id,'code','account_busy','retry_at',NULL); END IF;
  observed_at:=clock_timestamp();
  IF p_request_deadline<observed_at+interval '12 seconds' THEN
    RETURN jsonb_build_object('claimed',false,'job_id',candidate.id,'code','deadline_insufficient','retry_at',NULL);
  END IF;
  IF slot.active_job_id IS NOT NULL THEN
    -- Expiry is a separate account->job transaction, never job->event here.
    RETURN jsonb_build_object('claimed',false,'job_id',candidate.id,
      'code',CASE WHEN slot.lease_expires_at<=observed_at THEN 'lease_expiry_required' ELSE 'account_busy' END,'retry_at',slot.lease_expires_at);
  END IF;
  IF slot.next_slot_at>observed_at THEN RETURN jsonb_build_object('claimed',false,'job_id',candidate.id,'code','account_paced','retry_at',slot.next_slot_at); END IF;
  IF candidate.event_id IS NOT NULL THEN
    PERFORM 1 FROM public.whatsapp_notification_events WHERE id=candidate.event_id FOR UPDATE;
  ELSIF candidate.outcome_id IS NOT NULL THEN
    PERFORM 1 FROM private.wa_payment_outcomes WHERE id=candidate.outcome_id FOR UPDATE;
  END IF;
  SELECT * INTO STRICT job FROM public.whatsapp_delivery_jobs WHERE id=candidate.id FOR UPDATE;
  IF job.provider IS DISTINCT FROM slot.provider OR job.account_identity IS DISTINCT FROM slot.account_identity
    OR job.event_id IS DISTINCT FROM candidate.event_id OR job.outcome_id IS DISTINCT FROM candidate.outcome_id THEN
    RETURN jsonb_build_object('claimed',false,'job_id',job.id,'code','job_changed','retry_at',NULL);
  END IF;
  observed_at:=clock_timestamp();
  IF p_request_deadline<observed_at+interval '12 seconds' THEN
    RETURN jsonb_build_object('claimed',false,'job_id',job.id,'code','deadline_insufficient','retry_at',NULL);
  END IF;
  IF job.state<>'queued' OR job.parked_reason IS NOT NULL OR job.due_at>observed_at OR job.attempt_count>=3 OR job.provider_message_id IS NOT NULL THEN
    RETURN jsonb_build_object('claimed',false,'job_id',job.id,'code','job_not_due','retry_at',job.due_at);
  END IF;
  lease_id:=job.attempt_token;
  IF (job.attempt_count=0 AND (job.attempt_token IS NOT NULL OR job.lease_expires_at IS NOT NULL)) OR
    (SELECT count(*) FROM public.whatsapp_delivery_attempts history WHERE history.job_id=job.id)<>job.attempt_count OR
    EXISTS(SELECT 1 FROM public.whatsapp_delivery_attempts history WHERE history.job_id=job.id AND
      (history.outcome IS DISTINCT FROM 'not_accepted' OR history.retryable IS DISTINCT FROM true OR
       history.safe_reason IS DISTINCT FROM 'wa_provider_not_accepted' OR history.provider_message_id IS NOT NULL OR history.finished_at IS NULL)) OR
    (job.attempt_count>0 AND NOT EXISTS(SELECT 1 FROM public.whatsapp_delivery_attempts history WHERE history.job_id=job.id
      AND history.attempt_number=job.attempt_count AND history.attempt_token=lease_id)) THEN
    UPDATE public.whatsapp_delivery_jobs SET state='needs_review',safe_reason='delivery_history_requires_review',updated_at=observed_at WHERE id=job.id;
    RETURN jsonb_build_object('claimed',false,'job_id',job.id,'code','delivery_history_requires_review','retry_at',NULL);
  END IF;
  reason:=private.wa_delivery_gate(job,settings);
  IF reason IS NOT NULL THEN
    UPDATE public.whatsapp_delivery_jobs SET
      state=CASE WHEN reason IN ('order_missing','order_cancelled_or_refunded') THEN 'cancelled'
        WHEN reason IN ('payment_owner_mismatch','legacy_event_context_required','manual_request_required') THEN 'needs_review' ELSE state END,
      parked_reason=CASE WHEN reason IN ('provider_changed','account_changed') THEN reason
        WHEN reason IN ('integration_paused','automation_paused','audience_paused') THEN 'automation_paused' ELSE parked_reason END,
      safe_reason=reason,updated_at=observed_at WHERE id=job.id;
    RETURN jsonb_build_object('claimed',false,'job_id',job.id,'code',reason,'retry_at',NULL);
  END IF;
  IF release.state NOT IN ('migrated','active') OR release.active_credential_binding IS NULL THEN
    RETURN jsonb_build_object('claimed',false,'job_id',job.id,'code','credential_migration_required','retry_at',NULL);
  END IF;
  SELECT c.* INTO credential FROM private.wa_credentials c WHERE c.provider=job.provider
    AND c.account_identity=release.active_credential_binding AND c.purpose='provider_api' AND c.generation=0 FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false,'job_id',job.id,'code','credential_missing','retry_at',NULL); END IF;
  IF job.provider='postora' AND credential.account_identity<>job.account_identity THEN
    RETURN jsonb_build_object('claimed',false,'job_id',job.id,'code','account_changed','retry_at',NULL);
  END IF;
  IF job.provider='evolution' THEN
    SELECT * INTO connection FROM public.evolution_connections WHERE instance_identity=credential.account_identity;
    IF NOT FOUND OR connection.state<>'connected' OR connection.account_identity IS DISTINCT FROM job.account_identity OR connection.session_generation<=0 THEN
      RETURN jsonb_build_object('claimed',false,'job_id',job.id,'code','session_not_connected','retry_at',NULL);
    END IF;
    session_generation:=connection.session_generation;
  END IF;
  IF job.media_object_id IS NOT NULL THEN
    SELECT * INTO media FROM public.whatsapp_media_objects WHERE id=job.media_object_id;
    IF job.provider<>'evolution' OR media.id IS NULL OR media.state<>'ready' OR media.instance_identity<>credential.account_identity THEN
      RETURN jsonb_build_object('claimed',false,'job_id',job.id,'code','media_not_ready','retry_at',NULL);
    END IF;
  END IF;
  next_token:=gen_random_uuid();
  UPDATE public.whatsapp_delivery_jobs SET state='sending',attempt_count=attempt_count+1,
    attempt_token=next_token,lease_expires_at=observed_at+interval '45 seconds',safe_reason=NULL,updated_at=observed_at
    WHERE id=job.id RETURNING * INTO job;
  INSERT INTO public.whatsapp_delivery_attempts(job_id,attempt_number,attempt_token,actor_id,credential_binding,session_generation)
    VALUES(job.id,job.attempt_count,next_token,p_actor_id,credential.account_identity,session_generation);
  UPDATE public.whatsapp_account_dispatch SET active_job_id=job.id,lease_expires_at=job.lease_expires_at,
    next_slot_at=observed_at+interval '1 second' WHERE provider=job.provider AND account_identity=job.account_identity;
  INSERT INTO private.wa_delivery_transitions(job_id,attempt_token,transition) VALUES(job.id,next_token,'claimed');
  RETURN jsonb_build_object('claimed',true,'job_id',job.id,'attempt_token',next_token,'attempt_count',job.attempt_count,
    'lease_expires_at',job.lease_expires_at,'provider',job.provider,'account_identity',job.account_identity,
    'credential',private.wa_credential_document(credential),'session_generation',session_generation,
    'recipient',job.normalized_recipient,'body',job.rendered_body,'job_class',job.job_class,
    'media',CASE WHEN media.id IS NOT NULL THEN jsonb_build_object('id',media.id,'object_path',media.object_path,
      'mime_type',media.mime_type,'file_name',media.file_name,'byte_size',media.byte_size,'content_hash',media.content_hash) END);
END
$fn$;

REVOKE ALL ON FUNCTION private.wa_delivery_summary(public.whatsapp_delivery_jobs,boolean,boolean),
  private.wa_release_delivery_slot(public.whatsapp_delivery_jobs),
  private.wa_delivery_gate(public.whatsapp_delivery_jobs,public.whatsapp_settings),
  public.wa_expire_delivery_leases(uuid),public.wa_claim_delivery(uuid,text,timestamptz,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.wa_expire_delivery_leases(uuid),public.wa_claim_delivery(uuid,text,timestamptz,uuid) TO service_role;
COMMIT;
