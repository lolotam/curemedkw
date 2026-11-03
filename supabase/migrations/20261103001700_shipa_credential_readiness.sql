-- New-feature storage protection and server-attested diagnostics only.
-- Enabling still fails closed; no provider request or scheduler is installed.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,17);
DO $storage_writer$
DECLARE internal regprocedure:=to_regprocedure('private.shipa_save_settings_storage(integer,jsonb,jsonb,uuid)');
BEGIN
  IF internal IS NULL THEN
    IF to_regprocedure('private.shipa_save_settings(integer,jsonb,jsonb,uuid)') IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_storage_name_collision';
    END IF;
    ALTER FUNCTION public.shipa_save_settings(integer,jsonb,jsonb,uuid) SET SCHEMA private;
    ALTER FUNCTION private.shipa_save_settings(integer,jsonb,jsonb,uuid) RENAME TO shipa_save_settings_storage;
  ELSIF obj_description(internal,'pg_proc') IS DISTINCT FROM 'curemed_shipa_storage_v1' THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_storage_name_collision';
  END IF;
END
$storage_writer$;
COMMENT ON FUNCTION private.shipa_save_settings_storage(integer,jsonb,jsonb,uuid) IS 'curemed_shipa_storage_v1';
REVOKE ALL ON FUNCTION private.shipa_save_settings_storage(integer,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.shipa_require_credential_idle(p_integration_id uuid,p_environment text)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  IF EXISTS(SELECT 1 FROM public.shipments shipment WHERE integration_id=p_integration_id AND environment=p_environment
    AND state<>'created' AND private.shipa_has_possible_dispatch(shipment)) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_credential_in_use';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_save_settings(_expected_revision integer,_settings jsonb,_credential_change jsonb,_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE integration public.integrations;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  SELECT * INTO STRICT integration FROM public.integrations WHERE provider='shipa' FOR UPDATE;
  IF integration.revision IS DISTINCT FROM _expected_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='settings_conflict';
  END IF;
  IF _credential_change IS NOT NULL AND _credential_change->>'environment' IN ('sandbox','live') THEN
    PERFORM private.shipa_require_credential_idle(integration.id,_credential_change->>'environment');
  END IF;
  RETURN private.shipa_save_settings_storage(_expected_revision,_settings,_credential_change,_actor_id);
END
$fn$;

CREATE TABLE IF NOT EXISTS private.shipa_scheduler_runs (
  run_id uuid PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK(environment IN ('sandbox','live')),
  credential_fingerprint text NOT NULL CHECK(credential_fingerprint ~ '^[a-f0-9]{64}$'),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS private.shipa_provider_observations (
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK(environment IN ('sandbox','live')),
  settings_revision integer NOT NULL CHECK(settings_revision>=0),
  credential_fingerprint text NOT NULL CHECK(credential_fingerprint ~ '^[a-f0-9]{64}$'),
  probe_ok boolean NOT NULL,
  origin_city_matched boolean NOT NULL,
  cities jsonb NOT NULL CHECK(jsonb_typeof(cities)='array'),
  safe_code text,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
  observed_by uuid NOT NULL,
  PRIMARY KEY(integration_id,environment)
);
ALTER TABLE private.shipa_scheduler_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.shipa_provider_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.shipa_scheduler_runs,private.shipa_provider_observations FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.shipa_record_scheduler_ok(_run_id uuid,_environment text,_credential_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE integration public.integrations; credential private.integration_credentials; receipt private.shipa_scheduler_runs;
  inserted boolean:=true;
BEGIN
  IF _run_id IS NULL OR _environment IS NULL OR _environment NOT IN ('sandbox','live')
    OR _credential_fingerprint IS NULL OR _credential_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_scheduler_receipt';
  END IF;
  SELECT * INTO STRICT integration FROM public.integrations WHERE provider='shipa' FOR UPDATE;
  SELECT * INTO credential FROM private.integration_credentials WHERE integration_id=integration.id AND environment=_environment FOR SHARE;
  IF NOT FOUND OR integration.environment<>_environment
    OR private.shipa_credential_fingerprint(credential) IS DISTINCT FROM _credential_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_scheduler_binding_changed';
  END IF;
  INSERT INTO private.shipa_scheduler_runs(run_id,integration_id,environment,credential_fingerprint)
    VALUES(_run_id,integration.id,_environment,_credential_fingerprint) ON CONFLICT DO NOTHING RETURNING * INTO receipt;
  IF NOT FOUND THEN
    inserted:=false;
    SELECT * INTO receipt FROM private.shipa_scheduler_runs WHERE run_id=_run_id;
    IF receipt.integration_id IS DISTINCT FROM integration.id OR receipt.environment IS DISTINCT FROM _environment
      OR receipt.credential_fingerprint IS DISTINCT FROM _credential_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_scheduler_run_conflict';
    END IF;
  ELSE
    UPDATE public.integrations SET worker_last_ok_at=greatest(worker_last_ok_at,receipt.completed_at) WHERE id=integration.id;
  END IF;
  RETURN jsonb_build_object('run_id',receipt.run_id,'recorded',inserted,'last_ok_at',receipt.completed_at);
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_validate_observation(p_observation jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE city jsonb; normalized jsonb;
BEGIN
  IF NOT coalesce(private.shipa_exact_keys(p_observation,ARRAY['credentialFingerprint','countryCode','cities','code','verified']),false)
    OR octet_length(p_observation::text)>1048576 OR jsonb_typeof(p_observation->'credentialFingerprint') IS DISTINCT FROM 'string'
    OR p_observation->>'credentialFingerprint' !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_observation->'verified') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_observation->'cities') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_observation';
  END IF;
  IF p_observation->'verified'='true'::jsonb THEN
    IF p_observation->>'countryCode' IS DISTINCT FROM 'KWT' OR p_observation->'code'<>'null'::jsonb
      OR jsonb_array_length(p_observation->'cities') NOT BETWEEN 1 AND 5000 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_observation';
    END IF;
    FOR city IN SELECT * FROM jsonb_array_elements(p_observation->'cities') LOOP
      IF jsonb_typeof(city) IS DISTINCT FROM 'string' OR length(btrim(city#>>'{}')) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_observation';
      END IF;
    END LOOP;
  ELSIF p_observation->'countryCode'<>'null'::jsonb OR p_observation->'cities'<>'[]'::jsonb
    OR jsonb_typeof(p_observation->'code') IS DISTINCT FROM 'string'
    OR p_observation->>'code' NOT IN ('timeout','network_error','redirect_refused','not_found','unauthorized','forbidden',
      'rate_limited','server_error','unexpected_status','malformed_response','invalid_response','response_too_large') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_observation';
  END IF;
  SELECT coalesce(jsonb_agg(name ORDER BY name),'[]') INTO normalized
    FROM (SELECT DISTINCT btrim(value#>>'{}') name FROM jsonb_array_elements(p_observation->'cities')) directory;
  RETURN jsonb_set(p_observation,'{cities}',normalized);
END
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_record_provider_observation(_expected_revision integer,_environment text,
  _observation jsonb,_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE integration public.integrations; credential private.integration_credentials; observation jsonb; city_match boolean;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  IF _environment IS NULL OR _environment NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_environment';
  END IF;
  observation:=private.shipa_validate_observation(_observation);
  SELECT * INTO STRICT integration FROM public.integrations WHERE provider='shipa' FOR UPDATE;
  IF integration.revision IS DISTINCT FROM _expected_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='settings_conflict';
  END IF;
  SELECT * INTO credential FROM private.integration_credentials WHERE integration_id=integration.id AND environment=_environment FOR SHARE;
  IF NOT FOUND OR private.shipa_credential_fingerprint(credential) IS DISTINCT FROM observation->>'credentialFingerprint' THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_observation_binding_changed';
  END IF;
  city_match:=(observation->>'verified')::boolean AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(observation->'cities') city
    WHERE lower(city)=lower(btrim(integration.configuration#>>ARRAY[_environment,'origin','address','area'])));
  INSERT INTO private.shipa_provider_observations(integration_id,environment,settings_revision,credential_fingerprint,probe_ok,
    origin_city_matched,cities,safe_code,observed_by)
    VALUES(integration.id,_environment,integration.revision,observation->>'credentialFingerprint',(observation->>'verified')::boolean,
      city_match,observation->'cities',observation->>'code',_actor_id)
    ON CONFLICT(integration_id,environment) DO UPDATE SET settings_revision=excluded.settings_revision,
      credential_fingerprint=excluded.credential_fingerprint,probe_ok=excluded.probe_ok,origin_city_matched=excluded.origin_city_matched,
      cities=excluded.cities,safe_code=excluded.safe_code,observed_at=clock_timestamp(),expires_at=clock_timestamp()+interval '5 minutes',
      observed_by=excluded.observed_by;
  RETURN jsonb_build_object('recorded',true,'origin_city_matched',city_match,'remote_probe_ok',observation->'verified');
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_warehouse_ready(p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
  SELECT cardinality(private.shipa_delivery_issues(jsonb_build_object('destination',(p_config#>'{origin,address}')||
    jsonb_build_object('contactName',p_config#>'{origin,contactName}',
      'contactPhone',private.shipa_kuwait_phone(p_config#>>'{origin,contactPhone}'),'city',p_config#>'{origin,address,area}'),
    'parcel',p_config->'parcel'),p_config))=0
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_environment_readiness(p_integration public.integrations,p_environment text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE observation private.shipa_provider_observations; credential private.integration_credentials; current_probe boolean;
BEGIN
  SELECT * INTO credential FROM private.integration_credentials WHERE integration_id=p_integration.id AND environment=p_environment;
  SELECT * INTO observation FROM private.shipa_provider_observations WHERE integration_id=p_integration.id AND environment=p_environment;
  current_probe:=observation.integration_id IS NOT NULL AND observation.settings_revision=p_integration.revision
    AND credential.integration_id IS NOT NULL AND observation.expires_at>now()
    AND observation.credential_fingerprint=private.shipa_credential_fingerprint(credential);
  RETURN jsonb_build_object('credential_present',credential.integration_id IS NOT NULL,
    'configuration_ready',private.shipa_warehouse_ready(p_integration.configuration->p_environment),'probe_current',current_probe,
    'credentials_verified',current_probe AND observation.probe_ok,'origin_city_matched',current_probe AND observation.origin_city_matched,
    'last_checked_at',observation.observed_at,'safe_code',CASE WHEN current_probe THEN observation.safe_code
      WHEN credential.integration_id IS NULL THEN 'credential_missing' WHEN observation.integration_id IS NULL THEN 'not_verified'
      ELSE 'verification_stale' END,'service_entitlement','unconfirmed');
END
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_read_readiness(_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE integration public.integrations; credential private.integration_credentials; current_scheduler boolean;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  SELECT * INTO STRICT integration FROM public.integrations WHERE provider='shipa';
  SELECT * INTO credential FROM private.integration_credentials WHERE integration_id=integration.id AND environment=integration.environment;
  current_scheduler:=integration.worker_last_ok_at>=now()-interval '3 minutes' AND EXISTS(
    SELECT 1 FROM private.shipa_scheduler_runs WHERE integration_id=integration.id AND environment=integration.environment
      AND completed_at=integration.worker_last_ok_at AND credential_fingerprint=private.shipa_credential_fingerprint(credential));
  RETURN jsonb_build_object('settings_revision',integration.revision,'active_environment',integration.environment,
    'environments',jsonb_build_object('sandbox',private.shipa_environment_readiness(integration,'sandbox'),
      'live',private.shipa_environment_readiness(integration,'live')),
    'scheduler',jsonb_build_object('last_ok_at',integration.worker_last_ok_at,'current',coalesce(current_scheduler,false)));
END
$fn$;

REVOKE ALL ON FUNCTION public.shipa_save_settings(integer,jsonb,jsonb,uuid),public.shipa_record_scheduler_ok(uuid,text,text),
  public.shipa_record_provider_observation(integer,text,jsonb,uuid),public.shipa_read_readiness(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shipa_save_settings(integer,jsonb,jsonb,uuid),public.shipa_record_scheduler_ok(uuid,text,text),
  public.shipa_record_provider_observation(integer,text,jsonb,uuid),public.shipa_read_readiness(uuid) TO service_role;
REVOKE ALL ON FUNCTION private.shipa_require_credential_idle(uuid,text),private.shipa_validate_observation(jsonb),
  private.shipa_warehouse_ready(jsonb),private.shipa_environment_readiness(public.integrations,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
