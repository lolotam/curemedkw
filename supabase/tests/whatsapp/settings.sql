BEGIN;
INSERT INTO auth.users(id,email) VALUES ('10000000-0000-4000-8000-000000000002','fixture-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES ('10000000-0000-4000-8000-000000000002','admin');
INSERT INTO public.site_settings(key,value) VALUES ('whatsapp_integration',
  '{"api_key":"fixture-key","enabled":true,"language":"ar","admin_numbers":["50001234"],"templates":{},"events":{"order_paid":true,"admin_new_order":true,"order_shipped":true}}');
SET LOCAL ROLE service_role;
SELECT public.wa_activate_retention_constraints('10000000-0000-4000-8000-000000000002');
DO $migration$
DECLARE v_actor uuid := '10000000-0000-4000-8000-000000000002'; v_source jsonb; v_safe jsonb;
  v_proof jsonb; v_change jsonb; v_migration jsonb; v_config jsonb; v_draft jsonb;
BEGIN
  v_source := public.wa_read_legacy_migration_source(v_actor);
  v_safe := public.wa_read_settings(v_actor);
  IF v_safe::text LIKE '%fixture-key%' OR v_safe ? 'api_key' OR v_safe ? 'ciphertext' THEN
    RAISE EXCEPTION 'Safe settings exposed a credential';
  END IF;
  v_config := v_safe - ARRAY['settings_revision','credential_revision','provider','account_identity','cutover_version',
    'credential','readiness','scheduler_heartbeat_at','first_activated_at','legacy_fingerprint'];
  BEGIN
    PERFORM public.wa_read_settings('10000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Non-admin read protected settings';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    v_draft := jsonb_set(v_config,'{audiences,buyer,templates,ar}','"Arabic {{customer_name}}"');
    v_draft := jsonb_set(v_draft,'{audiences,buyer,templates,en}','"English {{customer_name}}"');
    v_draft := jsonb_set(jsonb_set(v_draft,'{audiences,buyer,language}','"en"'),'{audiences,admins,language}','"en"');
    v_safe := public.wa_save_settings(0,v_draft || jsonb_build_object('expected_legacy_fingerprint',v_source ->> 'legacy_fingerprint'),NULL,v_actor);
    IF v_safe -> 'audiences' -> 'buyer' -> 'templates' ->> 'ar' IS DISTINCT FROM 'Arabic {{customer_name}}'
       OR v_safe -> 'audiences' -> 'buyer' -> 'templates' ->> 'en' IS DISTINCT FROM 'English {{customer_name}}'
       OR v_safe -> 'audiences' -> 'buyer' ->> 'language' IS DISTINCT FROM 'en' THEN
      RAISE EXCEPTION 'Unmigrated save lost a language draft';
    END IF;
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='rollback_synthetic_unmigrated_save';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.wa_save_settings(0,v_config || '{"expected_legacy_fingerprint":"wrong"}',NULL,v_actor);
    RAISE EXCEPTION 'Stale legacy save succeeded';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.wa_save_settings(0,v_config || jsonb_build_object('automation_enabled',true,
      'expected_legacy_fingerprint',v_source ->> 'legacy_fingerprint'),NULL,v_actor);
    RAISE EXCEPTION 'Unmigrated automation enable was silently accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  v_change := jsonb_build_object('provider','postora','account_identity','postora:fixture-account',
    'purpose','provider_api','generation',0,'credential_revision',1,'key_version',1,
    'ciphertext',encode(convert_to('synthetic-ciphertext-with-tag','UTF8'),'base64'),
    'nonce',encode(convert_to('twelve-bytes','UTF8'),'base64'));
  PERFORM public.wa_store_credential(0,v_change,v_actor);
  v_proof := public.wa_record_provider_readiness(1,'postora','postora:fixture-account','postora:fixture-account',
    NULL,true,v_source ->> 'legacy_fingerprint',v_actor);
  v_migration := jsonb_build_object('credential',v_change,'readiness_proof',v_proof ->> 'readiness_proof',
    'expected_legacy_fingerprint',v_source ->> 'legacy_fingerprint');
  BEGIN
    PERFORM public.wa_migrate_postora_credential(1,v_migration || '{"readiness_proof":"invented"}',v_actor);
    RAISE EXCEPTION 'Invented migration proof succeeded';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  IF public.wa_read_legacy_migration_source(v_actor) ->> 'api_key' IS DISTINCT FROM 'fixture-key' THEN
    RAISE EXCEPTION 'Failed migration cleared the legacy key';
  END IF;
  EXECUTE 'RESET ROLE';
  CREATE TRIGGER wa_legacy_settings_write_guard AFTER INSERT OR UPDATE OR DELETE ON public.site_settings
    FOR EACH ROW EXECUTE FUNCTION private.wa_guard_legacy_settings();
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    PERFORM public.wa_migrate_postora_credential(1,v_migration,v_actor);
    RAISE EXCEPTION 'Mismatched guard definition was accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  IF public.wa_read_legacy_migration_source(v_actor) ->> 'api_key' IS DISTINCT FROM 'fixture-key'
     OR public.wa_read_settings(v_actor) ->> 'settings_revision' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Late migration failure did not roll back all authority changes';
  END IF;
  EXECUTE 'RESET ROLE';
  DROP TRIGGER wa_legacy_settings_write_guard ON public.site_settings;
  EXECUTE 'SET LOCAL ROLE service_role';
  v_safe := public.wa_migrate_postora_credential(1,v_migration,v_actor);
  IF v_safe ->> 'settings_revision' IS DISTINCT FROM '2' OR v_safe ->> 'automation_enabled' IS DISTINCT FROM 'false'
     OR v_safe ->> 'cutover_version' IS DISTINCT FROM '0' OR v_safe -> 'credential' ->> 'present' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Migration changed cutover or lost encrypted credential';
  END IF;
  BEGIN
    PERFORM public.wa_read_legacy_migration_source(v_actor);
    RAISE EXCEPTION 'Migrated source remained readable';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END
$migration$;
RESET ROLE;
DO $atomic$
BEGIN
  IF (SELECT value ->> 'api_key' FROM public.site_settings WHERE key='whatsapp_integration') IS DISTINCT FROM ''
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.site_settings'::regclass AND tgname='wa_legacy_settings_write_guard')
    OR NOT EXISTS (SELECT 1 FROM private.wa_release_state WHERE singleton AND state='migrated' AND compatibility_guard_armed) THEN
    RAISE EXCEPTION 'Atomic migration did not clear key and arm guard together';
  END IF;
END
$atomic$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
SELECT set_config('curemed.wa_legacy_mirror','on',true);
DO $stale_tab$
BEGIN
  BEGIN
    UPDATE public.site_settings SET value='{"api_key":"old-key","enabled":true,"admin_numbers":["50005678"]}' WHERE key='whatsapp_integration';
    RAISE EXCEPTION 'Stale browser restored old key or recipients';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.site_settings(key,value) VALUES ('fixture_wa_unrelated','{"ok":true}');
END
$stale_tab$;
RESET ROLE;
SELECT set_config('curemed.wa_legacy_mirror','',true);
SET LOCAL ROLE service_role;
DO $save$
DECLARE v_actor uuid := '10000000-0000-4000-8000-000000000002'; v_safe jsonb; v_config jsonb;
BEGIN
  v_safe := public.wa_read_settings(v_actor);
  v_config := v_safe - ARRAY['settings_revision','credential_revision','provider','account_identity','cutover_version',
    'credential','readiness','scheduler_heartbeat_at','first_activated_at','legacy_fingerprint'];
  v_config := jsonb_set(v_config,'{recipients}','{"admins":["50005678","+96550005678"],"custom":["50009999"]}');
  v_config := jsonb_set(v_config,'{audiences,buyer,language}','"en"');
  v_config := jsonb_set(v_config,'{audiences,buyer,templates,en}','"Buyer {{ customer_name }}"');
  v_config := jsonb_set(v_config,'{audiences,admins,templates,ar}','"Admin {{customer_phone}}"');
  v_safe := public.wa_save_settings(2,v_config,NULL,v_actor);
  IF v_safe ->> 'settings_revision' IS DISTINCT FROM '3' OR v_safe ->> 'credential_revision' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Template save rotated credential or lost revision';
  END IF;
  BEGIN
    PERFORM public.wa_save_settings(2,v_config,NULL,v_actor);
    RAISE EXCEPTION 'Stale canonical revision overwrote settings';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.wa_save_settings(3,v_config || '{"automation_enabled":true}',NULL,v_actor);
    RAISE EXCEPTION 'Automation enabled before provider activation';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END
$save$;
RESET ROLE;
DO $mirror$
DECLARE v_legacy jsonb;
BEGIN
  SELECT value INTO v_legacy FROM public.site_settings WHERE key='whatsapp_integration';
  IF v_legacy -> 'admin_numbers' IS DISTINCT FROM '["96550005678"]'::jsonb
     OR v_legacy -> 'templates' ->> 'order_paid_ar' IS DISTINCT FROM 'Buyer {{customer_name}}'
     OR v_legacy -> 'templates' ->> 'admin_new_order_en' IS DISTINCT FROM 'Admin {{customer_phone}}'
     OR v_legacy ->> 'api_key' IS DISTINCT FROM ''
     OR v_legacy -> 'events' ->> 'order_shipped' IS DISTINCT FROM 'true'
     OR coalesce(current_setting('curemed.wa_legacy_mirror',true),'') <> '' THEN
    RAISE EXCEPTION 'Mirror lost language/event/recipient/key isolation or leaked its bypass';
  END IF;
END
$mirror$;
SET LOCAL ROLE service_role;
DO $unsupported_projection$
DECLARE v_safe jsonb; v_config jsonb;
BEGIN
  v_safe := public.wa_read_settings('10000000-0000-4000-8000-000000000002');
  v_config := v_safe - ARRAY['settings_revision','credential_revision','provider','account_identity','cutover_version',
    'credential','readiness','scheduler_heartbeat_at','first_activated_at','legacy_fingerprint'];
  v_config := jsonb_set(v_config,'{audiences,buyer,templates,en}','"Items {{items_summary}}"');
  v_safe := public.wa_save_settings(3,v_config,NULL,'10000000-0000-4000-8000-000000000002');
  IF v_safe ->> 'integration_enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Unsupported baseline projection disabled canonical integration';
  END IF;
END
$unsupported_projection$;
RESET ROLE;
DO $projection_disabled$
BEGIN
  IF (SELECT value ->> 'enabled' FROM public.site_settings WHERE key='whatsapp_integration') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Unsafe baseline rollback projection remained enabled';
  END IF;
END
$projection_disabled$;
ROLLBACK;
SELECT 'Atomic migration, stale-tab guard, canonical save and nonsecret mirror proofs passed';

-- An installation with no Postora credential can still migrate and later choose Evolution.
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('10000000-0000-4000-8000-000000000002','fixture-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES ('10000000-0000-4000-8000-000000000002','admin');
INSERT INTO public.site_settings(key,value) VALUES ('whatsapp_integration','{"api_key":"","enabled":true}');
SET LOCAL ROLE service_role;
SELECT public.wa_activate_retention_constraints('10000000-0000-4000-8000-000000000002');
DO $unconfigured$
DECLARE v_actor uuid := '10000000-0000-4000-8000-000000000002'; v_source jsonb; v_safe jsonb; v_change jsonb;
BEGIN
  v_source := public.wa_read_legacy_migration_source(v_actor);
  v_change := jsonb_build_object('mode','unconfigured','baseline_fallback_empty',true,
    'expected_legacy_fingerprint',v_source ->> 'legacy_fingerprint');
  v_safe := public.wa_migrate_postora_credential(0,v_change,v_actor);
  IF v_safe ->> 'integration_enabled' IS DISTINCT FROM 'false' OR v_safe -> 'credential' ->> 'present' IS DISTINCT FROM 'false'
     OR v_safe ->> 'account_identity' IS NOT NULL OR v_safe ->> 'cutover_version' IS DISTINCT FROM '0' THEN
    RAISE EXCEPTION 'Empty installation invented a provider account or enabled sending';
  END IF;
END
$unconfigured$;
RESET ROLE;
ROLLBACK;

-- Explicitly disabled legacy settings preserve an undiagnosed key without inventing an account.
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('10000000-0000-4000-8000-000000000002','fixture-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES ('10000000-0000-4000-8000-000000000002','admin');
INSERT INTO public.site_settings(key,value) VALUES ('whatsapp_integration','{"api_key":"fixture-key","enabled":false}');
SET LOCAL ROLE service_role;
SELECT public.wa_activate_retention_constraints('10000000-0000-4000-8000-000000000002');
DO $disabled$
DECLARE v_actor uuid := '10000000-0000-4000-8000-000000000002'; v_source jsonb; v_safe jsonb;
  v_credential jsonb; v_change jsonb;
BEGIN
  v_source := public.wa_read_legacy_migration_source(v_actor);
  v_credential := jsonb_build_object('provider','postora','account_identity','postora:legacy-unverified',
    'purpose','provider_api','generation',0,'credential_revision',1,'key_version',1,
    'ciphertext',encode(convert_to('synthetic-ciphertext-with-tag','UTF8'),'base64'),
    'nonce',encode(convert_to('twelve-bytes','UTF8'),'base64'));
  PERFORM public.wa_store_credential(0,v_credential,v_actor);
  v_change := jsonb_build_object('mode','disabled','credential',v_credential,'fallback_verified',false,
    'expected_legacy_fingerprint',v_source ->> 'legacy_fingerprint');
  BEGIN
    PERFORM public.wa_migrate_postora_credential(1,v_change,v_actor);
    RAISE EXCEPTION 'Disabled migration lost fallback verification';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  v_safe := public.wa_migrate_postora_credential(1,v_change || '{"fallback_verified":true}',v_actor);
  IF v_safe ->> 'integration_enabled' IS DISTINCT FROM 'false' OR v_safe -> 'credential' ->> 'present' IS DISTINCT FROM 'true'
     OR v_safe ->> 'account_identity' IS NOT NULL OR v_safe ->> 'readiness' IS DISTINCT FROM 'unverified' THEN
    RAISE EXCEPTION 'Disabled migration lost encrypted key or invented readiness';
  END IF;
END
$disabled$;
RESET ROLE;
ROLLBACK;
SELECT 'Unconfigured and explicitly disabled migration paths passed';
