-- Additive settings/credential foundation only. Existing orders, payment writers,
-- site settings and router behavior are untouched. Enabling remains refused until
-- the separately reviewed shipment/runtime contracts have been installed.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.shipa_exact_keys(p_value jsonb, p_keys text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT jsonb_typeof(p_value)='object'
    AND p_value ?& p_keys AND (p_value - p_keys)='{}'::jsonb
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_default_environment()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('appId',NULL,'serviceCode',NULL,'autoConfirm',false,
    'pickupInstructions','','origin',jsonb_build_object('contactName','','contactPhone','',
      'address',jsonb_build_object('countryCode','KW','governorate','','area','','block','',
        'street','','building','','addressLine','')),
    'parcel',jsonb_build_object('count',1,'weightKg',NULL,'dimensionsCm',NULL))
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_validate_environment(p_config jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE v_origin jsonb; v_address jsonb; v_parcel jsonb; v_dimensions jsonb; v_field text;
BEGIN
  IF NOT coalesce(private.shipa_exact_keys(p_config,
    ARRAY['appId','serviceCode','autoConfirm','pickupInstructions','origin','parcel']),false)
    OR octet_length(p_config::text)>16384 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_config';
  END IF;
  IF jsonb_typeof(p_config->'appId') NOT IN ('null','string')
    OR length(coalesce(p_config->>'appId',''))>256
    OR (p_config->'serviceCode'<>'null'::jsonb AND
        coalesce(p_config->>'serviceCode','') NOT IN ('On Demand','Same Day','Next Day'))
    OR jsonb_typeof(p_config->'autoConfirm') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_config->'pickupInstructions') IS DISTINCT FROM 'string'
    OR length(p_config->>'pickupInstructions')>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_config';
  END IF;
  v_origin:=p_config->'origin'; v_address:=v_origin->'address'; v_parcel:=p_config->'parcel';
  IF NOT coalesce(private.shipa_exact_keys(v_origin,ARRAY['contactName','contactPhone','address']),false)
    OR NOT coalesce(private.shipa_exact_keys(v_address,
      ARRAY['countryCode','governorate','area','block','street','building','addressLine']),false)
    OR v_address->>'countryCode' IS DISTINCT FROM 'KW' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_origin';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['contactName','contactPhone'] LOOP
    IF jsonb_typeof(v_origin->v_field) IS DISTINCT FROM 'string'
      OR length(v_origin->>v_field)>150 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_origin';
    END IF;
  END LOOP;
  IF v_origin->>'contactPhone'<>'' AND
    (length(v_origin->>'contactPhone')<>12 OR v_origin->>'contactPhone' !~ '^\+965[0-9]{8}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_origin';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['governorate','area','block','street','building','addressLine'] LOOP
    IF jsonb_typeof(v_address->v_field) IS DISTINCT FROM 'string'
      OR length(v_address->>v_field)>1000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_origin';
    END IF;
  END LOOP;
  IF NOT coalesce(private.shipa_exact_keys(v_parcel,ARRAY['count','weightKg','dimensionsCm']),false)
    OR v_parcel->'count' IS DISTINCT FROM '1'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_parcel';
  END IF;
  IF v_parcel->'weightKg'<>'null'::jsonb THEN
    IF jsonb_typeof(v_parcel->'weightKg') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_parcel';
    END IF;
    IF (v_parcel->>'weightKg')::numeric<=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_parcel';
    END IF;
  END IF;
  v_dimensions:=v_parcel->'dimensionsCm';
  IF v_dimensions<>'null'::jsonb THEN
    IF NOT coalesce(private.shipa_exact_keys(v_dimensions,ARRAY['lengthCm','widthCm','heightCm']),false) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_parcel';
    END IF;
    FOREACH v_field IN ARRAY ARRAY['lengthCm','widthCm','heightCm'] LOOP
      IF jsonb_typeof(v_dimensions->v_field) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_parcel';
      END IF;
      IF (v_dimensions->>v_field)::numeric<=0 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_parcel';
      END IF;
    END LOOP;
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_valid_configuration(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
BEGIN
  IF NOT coalesce(private.shipa_exact_keys(p_config,ARRAY['sandbox','live']),false) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_config';
  END IF;
  PERFORM private.shipa_validate_environment(p_config->'sandbox');
  PERFORM private.shipa_validate_environment(p_config->'live');
  RETURN true;
END
$fn$;

CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE CHECK(provider='shipa'),
  enabled boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox' CHECK(environment IN ('sandbox','live')),
  dispatch_mode text NOT NULL DEFAULT 'manual_after_packing'
    CHECK(dispatch_mode IN ('manual_after_packing','automatic_after_payment')),
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  configuration jsonb NOT NULL DEFAULT jsonb_build_object(
    'sandbox',private.shipa_default_environment(),'live',private.shipa_default_environment())
    CHECK(private.shipa_valid_configuration(configuration)),
  verification jsonb NOT NULL DEFAULT '{"sandbox":null,"live":null}'::jsonb,
  worker_last_ok_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integrations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.integrations TO authenticated;
DROP POLICY IF EXISTS shipa_admin_read ON public.integrations;
CREATE POLICY shipa_admin_read ON public.integrations FOR SELECT TO authenticated
  USING(public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS private.integration_credentials (
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK(environment IN ('sandbox','live')),
  provider text NOT NULL CHECK(provider='shipa'),
  key_version integer NOT NULL CHECK(key_version>0),
  nonce text NOT NULL CHECK(length(nonce)=16),
  ciphertext text NOT NULL CHECK(length(ciphertext) BETWEEN 24 AND 21868),
  revision integer NOT NULL CHECK(revision>0),
  rotated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  PRIMARY KEY(integration_id,environment)
);
ALTER TABLE private.integration_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.integration_credentials FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO public.integrations(provider) VALUES('shipa') ON CONFLICT(provider) DO NOTHING;

CREATE OR REPLACE FUNCTION private.shipa_require_admin(p_actor uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='shipa_admin_required';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_read_settings(_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_row public.integrations; v_config jsonb; v_credentials jsonb; v_env text; v_credential private.integration_credentials;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  SELECT * INTO STRICT v_row FROM public.integrations WHERE provider='shipa';
  v_config:=v_row.configuration;
  FOREACH v_env IN ARRAY ARRAY['sandbox','live'] LOOP
    SELECT * INTO v_credential FROM private.integration_credentials
      WHERE integration_id=v_row.id AND environment=v_env;
    v_credentials:=jsonb_build_object('present',v_credential.integration_id IS NOT NULL,
      'rotatedAt',v_credential.rotated_at,'keyVersion',v_credential.key_version);
    v_config:=jsonb_set(v_config,ARRAY[v_env,'credential'],v_credentials);
  END LOOP;
  RETURN jsonb_build_object('integration_id',v_row.id,'settings',v_config||jsonb_build_object(
    'enabled',v_row.enabled,'environment',v_row.environment,'dispatchMode',v_row.dispatch_mode,'revision',v_row.revision),
    'worker_last_ok_at',v_row.worker_last_ok_at,'verification',v_row.verification);
END
$fn$;

-- Ciphertext only, service-only: workers can read without impersonating an admin.
CREATE OR REPLACE FUNCTION public.shipa_read_credential(_integration_id uuid,_environment text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_row private.integration_credentials;
BEGIN
  IF _environment NOT IN ('sandbox','live') OR _environment IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_environment';
  END IF;
  SELECT * INTO v_row FROM private.integration_credentials
    WHERE integration_id=_integration_id AND environment=_environment;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('envelope',jsonb_build_object('integration_id',v_row.integration_id,
    'provider',v_row.provider,'environment',v_row.environment,'key_version',v_row.key_version,
    'nonce',v_row.nonce,'ciphertext',v_row.ciphertext),'credential_revision',v_row.revision,'rotated_at',v_row.rotated_at);
END
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_save_settings(_expected_revision integer,_settings jsonb,
  _credential_change jsonb,_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_row public.integrations; v_env text; v_tuple jsonb; v_nonce bytea; v_ciphertext bytea; v_mode text;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  IF _expected_revision IS NULL OR _expected_revision<0 OR NOT coalesce(private.shipa_exact_keys(_settings,
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
  -- No runtime activation function is installed by this settings-only migration.
  IF _settings->'enabled'='true'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='shipa_runtime_not_ready';
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
  UPDATE public.integrations SET enabled=false,environment=_settings->>'environment',
    dispatch_mode=_settings->>'dispatchMode',revision=revision+1,
    configuration=jsonb_build_object('sandbox',_settings->'sandbox','live',_settings->'live'),
    verification='{"sandbox":null,"live":null}'::jsonb,updated_at=now(),updated_by=_actor_id WHERE id=v_row.id;
  RETURN public.shipa_read_settings(_actor_id);
END
$fn$;

REVOKE ALL ON FUNCTION private.shipa_exact_keys(jsonb,text[]),private.shipa_default_environment(),
  private.shipa_validate_environment(jsonb),private.shipa_valid_configuration(jsonb),private.shipa_require_admin(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.shipa_read_settings(uuid),public.shipa_read_credential(uuid,text),
  public.shipa_save_settings(integer,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shipa_read_settings(uuid),public.shipa_read_credential(uuid,text),
  public.shipa_save_settings(integer,jsonb,jsonb,uuid) TO service_role;
