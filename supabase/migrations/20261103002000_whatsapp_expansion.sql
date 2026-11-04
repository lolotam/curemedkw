-- Immutable paid-owner expansion. No claim, provider I/O or legacy activation.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,20);
ALTER TABLE public.whatsapp_notification_events ADD COLUMN IF NOT EXISTS expansion_summary jsonb NOT NULL DEFAULT '{}';
ALTER TABLE private.wa_payment_outcomes ADD COLUMN IF NOT EXISTS legacy_expansion_summary jsonb NOT NULL DEFAULT '{}';
ALTER TABLE private.wa_payment_outcomes ADD COLUMN IF NOT EXISTS legacy_repair_attempt_count integer NOT NULL DEFAULT 0
  CHECK(legacy_repair_attempt_count BETWEEN 0 AND 3);
ALTER TABLE private.wa_payment_outcomes ADD COLUMN IF NOT EXISTS legacy_next_repair_at timestamptz;
CREATE INDEX IF NOT EXISTS wa_legacy_expansion_due ON private.wa_payment_outcomes(legacy_next_repair_at,id)
  WHERE owner='legacy' AND legacy_expansion_state='enqueue_failed';
CREATE INDEX IF NOT EXISTS wa_legacy_initial_expansion_due ON private.wa_payment_outcomes(created_at,id)
  WHERE owner='legacy' AND legacy_expansion_state IN ('pending','enqueue_failed') AND legacy_expansion_summary='{}'::jsonb;

-- Invalid templates must not look like an intentional disable. Preserve the
-- configured switches while withholding the invalid recipient/template data;
-- only an explicit approved revision can subsequently repair that snapshot.
CREATE OR REPLACE FUNCTION private.integration_whatsapp_snapshot(p_settings public.whatsapp_settings,p_manual_only boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE release private.wa_release_state; legacy jsonb; configuration jsonb; failure text;
BEGIN
  SELECT * INTO release FROM private.wa_release_state WHERE singleton;
  BEGIN
    IF release.state='unmigrated' THEN
      SELECT value INTO legacy FROM public.site_settings WHERE key='whatsapp_integration' FOR SHARE;
      configuration:=private.wa_legacy_config(legacy);
    ELSE
      configuration:=private.wa_validate_config(jsonb_build_object('integration_enabled',p_settings.integration_enabled,
        'automation_enabled',p_settings.automation_enabled,'default_country',p_settings.default_country,
        'audiences',p_settings.audiences,'recipients',p_settings.recipients));
    END IF;
  EXCEPTION WHEN invalid_parameter_value THEN failure:='notification_configuration_invalid';
    WHEN raise_exception THEN
      IF SQLERRM<>'empty_recipient' THEN RAISE; END IF;
      failure:='notification_configuration_invalid';
  END;
  RETURN jsonb_build_object('owner',CASE WHEN p_settings.cutover_version=1 THEN 'durable' ELSE 'legacy' END,
    'provider',CASE WHEN release.state='unmigrated' THEN 'postora' ELSE p_settings.provider END,
    'account_identity',CASE WHEN release.state='unmigrated' THEN NULL ELSE p_settings.account_identity END,
    'settings_revision',p_settings.settings_revision,
    'integration_enabled',coalesce((configuration->>'integration_enabled')::boolean,
      CASE WHEN release.state='unmigrated' THEN legacy->'enabled' IS DISTINCT FROM 'false'::jsonb ELSE p_settings.integration_enabled END),
    'automation_enabled',coalesce((configuration->>'automation_enabled')::boolean,CASE WHEN release.state='unmigrated' THEN false ELSE p_settings.automation_enabled END),
    'configuration',configuration,'configuration_error',failure,'manual_only',p_manual_only);
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_expansion_actor(p_actor_kind text,p_actor_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,private AS $fn$
BEGIN
  IF p_actor_kind='admin' THEN PERFORM private.wa_require_admin(p_actor_id);
  ELSIF p_actor_kind IS DISTINCT FROM 'worker' OR p_actor_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_expansion_actor';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_paid_candidates(p_snapshot jsonb,p_coalesce boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE config jsonb; entry jsonb; rendered jsonb; audience text; language text; recipient text;
  recipients jsonb; candidates jsonb:='[]'; warnings jsonb:='[]'; grouped jsonb; recipient_count integer;
BEGIN
  config:=private.wa_validate_config(p_snapshot#>'{whatsapp,configuration}');
  FOREACH audience IN ARRAY ARRAY['buyer','admins','custom'] LOOP
    entry:=config->'audiences'->audience;
    IF NOT (entry->>'enabled')::boolean THEN CONTINUE; END IF;
    IF audience='buyer' THEN
      BEGIN
        recipient:=private.wa_normalize_phone(p_snapshot#>>'{facts,customer_phone}');
      EXCEPTION WHEN invalid_parameter_value THEN
        IF SQLERRM NOT IN ('invalid_recipient_characters','invalid_recipient_prefix','invalid_recipient_length') THEN RAISE; END IF;
        recipient:=NULL;
        warnings:=warnings||jsonb_build_array(jsonb_build_object('audience','buyer','code','buyer_phone_invalid'));
      END;
      IF recipient IS NULL THEN
        IF NOT warnings @> '[{"audience":"buyer"}]'::jsonb THEN
          warnings:=warnings||jsonb_build_array(jsonb_build_object('audience','buyer','code','buyer_phone_missing'));
        END IF;
        CONTINUE;
      END IF;
      recipients:=jsonb_build_array(recipient);
    ELSE
      recipients:=config->'recipients'->audience;
      IF jsonb_array_length(recipients)=0 THEN
        warnings:=warnings||jsonb_build_array(jsonb_build_object('audience',audience,'code','recipient_list_empty'));
        CONTINUE;
      END IF;
    END IF;
    language:=entry->>'language';
    rendered:=private.wa_render_paid_template(entry->'templates'->>language,language,p_snapshot->'facts');
    FOR recipient IN SELECT jsonb_array_elements_text(recipients) LOOP
      candidates:=candidates||jsonb_build_array(jsonb_build_object('recipient',recipient,'audience',audience,
        'body',rendered->'body','hash',encode(sha256(convert_to(rendered->>'body','UTF8')),'hex')));
    END LOOP;
  END LOOP;
  SELECT count(DISTINCT candidate->>'recipient') INTO recipient_count FROM jsonb_array_elements(candidates) candidate;
  IF recipient_count>50 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='recipient_limit_exceeded'; END IF;
  SELECT coalesce(jsonb_agg(merged.document ORDER BY merged.rank,merged.recipient,merged.hash),'[]') INTO grouped FROM (
    SELECT raw.recipient,raw.hash,min(CASE raw.audience WHEN 'buyer' THEN 1 WHEN 'admins' THEN 2 ELSE 3 END) rank,
      jsonb_build_object('recipient',raw.recipient,'hash',raw.hash,'body',min(raw.body),
        'audience',CASE min(CASE raw.audience WHEN 'buyer' THEN 1 WHEN 'admins' THEN 2 ELSE 3 END)
          WHEN 1 THEN 'buyer' WHEN 2 THEN 'admins' ELSE 'custom' END,
        'labels',to_jsonb(array_agg(DISTINCT raw.audience ORDER BY raw.audience))) document
    FROM jsonb_to_recordset(candidates) AS raw(recipient text,audience text,body text,hash text)
    GROUP BY raw.recipient,raw.hash,CASE WHEN p_coalesce THEN '' ELSE raw.audience END
  ) merged;
  RETURN jsonb_build_object('jobs',grouped,'summary',jsonb_build_object('recipient_count',recipient_count,
    'job_count',jsonb_array_length(grouped),'coalesced_count',jsonb_array_length(candidates)-jsonb_array_length(grouped),'warnings',warnings));
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_paid_expansion_summary(p_outcome_id uuid,p_event_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public,private AS $fn$
  SELECT jsonb_build_object('outcome_id',outcome.id,'event_id',p_event_id,
    'state',CASE WHEN p_event_id IS NULL THEN outcome.legacy_expansion_state ELSE event.expansion_state END,
    'safe_reason',CASE WHEN p_event_id IS NULL THEN outcome.safe_reason ELSE event.safe_reason END,
    'input_revision',event.input_revision,
    'repair_attempt_count',CASE WHEN p_event_id IS NULL THEN outcome.legacy_repair_attempt_count ELSE event.repair_attempt_count END,
    'next_repair_at',CASE WHEN p_event_id IS NULL THEN outcome.legacy_next_repair_at ELSE event.next_repair_at END,
    'summary',CASE WHEN p_event_id IS NULL THEN outcome.legacy_expansion_summary ELSE event.expansion_summary END,
    'job_ids',coalesce((SELECT jsonb_agg(job.id ORDER BY CASE job.audience WHEN 'buyer' THEN 1 WHEN 'admins' THEN 2 ELSE 3 END,job.id)
      FROM public.whatsapp_delivery_jobs job WHERE job.outcome_id=outcome.id AND
        ((p_event_id IS NULL AND job.job_class='legacy_event') OR (p_event_id IS NOT NULL AND job.event_id=p_event_id))),'[]'::jsonb))
  FROM private.wa_payment_outcomes outcome LEFT JOIN public.whatsapp_notification_events event ON event.id=p_event_id
  WHERE outcome.id=p_outcome_id
$fn$;

-- Settings SHARE precedes the event/outcome row. No account slot or order lock
-- is taken: enqueue is not a claim. Future claim must lock event before jobs.
CREATE OR REPLACE FUNCTION private.wa_expand_paid(p_outcome_id uuid,p_event_id uuid,p_repair boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE settings public.whatsapp_settings; outcome private.wa_payment_outcomes; event public.whatsapp_notification_events;
  snapshot jsonb; expansion text; reason text; repairs integer; due timestamptz; summary jsonb; plan jsonb; candidate jsonb;
  parked text;
BEGIN
  PERFORM private.wa_require_retention();
  SELECT * INTO STRICT settings FROM public.whatsapp_settings WHERE singleton FOR SHARE;
  IF p_event_id IS NULL THEN
    SELECT * INTO outcome FROM private.wa_payment_outcomes WHERE id=p_outcome_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='payment_outcome_missing'; END IF;
    IF outcome.owner<>'legacy' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='legacy_owner_required'; END IF;
    snapshot:=outcome.input_snapshot; expansion:=outcome.legacy_expansion_state; repairs:=outcome.legacy_repair_attempt_count;
    due:=outcome.legacy_next_repair_at; summary:=outcome.legacy_expansion_summary;
  ELSE
    SELECT * INTO event FROM public.whatsapp_notification_events WHERE id=p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='notification_event_missing'; END IF;
    SELECT * INTO STRICT outcome FROM private.wa_payment_outcomes WHERE id=event.outcome_id;
    IF outcome.id IS DISTINCT FROM p_outcome_id OR outcome.owner<>'durable' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='durable_owner_required';
    END IF;
    SELECT input_snapshot INTO STRICT snapshot FROM private.wa_event_input_revisions
      WHERE event_id=event.id AND input_revision=event.input_revision;
    expansion:=event.expansion_state; repairs:=event.repair_attempt_count; due:=event.next_repair_at; summary:=event.expansion_summary;
  END IF;
  IF expansion IN ('expanded','skipped') THEN RETURN private.wa_paid_expansion_summary(outcome.id,p_event_id); END IF;
  IF summary<>'{}'::jsonb THEN
    IF NOT p_repair OR due IS NULL OR due>clock_timestamp() OR repairs>=3 THEN
      RETURN private.wa_paid_expansion_summary(outcome.id,p_event_id);
    END IF;
    repairs:=repairs+1;
  END IF;
  reason:=CASE WHEN snapshot#>>'{whatsapp,manual_only}'='true' THEN 'historical_or_manual_only'
    WHEN NOT outcome.integration_enabled THEN 'integration_disabled'
    WHEN p_event_id IS NOT NULL AND NOT outcome.automation_enabled THEN 'automation_disabled'
    WHEN outcome.created_at<=clock_timestamp()-interval '24 hours' THEN 'notification_stale'
    WHEN NOT EXISTS(SELECT 1 FROM public.orders WHERE id=outcome.order_id AND payment_status='paid' AND order_status<>'cancelled')
      THEN 'order_no_longer_eligible' END;
  IF reason IS NOT NULL THEN expansion:='skipped'; summary:=jsonb_build_object('job_count',0,'warnings','[]'::jsonb); due:=NULL;
  ELSE
    BEGIN
      plan:=private.wa_paid_candidates(snapshot,p_event_id IS NOT NULL);
      IF outcome.account_identity IS NULL OR private.wa_blank(outcome.account_identity) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='provider_account_unresolved';
      END IF;
      summary:=plan->'summary';
      parked:=CASE WHEN settings.provider<>outcome.provider THEN 'provider_changed'
        WHEN settings.account_identity IS DISTINCT FROM outcome.account_identity THEN 'account_changed'
        WHEN p_event_id IS NOT NULL AND (NOT settings.integration_enabled OR NOT settings.automation_enabled) THEN 'automation_paused' END;
      FOR candidate IN SELECT * FROM jsonb_array_elements(plan->'jobs') LOOP
        INSERT INTO public.whatsapp_delivery_jobs(job_class,event_id,outcome_id,order_id,normalized_recipient,audience,audience_labels,
          rendered_body,rendered_content_hash,provider,account_identity,settings_revision,parked_reason)
        VALUES(CASE WHEN p_event_id IS NULL THEN 'legacy_event' ELSE 'automation' END,p_event_id,outcome.id,outcome.order_id,
          candidate->>'recipient',candidate->>'audience',ARRAY(SELECT jsonb_array_elements_text(candidate->'labels')),
          candidate->>'body',candidate->>'hash',outcome.provider,outcome.account_identity,
          CASE WHEN p_event_id IS NULL THEN outcome.settings_revision ELSE event.settings_revision END,parked)
        ON CONFLICT DO NOTHING;
      END LOOP;
      expansion:=CASE WHEN jsonb_array_length(plan->'jobs')=0 THEN 'skipped' ELSE 'expanded' END;
      reason:=CASE WHEN expansion='skipped' THEN 'no_valid_recipients' END; due:=NULL;
    EXCEPTION WHEN invalid_parameter_value OR raise_exception THEN
      reason:=SQLERRM;
      IF reason NOT IN ('invalid_payload_fields','invalid_settings','invalid_audience','invalid_template_body','invalid_recipients','invalid_recipient',
        'empty_recipient','invalid_recipient_characters','invalid_recipient_prefix','invalid_recipient_length','recipient_limit_exceeded',
        'malformed_template_token','unsupported_template_token','invalid_render_facts','items_summary_budget_exceeded',
        'rendered_content_too_long','invalid_rendered_content','provider_account_unresolved') THEN RAISE; END IF;
      expansion:='enqueue_failed'; due:=NULL; summary:=jsonb_build_object('failure',reason);
    WHEN deadlock_detected OR serialization_failure OR lock_not_available OR insufficient_resources OR disk_full OR out_of_memory THEN
      expansion:='enqueue_failed'; reason:=CASE WHEN repairs=3 THEN 'expansion_repair_exhausted' ELSE 'expansion_temporarily_unavailable' END;
      due:=CASE WHEN repairs<3 THEN clock_timestamp()+CASE WHEN repairs=0 THEN interval '1 minute' ELSE interval '5 minutes' END END;
      summary:=jsonb_build_object('failure','expansion_temporarily_unavailable');
    END;
  END IF;
  IF p_event_id IS NULL THEN
    UPDATE private.wa_payment_outcomes SET legacy_expansion_state=expansion,safe_reason=reason,legacy_expansion_summary=summary,
      legacy_repair_attempt_count=repairs,legacy_next_repair_at=due WHERE id=outcome.id;
  ELSE
    UPDATE public.whatsapp_notification_events SET expansion_state=expansion,safe_reason=reason,expansion_summary=summary,
      repair_attempt_count=repairs,next_repair_at=due WHERE id=event.id;
  END IF;
  RETURN private.wa_paid_expansion_summary(outcome.id,p_event_id);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_repair_event(p_event_id uuid,p_actor_kind text,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE outcome_id uuid;
BEGIN
  PERFORM private.wa_expansion_actor(p_actor_kind,p_actor_id);
  SELECT event.outcome_id INTO outcome_id FROM public.whatsapp_notification_events event WHERE id=p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='notification_event_missing'; END IF;
  RETURN private.wa_expand_paid(outcome_id,p_event_id,true);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_repair_legacy_outcome(p_outcome_id uuid,p_actor_kind text,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  PERFORM private.wa_expansion_actor(p_actor_kind,p_actor_id);
  RETURN private.wa_expand_paid(p_outcome_id,NULL,true);
END
$fn$;

-- An approved settings revision may repair recipients/templates only. Neither
-- the original facts nor provider/account/owner are editable through this RPC.
CREATE OR REPLACE FUNCTION public.wa_correct_event_expansion(p_event_id uuid,p_expected_input_revision integer,
  p_approved_settings_revision bigint,p_reason text,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE settings public.whatsapp_settings; event public.whatsapp_notification_events; snapshot jsonb; config jsonb;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id); PERFORM private.wa_require_retention();
  IF private.wa_blank(p_reason) OR char_length(p_reason)>200 OR p_expected_input_revision IS NULL OR p_expected_input_revision<1
    OR p_expected_input_revision>=2147483647 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_expansion_correction'; END IF;
  SELECT * INTO STRICT settings FROM public.whatsapp_settings WHERE singleton FOR SHARE;
  IF settings.settings_revision IS DISTINCT FROM p_approved_settings_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='settings_revision_conflict'; END IF;
  PERFORM 1 FROM public.whatsapp_account_dispatch WHERE provider=settings.provider AND account_identity=settings.account_identity FOR UPDATE;
  SELECT * INTO event FROM public.whatsapp_notification_events WHERE id=p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='notification_event_missing'; END IF;
  IF event.input_revision<>p_expected_input_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='input_revision_conflict'; END IF;
  IF event.expansion_state<>'enqueue_failed' OR settings.settings_revision<=event.settings_revision THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='new_settings_revision_required'; END IF;
  IF settings.provider IS DISTINCT FROM event.provider OR settings.account_identity IS DISTINCT FROM event.account_identity THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='event_identity_change_forbidden'; END IF;
  PERFORM id FROM public.whatsapp_delivery_jobs WHERE event_id=event.id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.whatsapp_delivery_jobs job WHERE job.event_id=event.id AND
    (job.state<>'queued' OR job.attempt_count<>0 OR job.attempt_token IS NOT NULL OR job.provider_message_id IS NOT NULL
      OR EXISTS(SELECT 1 FROM public.whatsapp_delivery_attempts WHERE job_id=job.id)
      OR EXISTS(SELECT 1 FROM public.whatsapp_account_dispatch WHERE active_job_id=job.id))) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='attempted_event_correction_forbidden'; END IF;
  SELECT input_snapshot INTO STRICT snapshot FROM private.wa_event_input_revisions WHERE event_id=event.id AND input_revision=event.input_revision;
  config:=private.wa_validate_config(jsonb_build_object('integration_enabled',snapshot#>'{whatsapp,integration_enabled}',
    'automation_enabled',snapshot#>'{whatsapp,automation_enabled}','default_country','KW','audiences',settings.audiences,'recipients',settings.recipients));
  snapshot:=jsonb_set(snapshot,'{whatsapp,configuration}',config);
  snapshot:=jsonb_set(snapshot,'{whatsapp,configuration_error}','null');
  snapshot:=jsonb_set(snapshot,'{whatsapp,settings_revision}',to_jsonb(settings.settings_revision));
  INSERT INTO private.wa_event_input_revisions(event_id,input_revision,settings_revision,input_snapshot,reason,created_by)
    VALUES(event.id,event.input_revision+1,settings.settings_revision,snapshot,private.wa_trim_space(p_reason),p_actor_id);
  DELETE FROM public.whatsapp_delivery_jobs WHERE event_id=event.id;
  UPDATE public.whatsapp_notification_events SET input_revision=input_revision+1,settings_revision=settings.settings_revision,
    repair_attempt_count=0,next_repair_at=clock_timestamp(),safe_reason='input_revision_corrected',expansion_summary='{}' WHERE id=event.id;
  RETURN private.wa_expand_paid(event.outcome_id,event.id,false);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_list_due_expansions(p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_expansion_limit'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(document ORDER BY due,id),'[]') FROM (
    SELECT id,due,jsonb_build_object('event_id',event_id,'outcome_id',outcome_id) document FROM (
      SELECT event.id,event.id event_id,event.outcome_id,event.next_repair_at due FROM public.whatsapp_notification_events event
        WHERE event.expansion_state='enqueue_failed' AND event.next_repair_at<=now() AND event.repair_attempt_count<3
      UNION ALL
      SELECT outcome.id,NULL::uuid,outcome.id,coalesce(outcome.legacy_next_repair_at,outcome.created_at) FROM private.wa_payment_outcomes outcome
        WHERE outcome.owner='legacy' AND outcome.legacy_repair_attempt_count<3 AND
          ((outcome.legacy_expansion_state IN ('pending','enqueue_failed') AND outcome.legacy_expansion_summary='{}'::jsonb)
            OR (outcome.legacy_expansion_state='enqueue_failed' AND outcome.legacy_next_repair_at<=now()))
    ) pending ORDER BY due,id LIMIT p_limit) bounded);
END
$fn$;

-- Strict evidence invokes the same expander inside a nested exception boundary;
-- its deterministic/transient failure cannot erase the committed paid owner.
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
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='immutable_notification_evidence_conflict'; END IF;
  INSERT INTO private.wa_event_input_revisions(event_id,input_revision,settings_revision,input_snapshot)
    VALUES(event.id,1,p_outcome.settings_revision,p_outcome.input_snapshot) ON CONFLICT DO NOTHING;
  PERFORM private.wa_expand_paid(p_outcome.id,event.id,false);
  SELECT * INTO STRICT event FROM public.whatsapp_notification_events WHERE id=event.id;
  RETURN event;
END
$fn$;

REVOKE ALL ON FUNCTION private.wa_expansion_actor(text,uuid),private.wa_paid_candidates(jsonb,boolean),private.wa_paid_expansion_summary(uuid,uuid),
  private.wa_expand_paid(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.wa_repair_event(uuid,text,uuid),public.wa_repair_legacy_outcome(uuid,text,uuid),
  public.wa_correct_event_expansion(uuid,integer,bigint,text,uuid),public.wa_list_due_expansions(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_repair_event(uuid,text,uuid),public.wa_repair_legacy_outcome(uuid,text,uuid),
  public.wa_correct_event_expansion(uuid,integer,bigint,text,uuid),public.wa_list_due_expansions(integer) TO service_role;
COMMIT;
