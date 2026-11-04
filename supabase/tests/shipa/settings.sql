-- Real-role local fixture proof. Synthetic rows only; all data changes roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
  ('20000000-0000-4000-8000-000000000002','shipa-admin@example.test'),
  ('20000000-0000-4000-8000-000000000003','shipa-user@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES
  ('20000000-0000-4000-8000-000000000002','admin');

DO $acl$
DECLARE v_signature text; v_role text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY['public.shipa_read_settings(uuid)',
    'public.shipa_read_credential(uuid,text)','public.shipa_save_settings(integer,jsonb,jsonb,uuid)'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(v_role,v_signature,'EXECUTE') THEN
        RAISE EXCEPTION 'Browser inherited protected function execution';
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role',v_signature,'EXECUTE') THEN
      RAISE EXCEPTION 'Service wrapper unavailable';
    END IF;
  END LOOP;
END
$acl$;

SET LOCAL ROLE anon;
DO $anon$
BEGIN
  BEGIN
    PERFORM public.shipa_read_settings('20000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Anon called protected read';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM * FROM public.integrations;
    RAISE EXCEPTION 'Anon read settings';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$anon$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
DO $customer$
BEGIN
  IF EXISTS(SELECT 1 FROM public.integrations) THEN RAISE EXCEPTION 'Non-admin read configuration'; END IF;
  BEGIN
    UPDATE public.integrations SET enabled=true;
    RAISE EXCEPTION 'Browser changed configuration';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$customer$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
DO $admin_read$
BEGIN
  IF (SELECT count(*) FROM public.integrations)<>1 THEN RAISE EXCEPTION 'Admin safe read unavailable'; END IF;
  BEGIN
    PERFORM * FROM private.integration_credentials;
    RAISE EXCEPTION 'Admin read ciphertext directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$admin_read$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $settings$
DECLARE v_actor uuid:='20000000-0000-4000-8000-000000000002';
  v_safe jsonb; v_patch jsonb; v_tuple jsonb; v_change jsonb; v_read jsonb;
  v_id uuid; v_revision integer; v_bad jsonb;
BEGIN
  BEGIN
    PERFORM public.shipa_read_settings('20000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Service bypassed real admin actor';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  v_safe:=public.shipa_read_settings(v_actor); v_id:=(v_safe->>'integration_id')::uuid;
  IF v_safe->'settings'->>'enabled'<>'false' OR v_safe->'settings'->>'revision'<>'0'
    OR v_safe->'settings'->>'environment'<>'sandbox' THEN RAISE EXCEPTION 'Unsafe initial state'; END IF;
  IF public.shipa_read_credential(v_id,'sandbox') IS NOT NULL THEN RAISE EXCEPTION 'Seeded a credential'; END IF;
  v_patch:=(v_safe->'settings')-'revision';
  v_patch:=jsonb_set(v_patch,'{sandbox}',(v_patch->'sandbox')-'credential');
  v_patch:=jsonb_set(v_patch,'{live}',(v_patch->'live')-'credential');
  v_patch:=jsonb_set(v_patch,'{sandbox,serviceCode}','"Next Day"');
  v_patch:=jsonb_set(v_patch,'{sandbox,pickupInstructions}','"Call before collection; 09:00-16:00 Kuwait time."');
  v_safe:=public.shipa_save_settings(0,v_patch,NULL,v_actor);
  IF v_safe->'settings'->>'revision'<>'1' OR v_safe->'settings'->'sandbox'->>'serviceCode'<>'Next Day'
    OR v_safe->'settings'->'live'->'serviceCode'<>'null'::jsonb THEN RAISE EXCEPTION 'Save changed another environment'; END IF;
  v_tuple:=jsonb_build_object('integration_id',v_id,'provider','shipa','environment','sandbox',
    'key_version',1,'nonce',encode(decode(repeat('01',12),'hex'),'base64'),
    'ciphertext',encode(decode(repeat('02',17),'hex'),'base64'));
  v_change:=jsonb_build_object('mode','replace','environment','sandbox','envelope',v_tuple);
  v_safe:=public.shipa_save_settings(1,v_patch,v_change,v_actor);
  v_read:=public.shipa_read_credential(v_id,'sandbox');
  IF v_read->'envelope' IS DISTINCT FROM v_tuple OR v_read->>'credential_revision'<>'1'
    OR v_safe->'settings'->'sandbox'->'credential'->>'present'<>'true'
    OR v_safe::text LIKE '%ciphertext%' OR v_safe::text LIKE '%nonce%' THEN
    RAISE EXCEPTION 'Credential envelope/safe metadata mismatch';
  END IF;
  v_safe:=public.shipa_save_settings(2,v_patch,NULL,v_actor);
  IF public.shipa_read_credential(v_id,'sandbox') IS DISTINCT FROM v_read THEN
    RAISE EXCEPTION 'Ordinary save rotated a key';
  END IF;
  BEGIN
    PERFORM public.shipa_save_settings(1,v_patch,v_change,v_actor);
    RAISE EXCEPTION 'Stale save overwrote settings';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (public.shipa_read_settings(v_actor)->'settings'->>'revision')<>'3' THEN
    RAISE EXCEPTION 'Conflict advanced revision';
  END IF;
  FOREACH v_bad IN ARRAY ARRAY[
    v_patch||'{"api_key":"test-key"}'::jsonb,
    jsonb_set(v_patch,'{sandbox,origin,address,countryCode}','"SA"'),
    jsonb_set(v_patch,'{sandbox,parcel,count}','2'),
    jsonb_set(v_patch,'{environment}','null'),
    jsonb_set(v_patch,'{sandbox,parcel,weightKg}','-1'),
    jsonb_set(v_patch,'{sandbox,serviceCode}','"Cross Border"')
  ] LOOP
    BEGIN
      PERFORM public.shipa_save_settings(3,v_bad,NULL,v_actor);
      RAISE EXCEPTION 'Invalid safe patch accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  BEGIN
    PERFORM public.shipa_save_settings(3,v_patch,jsonb_set(v_change,'{envelope,environment}','"live"'),v_actor);
    RAISE EXCEPTION 'Environment-swapped tuple accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.shipa_save_settings(3,jsonb_set(v_patch,'{enabled}','true'),NULL,v_actor);
    RAISE EXCEPTION 'Enabled incomplete runtime';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  v_safe:=public.shipa_save_settings(3,v_patch,jsonb_build_object('mode','replace','environment','live',
    'envelope',jsonb_set(v_tuple,'{environment}','"live"')),v_actor);
  v_safe:=public.shipa_save_settings(4,v_patch,'{"mode":"remove","environment":"sandbox"}',v_actor);
  IF public.shipa_read_credential(v_id,'sandbox') IS NOT NULL
    OR public.shipa_read_credential(v_id,'live') IS NULL
    OR v_safe->'settings'->>'revision'<>'5' THEN RAISE EXCEPTION 'Removal crossed environments'; END IF;
  BEGIN
    DELETE FROM public.integrations WHERE id=v_id;
    RAISE EXCEPTION 'Service bypassed protected writer';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$settings$;
RESET ROLE;
ROLLBACK;
\echo Shipa settings, credential isolation, RLS, stale-save and disabled-runtime proofs passed
