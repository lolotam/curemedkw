-- Read-only provider attestations are synthetic; no native request is made.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('87000000-0000-4000-8000-000000000001','readiness-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('87000000-0000-4000-8000-000000000001','admin');
UPDATE public.integrations SET configuration=jsonb_set(configuration,'{sandbox}',
  '{"appId":null,"serviceCode":"Next Day","autoConfirm":false,"pickupInstructions":"Synthetic call first, 09:00-16:00",
    "origin":{"contactName":"Synthetic office","contactPhone":"+96550000002","address":{"countryCode":"KW",
      "governorate":"Hawally","area":"Hawally","block":"","street":"Synthetic street","building":"2","addressLine":""}},
    "parcel":{"count":1,"weightKg":1,"dimensionsCm":{"lengthCm":10,"widthCm":8,"heightCm":6}}}') WHERE provider='shipa';
CREATE TEMP TABLE readiness_receipts(name text PRIMARY KEY,document jsonb);
GRANT SELECT,INSERT,UPDATE ON readiness_receipts TO service_role;
SET LOCAL ROLE service_role;
DO $credential_and_probe$
DECLARE actor uuid:='87000000-0000-4000-8000-000000000001'; settings jsonb; patch jsonb; envelope jsonb;
  binding uuid; key_fingerprint text; readiness jsonb; observation jsonb; saved jsonb;
BEGIN
  settings:=public.shipa_read_settings(actor); binding:=(settings->>'integration_id')::uuid;
  patch:=(settings->'settings')-'revision';
  patch:=jsonb_set(jsonb_set(patch,'{sandbox}',(patch->'sandbox')-'credential'),'{live}',(patch->'live')-'credential');
  readiness:=public.shipa_read_readiness(actor);
  IF readiness#>>'{environments,sandbox,safe_code}'<>'credential_missing'
    OR readiness#>>'{environments,sandbox,configuration_ready}'<>'true'
    OR readiness#>>'{environments,live,configuration_ready}'<>'false'
    OR readiness#>>'{scheduler,current}'<>'false' THEN RAISE EXCEPTION 'Missing readiness was misreported'; END IF;
  envelope:=jsonb_build_object('integration_id',binding,'provider','shipa','environment','sandbox','key_version',1,
    'nonce',encode(decode(repeat('ab',12),'hex'),'base64'),'ciphertext',encode(decode(repeat('cd',17),'hex'),'base64'));
  saved:=public.shipa_save_settings(0,patch,jsonb_build_object('mode','replace','environment','sandbox','envelope',envelope),actor);
  key_fingerprint:=public.shipa_read_credential(binding,'sandbox')->>'credential_fingerprint';
  observation:=jsonb_build_object('credentialFingerprint',key_fingerprint,'countryCode','KWT',
    'cities',jsonb_build_array(' Hawally ','Hawally','Kuwait City'),'code',NULL,'verified',true);
  BEGIN
    PERFORM public.shipa_record_provider_observation(1,'sandbox',observation,'87000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'Forged nonexistent admin was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.shipa_record_provider_observation(0,'sandbox',observation,actor);
    RAISE EXCEPTION 'Stale settings proof was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.shipa_record_provider_observation(1,'sandbox',observation||jsonb_build_object('credentialFingerprint',repeat('f',64)),actor);
    RAISE EXCEPTION 'Different loaded key was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.shipa_record_provider_observation(1,'sandbox',observation||'{"serviceEntitled":true}',actor);
    RAISE EXCEPTION 'Invented entitlement was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.shipa_record_provider_observation(1,'sandbox',observation,actor);
  readiness:=public.shipa_read_readiness(actor);
  IF readiness#>>'{environments,sandbox,credentials_verified}'<>'true'
    OR readiness#>>'{environments,sandbox,origin_city_matched}'<>'true'
    OR readiness#>>'{environments,sandbox,service_entitlement}'<>'unconfirmed'
    OR readiness#>>'{environments,live,probe_current}'<>'false'
    OR readiness::text ~ 'ciphertext|nonce|apiKey|credentialFingerprint|credential_fingerprint' THEN
    RAISE EXCEPTION 'Successful readiness leaked authority, secrets or environment state';
  END IF;
  INSERT INTO pg_temp.readiness_receipts VALUES('observation',observation),('patch',patch),('envelope',envelope),('safe',saved);
  saved:=public.shipa_record_scheduler_ok('87000000-0000-4000-8000-000000000002','sandbox',key_fingerprint);
  IF saved->>'recorded'<>'true' OR (public.shipa_read_readiness(actor)#>>'{scheduler,current}')<>'true' THEN
    RAISE EXCEPTION 'Empty-queue scheduler receipt was not recorded'; END IF;
  INSERT INTO pg_temp.readiness_receipts VALUES('scheduler',saved);
  IF public.shipa_record_scheduler_ok('87000000-0000-4000-8000-000000000002','sandbox',key_fingerprint)->>'recorded'<>'false' THEN
    RAISE EXCEPTION 'Scheduler replay was recorded as a new run'; END IF;
  BEGIN
    PERFORM public.shipa_record_scheduler_ok(gen_random_uuid(),'live',key_fingerprint);
    RAISE EXCEPTION 'Wrong-environment scheduler was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
END
$credential_and_probe$;
RESET ROLE;
DO $stored_observation$
BEGIN
  IF (SELECT cities FROM private.shipa_provider_observations WHERE environment='sandbox')<>'["Hawally","Kuwait City"]'::jsonb
    OR (SELECT enabled FROM public.integrations WHERE provider='shipa')
    OR (SELECT revision FROM public.integrations WHERE provider='shipa')<>1 THEN
    RAISE EXCEPTION 'Diagnostics changed configuration or retained duplicate directory entries'; END IF;
END
$stored_observation$;
UPDATE private.shipa_provider_observations SET expires_at=now()-interval '1 second';
UPDATE private.shipa_scheduler_runs SET completed_at=now()-interval '4 minutes';
UPDATE public.integrations SET worker_last_ok_at=(SELECT completed_at FROM private.shipa_scheduler_runs);
SET LOCAL ROLE service_role;
DO $stale_failure_and_rotation$
DECLARE actor uuid:='87000000-0000-4000-8000-000000000001'; observation jsonb; readiness jsonb; patch jsonb; envelope jsonb;
  saved jsonb; binding uuid; original_fingerprint text;
BEGIN
  SELECT document INTO observation FROM pg_temp.readiness_receipts WHERE name='observation';
  SELECT document INTO patch FROM pg_temp.readiness_receipts WHERE name='patch';
  SELECT document INTO envelope FROM pg_temp.readiness_receipts WHERE name='envelope';
  binding:=(envelope->>'integration_id')::uuid; original_fingerprint:=observation->>'credentialFingerprint';
  readiness:=public.shipa_read_readiness(actor);
  IF readiness#>>'{environments,sandbox,probe_current}'<>'false' OR readiness#>>'{scheduler,current}'<>'false' THEN
    RAISE EXCEPTION 'Stale probe/heartbeat remained current'; END IF;
  saved:=public.shipa_record_scheduler_ok('87000000-0000-4000-8000-000000000002','sandbox',original_fingerprint);
  IF saved->>'recorded'<>'false' OR (public.shipa_read_readiness(actor)#>>'{scheduler,current}')<>'false' THEN
    RAISE EXCEPTION 'An old run replay refreshed scheduler health'; END IF;
  PERFORM public.shipa_record_provider_observation(1,'sandbox',observation,actor);
  PERFORM public.shipa_record_provider_observation(1,'sandbox',jsonb_set(observation,'{cities}','["Kuwait City"]'),actor);
  readiness:=public.shipa_read_readiness(actor);
  IF readiness#>>'{environments,sandbox,credentials_verified}'<>'true'
    OR readiness#>>'{environments,sandbox,origin_city_matched}'<>'false' THEN RAISE EXCEPTION 'Origin city mismatch was ignored'; END IF;
  PERFORM public.shipa_record_provider_observation(1,'sandbox',jsonb_build_object('credentialFingerprint',original_fingerprint,
    'countryCode',NULL,'cities','[]'::jsonb,'code','unauthorized','verified',false),actor);
  readiness:=public.shipa_read_readiness(actor);
  IF readiness#>>'{environments,sandbox,credentials_verified}'<>'false'
    OR readiness#>>'{environments,sandbox,safe_code}'<>'unauthorized' THEN RAISE EXCEPTION 'Failed probe retained successful verification'; END IF;
  PERFORM public.shipa_record_provider_observation(1,'sandbox',observation,actor);
  saved:=public.shipa_save_settings(1,patch,NULL,actor);
  IF public.shipa_read_readiness(actor)#>>'{environments,sandbox,probe_current}'<>'false' THEN
    RAISE EXCEPTION 'Settings change retained an old probe'; END IF;
  PERFORM public.shipa_record_provider_observation(2,'sandbox',observation,actor);
  envelope:=jsonb_set(envelope,'{ciphertext}',to_jsonb(encode(decode(repeat('ef',17),'hex'),'base64')));
  saved:=public.shipa_save_settings(2,patch,jsonb_build_object('mode','replace','environment','sandbox','envelope',envelope),actor);
  IF public.shipa_read_readiness(actor)#>>'{environments,sandbox,probe_current}'<>'false'
    OR public.shipa_read_credential(binding,'sandbox')->>'credential_fingerprint'=original_fingerprint THEN
    RAISE EXCEPTION 'Rotation retained a stale diagnostic binding'; END IF;
  BEGIN
    PERFORM public.shipa_record_scheduler_ok(gen_random_uuid(),'sandbox',original_fingerprint);
    RAISE EXCEPTION 'Stale loaded key refreshed scheduler health';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  saved:=public.shipa_save_settings(3,patch,'{"mode":"remove","environment":"sandbox"}',actor);
  IF public.shipa_read_credential(binding,'sandbox') IS NOT NULL THEN RAISE EXCEPTION 'Idle credential removal failed'; END IF;
END
$stale_failure_and_rotation$;
RESET ROLE;
DO $privileges$
DECLARE signature text;
BEGIN
  FOR signature IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.proname LIKE 'shipa_%' LOOP
    IF has_function_privilege('service_role',signature,'EXECUTE') OR has_function_privilege('anon',signature,'EXECUTE')
      OR has_function_privilege('authenticated',signature,'EXECUTE') THEN RAISE EXCEPTION 'Private readiness/storage helper leaked'; END IF;
  END LOOP;
  IF has_table_privilege('service_role','private.shipa_provider_observations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('authenticated','private.shipa_scheduler_runs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'Direct diagnostic writes leaked'; END IF;
END
$privileges$;
SET LOCAL ROLE authenticated;
DO $browser_denied$
BEGIN
  BEGIN
    PERFORM public.shipa_read_readiness('87000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Browser obtained protected readiness RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.shipa_record_scheduler_ok(gen_random_uuid(),'sandbox',repeat('f',64));
    RAISE EXCEPTION 'Browser forged scheduler success';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$browser_denied$;
ROLLBACK;
