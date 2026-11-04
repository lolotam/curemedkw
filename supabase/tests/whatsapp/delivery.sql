-- Actual-role SQL behavior. Synthetic paid-owner attestations/configuration;
-- no provider transport, JWT endpoint, credential decrypt or activation proof.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('92000000-0000-4000-8000-000000000001','delivery@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('92000000-0000-4000-8000-000000000001','admin');
SET LOCAL ROLE service_role;
SELECT public.integration_activate_payment_retention('92000000-0000-4000-8000-000000000001');
RESET ROLE;
CREATE TEMP TABLE delivery_cases(label text PRIMARY KEY,job_id uuid,order_id uuid,attempt_id uuid,token uuid);
INSERT INTO delivery_cases(label,order_id,attempt_id)
SELECT label,md5('delivery-order:'||label)::uuid,md5('delivery-payment:'||label)::uuid FROM unnest(ARRAY[
  'accepted','busy','expired','retry','uncertain','collision','deadline','cancelled','paused','switched',
  'audience','legacy','manual','test','conflict','evolution','media','wrong-actor']) label;
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,subtotal,total,payment_method)
SELECT order_id,'Synthetic buyer','buyer@example.test','50000001',20,20,'pay_by_link' FROM delivery_cases;
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id)
SELECT attempt_id,order_id,20,'delivery-key-'||label,'delivery-invoice-'||label FROM delivery_cases;
UPDATE private.wa_release_state SET state='active',active_credential_binding='postora:dispatch';
INSERT INTO private.wa_credentials(provider,account_identity,purpose,credential_revision,key_version,ciphertext,nonce)
VALUES('postora','postora:dispatch','provider_api',1,1,repeat('a',48),repeat('b',16));
DO $setup$
DECLARE c record; config jsonb; attestation jsonb; receipt jsonb; verification jsonb;
BEGIN
  config:=private.wa_legacy_config('{"enabled":true,"language":"en","admin_numbers":[]}');
  UPDATE public.whatsapp_settings SET provider='postora',account_identity='postora:dispatch',
    cutover_version=1,integration_enabled=true,automation_enabled=true,audiences=config->'audiences',recipients=config->'recipients',
    scheduler_heartbeat_at=NULL;
  FOR c IN SELECT * FROM delivery_cases LOOP
    UPDATE public.whatsapp_settings SET cutover_version=CASE WHEN c.label='legacy' THEN 0 ELSE 1 END;
    attestation:=jsonb_build_object('invoice_id','delivery-invoice-'||c.label,'external_identifier',c.order_id,
      'transaction_payment_id','delivery-payment-'||c.label,'invoice_status','PAID','transaction_status','SUCCESS','details','{}'::jsonb);
    SET LOCAL ROLE service_role;
    receipt:=public.wa_record_provider_payment_outcome(c.order_id,c.attempt_id,attestation,'signed_webhook');
    IF c.label='legacy' THEN PERFORM public.wa_repair_legacy_outcome((receipt->>'outcome_id')::uuid,'worker',NULL);
    ELSE
      verification:=public.wa_claim_pending_payment_verification(c.order_id,'92000000-0000-4000-8000-000000000002');
      PERFORM public.wa_apply_verified_payment(c.order_id,c.attempt_id,attestation||jsonb_build_object('amount_millis',20000,
        'currency','KWD','pending_id',verification->'id','lease_token',verification->'lease_token'),'signed_webhook');
    END IF;
    RESET ROLE;
    UPDATE delivery_cases SET job_id=(SELECT id FROM public.whatsapp_delivery_jobs WHERE order_id=c.order_id) WHERE label=c.label;
  END LOOP;
  UPDATE public.whatsapp_settings SET cutover_version=1;
END
$setup$;
GRANT SELECT,UPDATE ON delivery_cases TO service_role;
CREATE FUNCTION pg_temp.delivery_check(p_condition boolean,p_message text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION '%',p_message; END IF; END
$fn$;

DO $roles$
DECLARE role_name text; call text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH call IN ARRAY ARRAY[
      'SELECT public.wa_claim_delivery(NULL,''worker'',clock_timestamp()+interval ''30 seconds'',NULL)',
      'SELECT public.wa_finish_delivery(NULL,NULL,''{}'')','SELECT public.wa_expire_delivery_leases(NULL)'] LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I',role_name); EXECUTE call;
        RAISE EXCEPTION 'Browser role executed delivery function';
      EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;
      END;
    END LOOP;
  END LOOP;
  SET LOCAL ROLE service_role;
  BEGIN UPDATE public.whatsapp_delivery_jobs SET state='queued'; RAISE EXCEPTION 'Service direct job mutation allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.wa_claim_delivery((SELECT job_id FROM delivery_cases WHERE label='wrong-actor'),'admin',clock_timestamp()+interval '30 seconds',
      '92000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'Forged admin accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.wa_claim_delivery(NULL,'worker',clock_timestamp()+interval '30 seconds','92000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Worker accepted actor claim';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  RESET ROLE;
END
$roles$;

DO $acceptance$
DECLARE first_claim jsonb; second_claim jsonb; finished jsonb; job uuid; replay jsonb;
BEGIN
  SELECT job_id INTO job FROM delivery_cases WHERE label='accepted';
  SET LOCAL ROLE service_role;
  first_claim:=public.wa_claim_delivery(job,'worker',clock_timestamp()+interval '30 seconds');
  PERFORM pg_temp.delivery_check((first_claim->>'claimed')::boolean AND first_claim->>'body'<>'' AND first_claim->'credential'->>'ciphertext'=repeat('a',48),
    'Valid paid job without heartbeat failed or encrypted binding lost');
  second_claim:=public.wa_claim_delivery((SELECT job_id FROM delivery_cases WHERE label='busy'),'worker',clock_timestamp()+interval '30 seconds');
  PERFORM pg_temp.delivery_check(second_claim->>'code'='account_busy','Account allowed concurrent send');
  BEGIN
    PERFORM public.wa_finish_delivery(job,'92000000-0000-4000-8000-000000000099','{"kind":"accepted","providerMessageId":"first"}');
    RAISE EXCEPTION 'Wrong token accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.wa_finish_delivery(job,(first_claim->>'attempt_token')::uuid,'{"kind":"accepted","providerMessageId":"first","api_key":"refused"}');
    RAISE EXCEPTION 'Tainted completion accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  finished:=public.wa_finish_delivery(job,(first_claim->>'attempt_token')::uuid,'{"kind":"accepted","providerMessageId":"first"}');
  replay:=public.wa_finish_delivery(job,(first_claim->>'attempt_token')::uuid,'{"kind":"uncertain","code":"wa_postora_timeout"}');
  PERFORM pg_temp.delivery_check(finished->>'state'='accepted' AND replay->>'state'='accepted' AND replay->'changed'='false',
    'Acceptance regressed or replay changed job');
  second_claim:=public.wa_claim_delivery((SELECT job_id FROM delivery_cases WHERE label='busy'),'worker',clock_timestamp()+interval '30 seconds');
  PERFORM pg_temp.delivery_check(second_claim->>'code'='account_paced','Completion lost minimum account spacing');
  RESET ROLE;
  PERFORM pg_temp.delivery_check((SELECT count(*)=1 FROM public.whatsapp_delivery_attempts WHERE job_id=job),'Duplicate attempt created');
END
$acceptance$;

DO $expiry$
DECLARE claim jsonb; expired jsonb; job uuid;
BEGIN
  SELECT job_id INTO job FROM delivery_cases WHERE label='expired';
  UPDATE public.whatsapp_account_dispatch SET next_slot_at=clock_timestamp()-interval '1 second';
  SET LOCAL ROLE service_role;
  claim:=public.wa_claim_delivery(job,'worker',clock_timestamp()+interval '30 seconds');
  RESET ROLE;
  UPDATE public.whatsapp_delivery_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=job;
  UPDATE public.whatsapp_account_dispatch SET lease_expires_at=clock_timestamp()-interval '1 second';
  SET LOCAL ROLE service_role;
  expired:=public.wa_expire_delivery_leases(job);
  PERFORM pg_temp.delivery_check(expired->>'expired'='1','Expired send not moved to review');
  PERFORM public.wa_expire_delivery_leases(job);
  PERFORM pg_temp.delivery_check(public.wa_finish_delivery(job,(claim->>'attempt_token')::uuid,
    '{"kind":"not_accepted","code":"wa_provider_not_accepted","retryable":true}')->>'state'='needs_review',
    'Later local rejection erased expired uncertainty');
  RESET ROLE;
  UPDATE public.whatsapp_account_dispatch SET next_slot_at=clock_timestamp()-interval '1 second';
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.delivery_check(public.wa_claim_delivery(job,'worker',clock_timestamp()+interval '30 seconds')->>'code'='job_not_due',
    'Expired uncertainty automatically retried');
  PERFORM pg_temp.delivery_check(public.wa_finish_delivery(job,(claim->>'attempt_token')::uuid,
    '{"kind":"accepted","providerMessageId":"late"}')->>'state'='accepted','Matching late acceptance lost');
  RESET ROLE;
  PERFORM pg_temp.delivery_check((SELECT count(*)=1 FROM private.wa_delivery_transitions WHERE job_id=job AND transition='expired') AND
    (SELECT count(*)=1 FROM private.wa_delivery_transitions WHERE job_id=job AND transition='late_result'),'Expiry/late-result audit lost');
END
$expiry$;

DO $retries$
DECLARE claim jsonb; finished jsonb; job uuid; first_token uuid; attempt integer; retry_after integer;
BEGIN
  SELECT job_id INTO job FROM delivery_cases WHERE label='retry';
  FOR attempt IN 1..3 LOOP
    UPDATE public.whatsapp_account_dispatch SET next_slot_at=clock_timestamp()-interval '1 second';
    UPDATE public.whatsapp_delivery_jobs SET due_at=clock_timestamp()-interval '1 second' WHERE id=job;
    SET LOCAL ROLE service_role;
    claim:=public.wa_claim_delivery(job,'worker',clock_timestamp()+interval '30 seconds');
    IF attempt=1 THEN first_token:=(claim->>'attempt_token')::uuid; END IF;
    IF attempt=2 THEN
      BEGIN PERFORM public.wa_finish_delivery(job,first_token,'{"kind":"accepted","providerMessageId":"obsolete"}');
        RAISE EXCEPTION 'Old attempt overwrote new one'; EXCEPTION WHEN serialization_failure THEN NULL; END;
    END IF;
    retry_after:=CASE WHEN attempt=1 THEN 120 ELSE 0 END;
    finished:=public.wa_finish_delivery(job,(claim->>'attempt_token')::uuid,jsonb_build_object('kind','not_accepted',
      'code','wa_provider_not_accepted','retryable',true,'retryAfterSeconds',retry_after));
    PERFORM pg_temp.delivery_check(finished->>'state'=CASE WHEN attempt<3 THEN 'queued' ELSE 'needs_review' END,'Retry/exhaustion policy changed');
    IF attempt<3 THEN PERFORM pg_temp.delivery_check((finished->>'due_at')::timestamptz>=clock_timestamp()+
      CASE WHEN attempt=1 THEN interval '119 seconds' ELSE interval '299 seconds' END,'Backoff/Retry-After shortened'); END IF;
    RESET ROLE;
  END LOOP;
  PERFORM pg_temp.delivery_check((SELECT attempt_count=3 AND safe_reason='delivery_attempts_exhausted' FROM public.whatsapp_delivery_jobs WHERE id=job),
    'Exhausted safe failures did not retain review state');
END
$retries$;

DO $uncertainty_and_conflicts$
DECLARE c record; claim jsonb; outcome jsonb; job uuid;
BEGIN
  FOR c IN SELECT * FROM delivery_cases WHERE label IN ('uncertain','collision','conflict') ORDER BY label LOOP
    UPDATE public.whatsapp_account_dispatch SET next_slot_at=clock_timestamp()-interval '1 second';
    SET LOCAL ROLE service_role;
    claim:=public.wa_claim_delivery(c.job_id,'worker',clock_timestamp()+interval '30 seconds');
    IF c.label='collision' THEN outcome:='{"kind":"accepted","providerMessageId":"first"}';
    ELSIF c.label='uncertain' THEN outcome:='{"kind":"uncertain","code":"wa_postora_timeout"}';
    ELSE outcome:='{"kind":"not_accepted","code":"wa_provider_not_accepted","retryable":true}'; END IF;
    outcome:=public.wa_finish_delivery(c.job_id,(claim->>'attempt_token')::uuid,outcome);
    IF c.label='conflict' THEN
      outcome:=public.wa_finish_delivery(c.job_id,(claim->>'attempt_token')::uuid,'{"kind":"accepted","providerMessageId":"contradictory"}');
    END IF;
    PERFORM pg_temp.delivery_check(outcome->>'state'='needs_review','Uncertainty, collision or contradictory rejection granted resend');
    RESET ROLE;
    IF c.label='uncertain' THEN
      -- A future mistaken state-only reset is insufficient authority; no
      -- duplicate-risk-approved retry exists in this migration.
      UPDATE public.whatsapp_delivery_jobs SET state='queued' WHERE id=c.job_id;
      UPDATE public.whatsapp_account_dispatch SET next_slot_at=clock_timestamp()-interval '1 second';
      SET LOCAL ROLE service_role;
      outcome:=public.wa_claim_delivery(c.job_id,'worker',clock_timestamp()+interval '30 seconds');
      PERFORM pg_temp.delivery_check(outcome->>'code'='delivery_history_requires_review','State-only reset authorized unknown resend');
      RESET ROLE;
    END IF;
  END LOOP;
END
$uncertainty_and_conflicts$;

DO $gates$
DECLARE c record; answer jsonb; config public.whatsapp_settings;
BEGIN
  SELECT * INTO config FROM public.whatsapp_settings WHERE singleton;
  FOR c IN SELECT * FROM delivery_cases WHERE label IN ('deadline','cancelled','paused','switched','audience','legacy') LOOP
    UPDATE public.whatsapp_account_dispatch SET next_slot_at=clock_timestamp()-interval '1 second';
    UPDATE public.whatsapp_settings SET provider=config.provider,account_identity=config.account_identity,
      integration_enabled=config.integration_enabled,automation_enabled=config.automation_enabled,audiences=config.audiences;
    IF c.label='cancelled' THEN UPDATE public.orders SET payment_status='refunded' WHERE id=c.order_id; END IF;
    IF c.label='paused' THEN UPDATE public.whatsapp_settings SET automation_enabled=false; END IF;
    IF c.label='switched' THEN UPDATE public.whatsapp_settings SET provider='evolution',account_identity='96550000009'; END IF;
    IF c.label='audience' THEN UPDATE public.whatsapp_settings SET audiences=jsonb_set(audiences,'{buyer,enabled}','false'); END IF;
    IF c.label='legacy' THEN UPDATE public.whatsapp_settings SET automation_enabled=false,cutover_version=0; END IF;
    SET LOCAL ROLE service_role;
    answer:=public.wa_claim_delivery(c.job_id,'worker',clock_timestamp()+CASE WHEN c.label='deadline' THEN interval '5 seconds' ELSE interval '30 seconds' END);
    IF c.label='legacy' THEN
      PERFORM pg_temp.delivery_check(answer->'claimed'='true','Legacy acquired automation/heartbeat/GET dependency');
      PERFORM public.wa_finish_delivery(c.job_id,(answer->>'attempt_token')::uuid,'{"kind":"not_accepted","code":"wa_postora_not_connected","retryable":false}');
    ELSE
      PERFORM pg_temp.delivery_check(answer->>'code'=CASE c.label WHEN 'deadline' THEN 'deadline_insufficient'
        WHEN 'cancelled' THEN 'order_cancelled_or_refunded' WHEN 'paused' THEN 'automation_paused'
        WHEN 'switched' THEN 'provider_changed' WHEN 'audience' THEN 'audience_paused' END,'Wrong ineligibility classification');
    END IF;
    RESET ROLE;
  END LOOP;
  UPDATE public.whatsapp_settings SET provider=config.provider,account_identity=config.account_identity,cutover_version=1,
    integration_enabled=config.integration_enabled,automation_enabled=config.automation_enabled,audiences=config.audiences;
END
$gates$;

DO $manual_and_connection$
<<manual_and_connection>>
DECLARE c record; answer jsonb; request_id uuid;
BEGIN
  INSERT INTO public.whatsapp_media_objects(id,instance_identity,object_path,mime_type,file_name,byte_size,content_hash)
    VALUES('92000000-0000-4000-8000-000000000030','synthetic-instance','synthetic/image.png','image/png','image.png',12,repeat('f',64));
  UPDATE public.whatsapp_delivery_jobs SET media_object_id='92000000-0000-4000-8000-000000000030' WHERE id=(SELECT job_id FROM delivery_cases WHERE label='media');
  UPDATE public.whatsapp_account_dispatch SET next_slot_at=clock_timestamp()-interval '1 second';
  SET LOCAL ROLE service_role;
  answer:=public.wa_claim_delivery((SELECT job_id FROM delivery_cases WHERE label='media'),'worker',clock_timestamp()+interval '30 seconds');
  PERFORM pg_temp.delivery_check(answer->>'code'='media_not_ready','Postora media received authority');
  RESET ROLE;
  FOR c IN SELECT * FROM delivery_cases WHERE label IN ('manual','test') LOOP
    request_id:=md5('delivery-request:'||c.label)::uuid;
    INSERT INTO private.wa_send_requests(id,actor_id,job_class,request_fingerprint)
      VALUES(request_id,'92000000-0000-4000-8000-000000000001',c.label,repeat('d',64));
    UPDATE public.whatsapp_delivery_jobs SET job_class=c.label,event_id=NULL,outcome_id=NULL,request_id=manual_and_connection.request_id WHERE id=c.job_id;
    UPDATE public.whatsapp_settings SET automation_enabled=false;
    UPDATE public.whatsapp_account_dispatch SET next_slot_at=clock_timestamp()-interval '1 second';
    SET LOCAL ROLE service_role;
    answer:=public.wa_claim_delivery(c.job_id,'admin',clock_timestamp()+interval '30 seconds','92000000-0000-4000-8000-000000000001');
    PERFORM pg_temp.delivery_check(answer->'claimed'='true','Manual/test acquired automation dependency');
    PERFORM public.wa_finish_delivery(c.job_id,(answer->>'attempt_token')::uuid,'{"kind":"uncertain","code":"wa_postora_unreachable"}');
    RESET ROLE;
  END LOOP;
  UPDATE public.whatsapp_settings SET automation_enabled=true,provider='evolution',account_identity='96550000009';
  UPDATE private.wa_release_state SET active_credential_binding='synthetic-instance';
  INSERT INTO private.wa_credentials(provider,account_identity,purpose,credential_revision,key_version,ciphertext,nonce)
    VALUES('evolution','synthetic-instance','provider_api',1,1,repeat('a',48),repeat('b',16));
  INSERT INTO public.evolution_connections(instance_identity,account_identity,session_generation,state)
    VALUES('synthetic-instance','96550000009',7,'disconnected');
  -- Explicit fixture changes stand in for later manual enqueue; they do not
  -- claim a real provider switch can mutate immutable paid jobs.
  SELECT job_id INTO request_id FROM delivery_cases WHERE label='evolution';
  INSERT INTO private.wa_send_requests(id,actor_id,job_class,request_fingerprint)
    VALUES(request_id,'92000000-0000-4000-8000-000000000001','manual',repeat('e',64));
  UPDATE public.whatsapp_delivery_jobs SET job_class='manual',event_id=NULL,outcome_id=NULL,request_id=manual_and_connection.request_id,
    provider='evolution',account_identity='96550000009' WHERE id=manual_and_connection.request_id;
  SET LOCAL ROLE service_role;
  answer:=public.wa_claim_delivery(request_id,'worker',clock_timestamp()+interval '30 seconds');
  PERFORM pg_temp.delivery_check(answer->>'code'='session_not_connected','Disconnected session received authority');
  RESET ROLE;
  UPDATE public.evolution_connections SET state='connected' WHERE instance_identity='synthetic-instance';
  SET LOCAL ROLE service_role;
  answer:=public.wa_claim_delivery(request_id,'worker',clock_timestamp()+interval '30 seconds');
  PERFORM pg_temp.delivery_check(answer->'claimed'='true' AND answer->>'session_generation'='7' AND
    answer#>>'{credential,account_identity}'='synthetic-instance','Instance/account/generation binding lost');
  PERFORM public.wa_finish_delivery(request_id,(answer->>'attempt_token')::uuid,'{"kind":"accepted","providerMessageId":"evolution-first"}');
  RESET ROLE;
END
$manual_and_connection$;
ROLLBACK;
