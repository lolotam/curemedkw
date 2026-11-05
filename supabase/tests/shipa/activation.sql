BEGIN;
INSERT INTO auth.users(id,email) VALUES('87000000-0000-4000-8000-000000000091','activation@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('87000000-0000-4000-8000-000000000091','admin');
UPDATE public.integrations SET configuration=jsonb_set(configuration,'{sandbox}',
  '{"appId":null,"serviceCode":"Next Day","autoConfirm":false,"pickupInstructions":"Synthetic test",
    "origin":{"contactName":"Synthetic office","contactPhone":"+96550000002","address":{"countryCode":"KW",
      "governorate":"Hawally","area":"Hawally","block":"","street":"Synthetic street","building":"2","addressLine":""}},
    "parcel":{"count":1,"weightKg":1,"dimensionsCm":{"lengthCm":10,"widthCm":8,"heightCm":6}}}') WHERE provider='shipa';
SET LOCAL ROLE service_role;
DO $proof$
DECLARE actor uuid:='87000000-0000-4000-8000-000000000091'; settings jsonb; patch jsonb; binding uuid; envelope jsonb; fingerprint text;
BEGIN
  settings:=public.shipa_read_settings(actor); binding:=(settings->>'integration_id')::uuid;
  patch:=(settings->'settings')-'revision';
  patch:=jsonb_set(jsonb_set(patch,'{sandbox}',(patch->'sandbox')-'credential'),'{live}',(patch->'live')-'credential');
  envelope:=jsonb_build_object('integration_id',binding,'provider','shipa','environment','sandbox','key_version',1,
    'nonce',encode(decode(repeat('ab',12),'hex'),'base64'),'ciphertext',encode(decode(repeat('cd',17),'hex'),'base64'));
  PERFORM public.shipa_save_settings(0,patch,jsonb_build_object('mode','replace','environment','sandbox','envelope',envelope),actor);
  patch:=jsonb_set(patch,'{enabled}','true');
  BEGIN
    PERFORM public.shipa_save_settings(1,patch,NULL,actor);
    RAISE EXCEPTION 'Activation without a current probe succeeded';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'shipa_verification_stale' THEN RAISE; END IF;
  END;
  fingerprint:=public.shipa_read_credential(binding,'sandbox')->>'credential_fingerprint';
  PERFORM public.shipa_record_provider_observation(1,'sandbox',jsonb_build_object('credentialFingerprint',fingerprint,
    'countryCode','KWT','cities',jsonb_build_array('Hawally'),'code',NULL,'verified',true),actor);
  settings:=public.shipa_save_settings(1,patch,NULL,actor);
  IF settings#>>'{settings,enabled}'<>'true' OR settings#>>'{settings,revision}'<>'2' THEN RAISE EXCEPTION 'Manual activation failed'; END IF;
  IF public.shipa_read_readiness(actor)#>>'{environments,sandbox,probe_current}'<>'true' THEN RAISE EXCEPTION 'Pure activation invalidated probe'; END IF;
  BEGIN
    PERFORM public.shipa_save_settings(2,jsonb_set(patch,'{sandbox,origin,address,area}','"Other"'),NULL,actor);
    RAISE EXCEPTION 'Changed pickup activated against old probe';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  patch:=jsonb_set(patch,'{dispatchMode}','"automatic_after_payment"');
  BEGIN
    PERFORM public.shipa_save_settings(2,patch,NULL,actor);
    RAISE EXCEPTION 'Automatic activation without heartbeat succeeded';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'shipa_scheduler_stale' THEN RAISE; END IF;
  END;
  PERFORM public.shipa_record_scheduler_ok(gen_random_uuid(),'sandbox',fingerprint);
  settings:=public.shipa_save_settings(2,patch,NULL,actor);
  IF settings#>>'{settings,dispatchMode}'<>'automatic_after_payment' THEN RAISE EXCEPTION 'Automatic activation failed'; END IF;
END
$proof$;
ROLLBACK;
