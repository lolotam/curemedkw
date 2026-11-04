-- Real paid owner, strict evidence, recipient expansion and correction. All
-- accounts/configuration are synthetic; this proof never sends a message.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('91000000-0000-4000-8000-000000000001','expansion@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('91000000-0000-4000-8000-000000000001','admin');
SET LOCAL ROLE service_role;
SELECT public.integration_activate_payment_retention('91000000-0000-4000-8000-000000000001');
RESET ROLE;
CREATE TEMP TABLE expansion_cases(label text PRIMARY KEY,order_id uuid,attempt_id uuid,attestation jsonb,outcome_id uuid,event_id uuid);
INSERT INTO expansion_cases(label,order_id,attempt_id,attestation)
SELECT label,md5('expand-order:'||label)::uuid,md5('expand-attempt:'||label)::uuid,
  jsonb_build_object('invoice_id','expand-invoice-'||label,'external_identifier',md5('expand-order:'||label)::uuid,
    'transaction_payment_id','expand-payment-'||label,'invoice_status','PAID','transaction_status','SUCCESS','details','{}'::jsonb)
FROM unnest(ARRAY['coalesce','different','bad-phone','missing-phone','legacy','legacy-leftover','legacy-unresolved','disabled','overflow','bad-template',
  'pause','switch','transient','attempted','cancelled']) label;
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,subtotal,total,payment_method)
SELECT order_id,'Synthetic {{total}} buyer','buyer@example.test',CASE label WHEN 'bad-phone' THEN 'invalid+phone'
  WHEN 'missing-phone' THEN '' ELSE '50000001' END,20,20,'pay_by_link' FROM expansion_cases;
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id)
SELECT attempt_id,order_id,20,'expand-key-'||label,attestation->>'invoice_id' FROM expansion_cases;
GRANT SELECT,UPDATE ON expansion_cases TO service_role;
DO $configuration$
DECLARE configured_audiences jsonb:='{}'; audience text;
BEGIN
  FOREACH audience IN ARRAY ARRAY['buyer','admins','custom'] LOOP
    configured_audiences:=configured_audiences||jsonb_build_object(audience,jsonb_build_object('enabled',true,'language','en',
      'templates',jsonb_build_object('ar','Order {{order_number}} {{total}}','en','Order {{order_number}} {{total}}')));
  END LOOP;
  UPDATE public.whatsapp_settings SET cutover_version=1,integration_enabled=true,automation_enabled=true,
    provider='postora',account_identity='postora:synthetic',audiences=configured_audiences,
    recipients='{"admins":["50000001","50000002"],"custom":["50000002"]}';
  UPDATE private.wa_release_state SET state='active';
END
$configuration$;
DO $owners$
DECLARE c record; original public.whatsapp_settings; config jsonb; result jsonb;
BEGIN
  SELECT * INTO STRICT original FROM public.whatsapp_settings WHERE singleton;
  FOR c IN SELECT * FROM expansion_cases ORDER BY label LOOP
    UPDATE public.whatsapp_settings SET cutover_version=CASE WHEN c.label IN ('legacy','legacy-leftover','legacy-unresolved') THEN 0 ELSE 1 END,
      integration_enabled=original.integration_enabled,automation_enabled=original.automation_enabled,
      account_identity=CASE WHEN c.label='legacy-unresolved' THEN NULL ELSE original.account_identity END,
      audiences=original.audiences,recipients=original.recipients,settings_revision=settings_revision+1;
    IF c.label='different' THEN UPDATE public.whatsapp_settings SET audiences=jsonb_set(audiences,'{custom,templates,en}','"Different {{order_number}}"'); END IF;
    IF c.label='disabled' THEN UPDATE public.whatsapp_settings SET automation_enabled=false; END IF;
    IF c.label='bad-template' THEN UPDATE public.whatsapp_settings SET audiences=jsonb_set(audiences,'{buyer,templates,en}','"{{unsupported}}"'); END IF;
    IF c.label='overflow' THEN
      SELECT jsonb_agg(('50000000'::bigint+i)::text) INTO config FROM generate_series(2,51) i;
      UPDATE public.whatsapp_settings SET recipients=jsonb_build_object('admins',config,'custom','[]'::jsonb);
    END IF;
    SET LOCAL ROLE service_role;
    result:=public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,c.attestation,'signed_webhook');
    UPDATE pg_temp.expansion_cases SET outcome_id=(result->>'outcome_id')::uuid WHERE label=c.label;
    RESET ROLE;
  END LOOP;
  UPDATE public.whatsapp_settings SET cutover_version=1,integration_enabled=true,automation_enabled=true,
    provider=original.provider,account_identity=original.account_identity,audiences=original.audiences,recipients=original.recipients;
END
$owners$;
-- A deterministic simulated storage/deadlock failure occurs inside the nested
-- expansion subtransaction only; actual concurrency is tested by the harness.
CREATE FUNCTION pg_temp.expansion_storage_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$
BEGIN
  IF NEW.order_id=(SELECT order_id FROM pg_temp.expansion_cases WHERE label='transient') AND NEW.normalized_recipient='96550000002' THEN
    RAISE EXCEPTION USING ERRCODE='40P01',MESSAGE='synthetic_storage_failure';
  END IF;
  RETURN NEW;
END
$fault$;
CREATE TRIGGER expansion_fault BEFORE INSERT ON public.whatsapp_delivery_jobs FOR EACH ROW EXECUTE FUNCTION pg_temp.expansion_storage_fault();
DO $strict_and_legacy$
DECLARE c record; claim jsonb; verified jsonb; receipt jsonb; expanded jsonb; jobs integer;
BEGIN
  FOR c IN SELECT * FROM expansion_cases ORDER BY label LOOP
    IF c.label='legacy-leftover' THEN CONTINUE; END IF;
    IF c.label='pause' THEN UPDATE public.whatsapp_settings SET automation_enabled=false; END IF;
    IF c.label='switch' THEN UPDATE public.whatsapp_settings SET provider='evolution',account_identity='96550000009'; END IF;
    IF c.label='cancelled' THEN UPDATE public.orders SET order_status='cancelled' WHERE id=c.order_id; END IF;
    SET LOCAL ROLE service_role;
    IF c.label IN ('legacy','legacy-unresolved') THEN
      expanded:=public.wa_repair_legacy_outcome(c.outcome_id,'worker',NULL);
    ELSE
      claim:=public.wa_claim_pending_payment_verification(c.order_id,'91000000-0000-4000-8000-000000000002');
      verified:=c.attestation||jsonb_build_object('amount_millis',20000,'currency','KWD','pending_id',claim->'id','lease_token',claim->'lease_token');
      receipt:=public.wa_apply_verified_payment(c.order_id,c.attempt_id,verified,'signed_webhook');
      UPDATE pg_temp.expansion_cases SET event_id=(receipt->>'event_id')::uuid WHERE label=c.label;
      IF public.wa_apply_verified_payment(c.order_id,c.attempt_id,verified,'signed_webhook') IS DISTINCT FROM receipt THEN
        RAISE EXCEPTION 'Strict replay changed event/expansion identity'; END IF;
    END IF;
    RESET ROLE;
    SELECT count(*) INTO jobs FROM public.whatsapp_delivery_jobs WHERE outcome_id=c.outcome_id;
    IF c.label='coalesce' AND (jobs<>2 OR NOT EXISTS(SELECT 1 FROM public.whatsapp_delivery_jobs WHERE outcome_id=c.outcome_id
      AND normalized_recipient='96550000001' AND audience_labels=ARRAY['admins','buyer'])) THEN RAISE EXCEPTION 'Same phone/content not coalesced with labels'; END IF;
    IF c.label='different' AND jobs<>3 THEN RAISE EXCEPTION 'Different content was collapsed'; END IF;
    IF c.label IN ('bad-phone','missing-phone') AND (jobs<>2 OR NOT EXISTS(SELECT 1 FROM public.whatsapp_notification_events
      WHERE outcome_id=c.outcome_id AND expansion_summary->'warnings' @> jsonb_build_array(jsonb_build_object('audience','buyer',
        'code',CASE WHEN c.label='bad-phone' THEN 'buyer_phone_invalid' ELSE 'buyer_phone_missing' END)))) THEN
      RAISE EXCEPTION 'Bad buyer phone blocked admin jobs or warning missing'; END IF;
    IF c.label='legacy' AND (jobs<>4 OR EXISTS(SELECT 1 FROM private.wa_payment_evidence WHERE outcome_id=c.outcome_id)
      OR EXISTS(SELECT 1 FROM public.whatsapp_notification_events WHERE outcome_id=c.outcome_id)) THEN RAISE EXCEPTION 'Legacy required GET or lost audience identity'; END IF;
    IF c.label='legacy-unresolved' AND (jobs<>0 OR expanded->>'safe_reason'<>'provider_account_unresolved') THEN
      RAISE EXCEPTION 'Unresolved legacy account silently rebound'; END IF;
    IF c.label IN ('disabled','overflow','bad-template','transient','cancelled') AND jobs<>0 THEN RAISE EXCEPTION 'Ineligible/failed expansion left partial jobs'; END IF;
    IF c.label='overflow' AND NOT EXISTS(SELECT 1 FROM public.whatsapp_notification_events WHERE outcome_id=c.outcome_id
      AND expansion_state='enqueue_failed' AND safe_reason='recipient_limit_exceeded' AND next_repair_at IS NULL) THEN
      RAISE EXCEPTION 'Buyer was omitted from total recipient cap or deterministic repair scheduled'; END IF;
    IF c.label='bad-template' AND NOT EXISTS(SELECT 1 FROM public.whatsapp_notification_events WHERE outcome_id=c.outcome_id
      AND expansion_state='enqueue_failed' AND next_repair_at IS NULL) THEN RAISE EXCEPTION 'Bad template lost visible failed event'; END IF;
    IF c.label='pause' AND EXISTS(SELECT 1 FROM public.whatsapp_delivery_jobs WHERE outcome_id=c.outcome_id AND parked_reason IS DISTINCT FROM 'automation_paused') THEN
      RAISE EXCEPTION 'Explicit pause ignored at expansion'; END IF;
    IF c.label='switch' AND EXISTS(SELECT 1 FROM public.whatsapp_delivery_jobs WHERE outcome_id=c.outcome_id
      AND (provider<>'postora' OR account_identity<>'postora:synthetic' OR parked_reason IS DISTINCT FROM 'provider_changed')) THEN
      RAISE EXCEPTION 'Provider change rerouted immutable work'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=c.order_id AND payment_status='paid') THEN RAISE EXCEPTION 'Expansion failure erased paid status'; END IF;
    UPDATE public.whatsapp_settings SET automation_enabled=true,provider='postora',account_identity='postora:synthetic';
  END LOOP;
END
$strict_and_legacy$;
SET LOCAL ROLE service_role;
DO $lost_legacy_nudge$
DECLARE c record; result jsonb;
BEGIN
  SELECT * INTO STRICT c FROM pg_temp.expansion_cases WHERE label='legacy-leftover';
  IF NOT public.wa_list_due_expansions(100) @> jsonb_build_array(jsonb_build_object('event_id',NULL,'outcome_id',c.outcome_id)) THEN
    RAISE EXCEPTION 'Lost inline nudge stranded the legacy first-success outcome'; END IF;
  result:=public.wa_repair_legacy_outcome(c.outcome_id,'worker',NULL);
  IF result->>'state'<>'expanded' OR jsonb_array_length(result->'job_ids')<>4 THEN
    RAISE EXCEPTION 'Scheduler could not recover the untouched legacy outcome'; END IF;
  SELECT * INTO STRICT c FROM pg_temp.expansion_cases WHERE label='legacy-unresolved';
  IF public.wa_list_due_expansions(100) @> jsonb_build_array(jsonb_build_object('outcome_id',c.outcome_id)) THEN
    RAISE EXCEPTION 'Deterministic unresolved identity spun in the scheduler'; END IF;
END
$lost_legacy_nudge$;
RESET ROLE;
DO $bounded_repair$
DECLARE c expansion_cases; result jsonb; iteration integer; evidence uuid;
BEGIN
  SELECT * INTO STRICT c FROM expansion_cases WHERE label='transient';
  SELECT id INTO STRICT evidence FROM private.wa_payment_evidence WHERE outcome_id=c.outcome_id;
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_notification_events WHERE id=c.event_id AND repair_attempt_count=0
    AND next_repair_at BETWEEN clock_timestamp()+interval '55 seconds' AND clock_timestamp()+interval '65 seconds') THEN
    RAISE EXCEPTION 'Initial transient failure did not retain bounded repair'; END IF;
  FOR iteration IN 1..3 LOOP
    UPDATE public.whatsapp_notification_events SET next_repair_at=clock_timestamp()-interval '1 second' WHERE id=c.event_id;
    SET LOCAL ROLE service_role;
    result:=public.wa_repair_event(c.event_id,'worker',NULL);
    RESET ROLE;
    IF (result->>'repair_attempt_count')::integer<>iteration OR result->>'state'<>'enqueue_failed' THEN
      RAISE EXCEPTION 'Repair budget/state mismatch'; END IF;
    IF iteration<3 AND (result->>'next_repair_at')::timestamptz NOT BETWEEN clock_timestamp()+interval '295 seconds' AND clock_timestamp()+interval '305 seconds' THEN
      RAISE EXCEPTION 'Repair delay not bounded to five minutes'; END IF;
  END LOOP;
  IF result->>'safe_reason'<>'expansion_repair_exhausted' OR result->'next_repair_at'<>'null'::jsonb
    OR NOT EXISTS(SELECT 1 FROM private.wa_payment_evidence WHERE id=evidence) THEN RAISE EXCEPTION 'Exhaustion lost evidence or kept retry authority'; END IF;
  SET LOCAL ROLE service_role;
  IF public.wa_repair_event(c.event_id,'worker',NULL) IS DISTINCT FROM result THEN RAISE EXCEPTION 'Exhausted repair spun'; END IF;
  IF public.wa_list_due_expansions(100) @> jsonb_build_array(jsonb_build_object('event_id',c.event_id)) THEN
    RAISE EXCEPTION 'Exhausted event listed as due'; END IF;
  RESET ROLE;
END
$bounded_repair$;
DROP TRIGGER expansion_fault ON public.whatsapp_delivery_jobs;
SET LOCAL ROLE service_role;
DO $actor_contract$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM pg_temp.expansion_cases WHERE label='legacy';
  BEGIN
    PERFORM public.wa_repair_legacy_outcome(c.outcome_id,'worker','91000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Worker accepted browser actor authority';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM private.wa_expand_paid(c.outcome_id,NULL,true);
    RAISE EXCEPTION 'Service bypassed the checked expansion wrapper';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF public.wa_repair_legacy_outcome(c.outcome_id,'worker',NULL) IS DISTINCT FROM public.wa_repair_legacy_outcome(c.outcome_id,'worker',NULL) THEN
    RAISE EXCEPTION 'Legacy replay changed job set'; END IF;
END
$actor_contract$;
RESET ROLE;
DO $corrections$
DECLARE c expansion_cases; result jsonb; original jsonb; current_revision bigint; attempted expansion_cases; count_before integer;
BEGIN
  SELECT * INTO STRICT c FROM expansion_cases WHERE label='bad-template';
  SELECT input_snapshot INTO STRICT original FROM private.wa_event_input_revisions WHERE event_id=c.event_id AND input_revision=1;
  UPDATE public.whatsapp_settings SET settings_revision=settings_revision+1;
  SELECT settings_revision INTO current_revision FROM public.whatsapp_settings WHERE singleton;
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.wa_correct_event_expansion(c.event_id,1,current_revision,'repair','91000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'Forged admin corrected recipients';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  result:=public.wa_correct_event_expansion(c.event_id,1,current_revision,'Use reviewed current templates','91000000-0000-4000-8000-000000000001');
  IF result->>'state'<>'expanded' OR result->>'input_revision'<>'2' THEN RAISE EXCEPTION 'Approved correction did not expand'; END IF;
  BEGIN
    PERFORM public.wa_correct_event_expansion(c.event_id,1,current_revision,'stale','91000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Stale input revision was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  RESET ROLE;
  IF (SELECT input_snapshot->'facts' FROM private.wa_event_input_revisions WHERE event_id=c.event_id AND input_revision=2)
    IS DISTINCT FROM original->'facts' OR (SELECT count(*) FROM private.wa_event_input_revisions WHERE event_id=c.event_id)<>2
    OR (SELECT input_snapshot FROM private.wa_payment_outcomes WHERE id=c.outcome_id) IS DISTINCT FROM original THEN
    RAISE EXCEPTION 'Correction rewrote immutable facts/original owner'; END IF;
  SELECT * INTO STRICT attempted FROM expansion_cases WHERE label='attempted';
  UPDATE public.whatsapp_notification_events SET expansion_state='enqueue_failed' WHERE id=attempted.event_id;
  UPDATE public.whatsapp_delivery_jobs SET attempt_count=1 WHERE event_id=attempted.event_id;
  SELECT count(*) INTO count_before FROM public.whatsapp_delivery_jobs WHERE event_id=attempted.event_id;
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.wa_correct_event_expansion(attempted.event_id,1,current_revision,'unsafe','91000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Attempted jobs were corrected/deleted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'attempted_event_correction_forbidden' THEN RAISE; END IF;
  END;
  RESET ROLE;
  IF (SELECT count(*) FROM public.whatsapp_delivery_jobs WHERE event_id=attempted.event_id)<>count_before THEN
    RAISE EXCEPTION 'Refused correction lost job history'; END IF;
END
$corrections$;
SET LOCAL ROLE anon;
DO $privileges$
BEGIN
  BEGIN
    PERFORM public.wa_list_due_expansions(1); RAISE EXCEPTION 'Browser listed internal repair queue';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM private.wa_paid_candidates('{}',true); RAISE EXCEPTION 'Browser called private expansion';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$privileges$;
RESET ROLE;
ROLLBACK;
