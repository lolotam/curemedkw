BEGIN;
INSERT INTO auth.users(id,email) VALUES ('10000000-0000-4000-8000-000000000002','fixture-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES ('10000000-0000-4000-8000-000000000002','admin');
INSERT INTO public.evolution_connections(instance_identity,account_identity,session_generation,state)
  VALUES ('fixture-instance','96550001234',1,'connected');
SET LOCAL ROLE service_role;
SELECT public.wa_activate_retention_constraints('10000000-0000-4000-8000-000000000002');
DO $first_activation$
DECLARE v_actor uuid := '10000000-0000-4000-8000-000000000002'; v_source jsonb; v_proof jsonb; v_safe jsonb;
  v_credential jsonb := jsonb_build_object('provider','evolution','account_identity','fixture-instance',
    'purpose','provider_api','generation',0,'credential_revision',1,'key_version',1,
    'ciphertext',encode(convert_to('synthetic-ciphertext-with-tag','UTF8'),'base64'),
    'nonce',encode(convert_to('twelve-bytes','UTF8'),'base64'));
BEGIN
  v_source := public.wa_read_legacy_migration_source(v_actor);
  PERFORM public.wa_migrate_postora_credential(0,jsonb_build_object('mode','unconfigured',
    'baseline_fallback_empty',true,'expected_legacy_fingerprint',v_source ->> 'legacy_fingerprint'),v_actor);
  PERFORM public.wa_store_credential(1,v_credential,v_actor);
  v_proof := public.wa_record_provider_readiness(2,'evolution','fixture-instance','96550001234',1,false,NULL,v_actor);
  PERFORM set_config('fixture.proof',v_proof ->> 'readiness_proof',true);
  BEGIN
    PERFORM public.wa_activate_provider(2,'evolution',v_proof ->> 'readiness_proof','10000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Non-admin activated provider';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.wa_activate_provider(2,'evolution','00000000-0000-4000-8000-000000000000',v_actor);
    RAISE EXCEPTION 'Browser-minted proof activated provider';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  v_safe := public.wa_activate_provider(2,'evolution',v_proof ->> 'readiness_proof',v_actor);
  IF v_safe ->> 'settings_revision' IS DISTINCT FROM '3' OR v_safe ->> 'account_identity' IS DISTINCT FROM '96550001234'
     OR v_safe ->> 'automation_enabled' IS DISTINCT FROM 'false' OR v_safe ->> 'cutover_version' IS DISTINCT FROM '0' THEN
    RAISE EXCEPTION 'Provider activation changed automation owner or lost actual identity';
  END IF;
  PERFORM set_config('fixture.first_activation',v_safe ->> 'first_activated_at',true);
  BEGIN
    PERFORM public.wa_activate_provider(2,'evolution',v_proof ->> 'readiness_proof',v_actor);
    RAISE EXCEPTION 'Stale provider revision accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
END
$first_activation$;
DO $heartbeat_gate$
DECLARE v_actor uuid := '10000000-0000-4000-8000-000000000002'; v_safe jsonb; v_config jsonb;
BEGIN
  v_safe := public.wa_read_settings(v_actor);
  v_config := v_safe - ARRAY['settings_revision','credential_revision','provider','account_identity','cutover_version',
    'credential','readiness','scheduler_heartbeat_at','first_activated_at','legacy_fingerprint'];
  v_config := v_config || '{"integration_enabled":true,"automation_enabled":true}';
  BEGIN
    PERFORM public.wa_save_settings(3,v_config,NULL,v_actor);
    RAISE EXCEPTION 'Missing scheduler heartbeat permitted automation';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  EXECUTE 'RESET ROLE';
  UPDATE public.whatsapp_settings SET scheduler_heartbeat_at=now();
  EXECUTE 'SET LOCAL ROLE service_role';
  v_safe := public.wa_save_settings(3,v_config,NULL,v_actor);
  IF v_safe ->> 'settings_revision' IS DISTINCT FROM '4' OR v_safe ->> 'cutover_version' IS DISTINCT FROM '1'
     OR v_safe ->> 'automation_enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Enablement did not atomically switch cutover';
  END IF;
  EXECUTE 'RESET ROLE';
  UPDATE public.whatsapp_settings SET scheduler_heartbeat_at=now()-interval '1 hour';
  EXECUTE 'SET LOCAL ROLE service_role';
  v_safe := public.wa_save_settings(4,v_config,NULL,v_actor);
  IF v_safe ->> 'automation_enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'A scheduler outage disabled existing automation';
  END IF;
END
$heartbeat_gate$;
RESET ROLE;
DO $single_provider_mirror$
BEGIN
  IF (SELECT value ->> 'enabled' FROM public.site_settings WHERE key='whatsapp_integration') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Evolution activation left the baseline Postora sender enabled';
  END IF;
END
$single_provider_mirror$;
INSERT INTO private.wa_send_requests(id,actor_id,job_class,request_fingerprint)
  VALUES ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','manual',repeat('a',64));
INSERT INTO public.whatsapp_delivery_jobs(id,job_class,request_id,normalized_recipient,audience,rendered_body,
  rendered_content_hash,provider,account_identity,settings_revision,attempt_count)
VALUES
  ('50000000-0000-4000-8000-000000000001','manual','40000000-0000-4000-8000-000000000001','96550000091','manual','fixture',repeat('a',64),'evolution','96550001234',5,0),
  ('50000000-0000-4000-8000-000000000002','manual','40000000-0000-4000-8000-000000000001','96550000092','manual','fixture',repeat('b',64),'evolution','96550001234',5,1),
  ('50000000-0000-4000-8000-000000000003','manual','40000000-0000-4000-8000-000000000001','96550000093','manual','fixture',repeat('c',64),'postora','postora:older',5,0);
UPDATE public.whatsapp_delivery_jobs SET state='sending',attempt_token=(gen_random_uuid()),
  lease_expires_at=now()-interval '1 minute' WHERE id='50000000-0000-4000-8000-000000000002';
UPDATE public.whatsapp_account_dispatch SET active_job_id='50000000-0000-4000-8000-000000000002',
  lease_expires_at=now()-interval '1 minute' WHERE provider='evolution' AND account_identity='96550001234';
SET LOCAL ROLE service_role;
DO $inflight$
BEGIN
  BEGIN
    PERFORM public.wa_activate_provider(5,'evolution',current_setting('fixture.proof'),'10000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Expired but unresolved send permitted provider activation';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END
$inflight$;
RESET ROLE;
-- Fixture simulates the explicit finish/expiry step; no send was made.
UPDATE public.whatsapp_account_dispatch SET active_job_id=NULL,lease_expires_at=NULL WHERE provider='evolution' AND account_identity='96550001234';
UPDATE public.whatsapp_delivery_jobs SET state='queued',attempt_token=NULL,lease_expires_at=NULL WHERE id='50000000-0000-4000-8000-000000000002';
UPDATE public.evolution_connections SET account_identity='96550005678',session_generation=2 WHERE instance_identity='fixture-instance';
SET LOCAL ROLE service_role;
DO $new_sender$
DECLARE v_actor uuid := '10000000-0000-4000-8000-000000000002'; v_proof jsonb; v_safe jsonb;
BEGIN
  BEGIN
    PERFORM public.wa_activate_provider(5,'evolution',current_setting('fixture.proof'),v_actor);
    RAISE EXCEPTION 'Old generation proof accepted for changed sender';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  v_proof := public.wa_record_provider_readiness(5,'evolution','fixture-instance','96550005678',2,false,NULL,v_actor);
  v_safe := public.wa_activate_provider(5,'evolution',v_proof ->> 'readiness_proof',v_actor);
  IF v_safe ->> 'account_identity' IS DISTINCT FROM '96550005678'
     OR v_safe ->> 'first_activated_at' IS DISTINCT FROM current_setting('fixture.first_activation')
     OR v_safe ->> 'cutover_version' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Sender activation changed first activation or cutover';
  END IF;
END
$new_sender$;
RESET ROLE;
DO $parked$
BEGIN
  IF (SELECT parked_reason FROM public.whatsapp_delivery_jobs WHERE id='50000000-0000-4000-8000-000000000001') IS DISTINCT FROM 'account_changed'
     OR (SELECT parked_reason FROM public.whatsapp_delivery_jobs WHERE id='50000000-0000-4000-8000-000000000003') IS DISTINCT FROM 'provider_changed'
     OR EXISTS (SELECT 1 FROM public.whatsapp_delivery_jobs WHERE id='50000000-0000-4000-8000-000000000002'
       AND (parked_reason IS NOT NULL OR account_identity<>'96550001234' OR attempt_count<>1)) THEN
    RAISE EXCEPTION 'Activation rerouted attempted work or failed to park old identity';
  END IF;
END
$parked$;
ROLLBACK;
SELECT 'Provider proof/identity, in-flight exclusion, heartbeat cutover and job parking proofs passed';
