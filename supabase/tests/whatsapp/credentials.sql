BEGIN;
DO $privileges$
DECLARE v_function regprocedure;
BEGIN
  FOR v_function IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='private' AND p.proname LIKE 'wa_%')
       OR (n.nspname='public' AND p.proname LIKE 'wa_%') LOOP
    IF has_function_privilege('anon',v_function,'EXECUTE')
       OR has_function_privilege('authenticated',v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'Protected function is browser callable: %',v_function;
    END IF;
  END LOOP;
END
$privileges$;
INSERT INTO auth.users(id,email) VALUES ('10000000-0000-4000-8000-000000000002','fixture-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES ('10000000-0000-4000-8000-000000000002','admin');
SET LOCAL ROLE service_role;
SELECT public.wa_activate_retention_constraints('10000000-0000-4000-8000-000000000002');
DO $credential_proof$
DECLARE v_actor uuid := '10000000-0000-4000-8000-000000000002'; v_result jsonb; v_row jsonb; v_proof text;
  v_change jsonb := jsonb_build_object('provider','postora','account_identity','postora:fixture-account',
    'purpose','provider_api','generation',0,'credential_revision',1,'key_version',1,
    'ciphertext',encode(convert_to('synthetic-ciphertext-with-tag','UTF8'),'base64'),
    'nonce',encode(convert_to('twelve-bytes','UTF8'),'base64'));
BEGIN
  BEGIN
    PERFORM public.wa_store_credential(0,v_change,'10000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Non-admin stored a credential';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.wa_store_credential(0,v_change || '{"plaintext":"fixture-value"}',v_actor);
    RAISE EXCEPTION 'Plaintext field accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.wa_store_credential(0,jsonb_set(v_change,'{nonce}','"not-base64"'),v_actor);
    RAISE EXCEPTION 'Malformed nonce accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  v_result := public.wa_store_credential(0,v_change,v_actor);
  IF v_result ->> 'settings_revision' IS DISTINCT FROM '1' OR v_result ->> 'credential_revision' IS DISTINCT FROM '1'
     OR v_result ? 'ciphertext' OR v_result ? 'nonce' THEN RAISE EXCEPTION 'Unsafe store response'; END IF;
  v_row := public.wa_read_credentials('postora','postora:fixture-account');
  IF v_row -> 'credential' IS DISTINCT FROM v_change THEN RAISE EXCEPTION 'Encrypted row changed at storage boundary'; END IF;
  BEGIN
    PERFORM public.wa_store_credential(0,jsonb_set(v_change,'{credential_revision}','2'),v_actor);
    RAISE EXCEPTION 'Stale settings revision overwrote a credential';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.wa_store_credential(1,v_change,v_actor);
    RAISE EXCEPTION 'Reused credential revision accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  v_result := public.wa_record_provider_readiness(1,'postora','postora:fixture-account',
    'postora:fixture-account',NULL,true,encode(sha256(convert_to('{}'::jsonb::text,'UTF8')),'hex'),v_actor);
  IF v_result ->> 'readiness_proof' IS NULL THEN RAISE EXCEPTION 'No server proof issued'; END IF;
  v_proof := v_result ->> 'readiness_proof';
  v_result := public.wa_record_provider_readiness(1,'postora','postora:fixture-account',
    'postora:fixture-account',NULL,false,NULL,v_actor);
  IF v_result ->> 'readiness_proof' IS NOT DISTINCT FROM v_proof THEN
    RAISE EXCEPTION 'Readiness renewal did not replace the proof token';
  END IF;
  v_result := public.wa_read_provider_readiness('postora','postora:fixture-account');
  IF v_result ->> 'verified' IS DISTINCT FROM 'true' OR v_result ->> 'consumed' IS DISTINCT FROM 'false'
     OR v_result ? 'credential' OR v_result ? 'readiness_proof' THEN RAISE EXCEPTION 'Unsafe readiness response'; END IF;
  BEGIN
    PERFORM public.wa_record_provider_readiness(1,'postora','postora:fixture-account',
      'postora:fixture-account',NULL,true,repeat('0',64),v_actor);
    RAISE EXCEPTION 'Stale legacy fingerprint accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.wa_record_provider_readiness(1,'postora','postora:fixture-account','invented-phone',NULL,false,NULL,v_actor);
    RAISE EXCEPTION 'Unestablished Postora identity accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.wa_store_credential(1,jsonb_set(v_change,'{credential_revision}','2'),v_actor);
  IF public.wa_read_provider_readiness('postora','postora:fixture-account') IS NOT NULL THEN
    RAISE EXCEPTION 'Credential rotation retained an old readiness proof';
  END IF;
  v_change := jsonb_set(jsonb_set(jsonb_set(v_change,'{provider}','"evolution"'),
    '{account_identity}','"fixture-instance"'),'{credential_revision}','1');
  PERFORM public.wa_store_credential(2,v_change,v_actor);
  BEGIN
    PERFORM public.wa_record_provider_readiness(3,'evolution','fixture-instance','96550001234',1,false,NULL,v_actor);
    RAISE EXCEPTION 'Unobserved Evolution sender accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END
$credential_proof$;
RESET ROLE;
INSERT INTO public.evolution_connections(instance_identity,account_identity,session_generation,state)
  VALUES ('fixture-instance','96550001234',1,'connected');
SET LOCAL ROLE service_role;
SELECT public.wa_record_provider_readiness(3,'evolution','fixture-instance','96550001234',1,false,NULL,
  '10000000-0000-4000-8000-000000000002');
DO $connected$
BEGIN
  IF public.wa_read_provider_readiness('evolution','fixture-instance') ->> 'verified' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Observed connection not usable';
  END IF;
END
$connected$;
RESET ROLE;
UPDATE public.evolution_connections SET account_identity='96550005678',session_generation=2 WHERE instance_identity='fixture-instance';
SET LOCAL ROLE service_role;
DO $sender_change$
BEGIN
  IF public.wa_read_provider_readiness('evolution','fixture-instance') ->> 'verified' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Sender change retained old readiness';
  END IF;
END
$sender_change$;
RESET ROLE;
UPDATE public.evolution_connections SET account_identity='96550001234',session_generation=1 WHERE instance_identity='fixture-instance';
UPDATE private.wa_provider_readiness SET observed_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute';
SET LOCAL ROLE service_role;
DO $expiry$
BEGIN
  IF public.wa_read_provider_readiness('evolution','fixture-instance') ->> 'verified' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Expired proof remained verified';
  END IF;
END
$expiry$;
RESET ROLE;
ROLLBACK;
SELECT 'Encrypted storage, real-role authorization and readiness binding proofs passed';
