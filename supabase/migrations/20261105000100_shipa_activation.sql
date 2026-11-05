-- Activation consumes saved, server-attested readiness. No live provider calls.
BEGIN;
SELECT pg_advisory_xact_lock(20261105,1);

CREATE OR REPLACE FUNCTION private.shipa_require_activation(p_integration public.integrations,p_settings jsonb,p_credential_change jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE facts jsonb; credential private.integration_credentials;
BEGIN
  IF p_credential_change IS NOT NULL OR p_integration.environment IS DISTINCT FROM p_settings->>'environment'
    OR p_integration.configuration IS DISTINCT FROM jsonb_build_object('sandbox',p_settings->'sandbox','live',p_settings->'live') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_save_before_activation';
  END IF;
  facts:=private.shipa_environment_readiness(p_integration,p_integration.environment);
  IF NOT coalesce((facts->>'credential_present')::boolean,false) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_credential_missing'; END IF;
  IF NOT coalesce((facts->>'configuration_ready')::boolean,false) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_configuration_incomplete'; END IF;
  IF NOT coalesce((facts->>'probe_current')::boolean,false) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_verification_stale'; END IF;
  IF NOT coalesce((facts->>'credentials_verified')::boolean,false) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_verification_failed'; END IF;
  IF NOT coalesce((facts->>'origin_city_matched')::boolean,false) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_origin_city_unmatched'; END IF;
  SELECT * INTO credential FROM private.integration_credentials
    WHERE integration_id=p_integration.id AND environment=p_integration.environment;
  IF p_settings->>'dispatchMode'='automatic_after_payment' AND NOT EXISTS(
    SELECT 1 FROM private.shipa_scheduler_runs WHERE integration_id=p_integration.id
      AND environment=p_integration.environment AND completed_at<=clock_timestamp()
      AND completed_at>clock_timestamp()-interval '3 minutes'
      AND credential_fingerprint=private.shipa_credential_fingerprint(credential)) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_scheduler_stale'; END IF;
END
$fn$;
REVOKE ALL ON FUNCTION private.shipa_require_activation(public.integrations,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.shipa_save_settings_storage(_expected_revision integer,_settings jsonb,
  _credential_change jsonb,_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_row public.integrations; v_env text; v_tuple jsonb; v_nonce bytea; v_ciphertext bytea; v_mode text;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  IF _expected_revision IS NULL OR _expected_revision<0 OR NOT coalesce(private.shipa_exact_keys(_settings-'liveActivationConfirmed',
    ARRAY['enabled','environment','dispatchMode','sandbox','live']),false) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_settings';
  END IF;
  IF jsonb_typeof(_settings->'enabled') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(_settings->'environment') IS DISTINCT FROM 'string'
    OR jsonb_typeof(_settings->'dispatchMode') IS DISTINCT FROM 'string'
    OR _settings->>'environment' NOT IN ('sandbox','live')
    OR _settings->>'dispatchMode' NOT IN ('manual_after_packing','automatic_after_payment') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_settings';
  END IF;
  PERFORM private.shipa_validate_environment(_settings->'sandbox');
  PERFORM private.shipa_validate_environment(_settings->'live');
  SELECT * INTO STRICT v_row FROM public.integrations WHERE provider='shipa' FOR UPDATE;
  IF v_row.revision<>_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='settings_conflict';
  END IF;
  -- Confirmation guards the transition into live; later saves of an active live integration need none.
  IF _settings->'enabled'='true'::jsonb AND _settings->>'environment'='live'
    AND NOT (v_row.enabled AND v_row.environment='live')
    AND (_settings->'liveActivationConfirmed') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_live_confirmation_required';
  END IF;
  IF _settings->'enabled'='true'::jsonb THEN
    PERFORM private.shipa_require_activation(v_row,_settings,_credential_change);
  END IF;
  IF _credential_change IS NOT NULL THEN
    v_mode:=_credential_change->>'mode'; v_env:=_credential_change->>'environment';
    IF v_env IS NULL OR v_env NOT IN ('sandbox','live') OR v_mode IS NULL OR v_mode NOT IN ('replace','remove') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_credential_change';
    END IF;
    IF v_mode='replace' THEN
      IF NOT coalesce(private.shipa_exact_keys(_credential_change,ARRAY['mode','environment','envelope']),false) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_credential_change';
      END IF;
      v_tuple:=_credential_change->'envelope';
      IF NOT coalesce(private.shipa_exact_keys(v_tuple,
        ARRAY['integration_id','provider','environment','key_version','nonce','ciphertext']),false)
        OR v_tuple->>'integration_id' IS DISTINCT FROM v_row.id::text
        OR v_tuple->>'provider' IS DISTINCT FROM 'shipa'
        OR v_tuple->>'environment' IS DISTINCT FROM v_env
        OR jsonb_typeof(v_tuple->'key_version') IS DISTINCT FROM 'number'
        OR coalesce(v_tuple->>'key_version','') !~ '^[1-9][0-9]{0,8}$'
        OR jsonb_typeof(v_tuple->'nonce') IS DISTINCT FROM 'string'
        OR length(v_tuple->>'nonce')<>16
        OR jsonb_typeof(v_tuple->'ciphertext') IS DISTINCT FROM 'string'
        OR length(v_tuple->>'ciphertext') NOT BETWEEN 24 AND 21868 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_credential_envelope';
      END IF;
      BEGIN
        v_nonce:=decode(v_tuple->>'nonce','base64'); v_ciphertext:=decode(v_tuple->>'ciphertext','base64');
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_credential_envelope';
      END;
      IF octet_length(v_nonce)<>12 OR octet_length(v_ciphertext) NOT BETWEEN 17 AND 16400
        OR replace(encode(v_nonce,'base64'),E'\n','') IS DISTINCT FROM v_tuple->>'nonce'
        OR replace(encode(v_ciphertext,'base64'),E'\n','') IS DISTINCT FROM v_tuple->>'ciphertext' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_credential_envelope';
      END IF;
      INSERT INTO private.integration_credentials(integration_id,environment,provider,key_version,nonce,ciphertext,revision,updated_by)
        VALUES(v_row.id,v_env,'shipa',(v_tuple->>'key_version')::integer,v_tuple->>'nonce',v_tuple->>'ciphertext',1,_actor_id)
      ON CONFLICT(integration_id,environment) DO UPDATE SET key_version=excluded.key_version,
        nonce=excluded.nonce,ciphertext=excluded.ciphertext,revision=private.integration_credentials.revision+1,
        rotated_at=now(),updated_by=excluded.updated_by;
    ELSE
      IF NOT coalesce(private.shipa_exact_keys(_credential_change,ARRAY['mode','environment']),false) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_credential_change';
      END IF;
      DELETE FROM private.integration_credentials WHERE integration_id=v_row.id AND environment=v_env;
    END IF;
  END IF;
  UPDATE public.integrations SET enabled=(_settings->>'enabled')::boolean,environment=_settings->>'environment',
    dispatch_mode=_settings->>'dispatchMode',revision=revision+1,
    configuration=jsonb_build_object('sandbox',_settings->'sandbox','live',_settings->'live'),
    verification='{"sandbox":null,"live":null}'::jsonb,updated_at=now(),updated_by=_actor_id WHERE id=v_row.id;
  -- A pure activation changes no probe input; carry its binding to the new revision.
  IF _settings->'enabled'='true'::jsonb THEN
    UPDATE private.shipa_provider_observations SET settings_revision=v_row.revision+1
      WHERE integration_id=v_row.id AND settings_revision=v_row.revision;
  END IF;
  RETURN public.shipa_read_settings(_actor_id);
END
$fn$;

COMMENT ON FUNCTION private.shipa_save_settings_storage(integer,jsonb,jsonb,uuid) IS 'curemed_shipa_storage_v1';
REVOKE ALL ON FUNCTION private.shipa_save_settings_storage(integer,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Available while disabled so a scheduler can establish readiness before activation.
CREATE OR REPLACE FUNCTION public.shipa_worker_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
  SELECT jsonb_build_object('integration_id',i.id,'environment',i.environment,
    'credential_fingerprint',private.shipa_credential_fingerprint(c))
  FROM public.integrations i JOIN private.integration_credentials c ON c.integration_id=i.id AND c.environment=i.environment
  WHERE i.provider='shipa'
$fn$;
REVOKE ALL ON FUNCTION public.shipa_worker_context() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shipa_worker_context() TO service_role;
COMMIT;
