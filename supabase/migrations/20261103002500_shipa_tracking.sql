-- Normalized tracking for already accepted bookings. No booking, retry,
-- payment/order-status mutation or unknown-result resolution is authorized.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,25);

CREATE OR REPLACE FUNCTION private.shipa_tracking_text(p_value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT coalesce(p_value='null'::jsonb OR (jsonb_typeof(p_value)='string'
    AND length(p_value#>>'{}') BETWEEN 1 AND 120 AND (p_value#>>'{}') !~ '[[:cntrl:]]'),false)
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_tracking_number(p_value jsonb,p_integer boolean DEFAULT false)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT CASE WHEN jsonb_typeof(p_value)='number' THEN
    (p_value::text)::numeric BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308
    AND (NOT p_integer OR trunc((p_value::text)::numeric)=(p_value::text)::numeric) ELSE false END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_validate_tracking_observation(p_observation jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE entry jsonb; tracking jsonb; measure jsonb;
BEGIN
  IF NOT coalesce(private.shipa_exact_keys(p_observation,ARRAY['shipaRef','customerRef','status','story','tracking']),false)
    OR octet_length(p_observation::text)>524288
    OR jsonb_typeof(p_observation->'shipaRef') IS DISTINCT FROM 'string'
    OR length(p_observation->>'shipaRef') NOT BETWEEN 1 AND 200
    OR p_observation->>'shipaRef' ~ '[^A-Za-z0-9._~-]' OR p_observation->>'shipaRef' IN ('.','..')
    OR jsonb_typeof(p_observation->'customerRef') IS DISTINCT FROM 'string'
    OR length(p_observation->>'customerRef') NOT BETWEEN 1 AND 64
    OR p_observation->>'customerRef' ~ '[^A-Za-z0-9._~-]' OR p_observation->>'customerRef' IN ('.','..')
    OR NOT private.shipa_tracking_text(p_observation->'status')
    OR jsonb_typeof(p_observation->'story') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_tracking_observation';
  END IF;
  IF jsonb_array_length(p_observation->'story')>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_tracking_observation';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_observation->'story') LOOP
    IF NOT coalesce(private.shipa_exact_keys(entry,ARRAY['status','statusCode','date']),false)
      OR NOT private.shipa_tracking_text(entry->'status') OR NOT private.shipa_tracking_text(entry->'statusCode')
      OR (entry->'date'<>'null'::jsonb AND NOT private.shipa_tracking_number(entry->'date')) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_tracking_observation';
    END IF;
  END LOOP;
  tracking:=p_observation->'tracking';
  IF tracking='{"available":false}'::jsonb THEN RETURN; END IF;
  IF NOT coalesce(private.shipa_exact_keys(tracking,ARRAY['available','location','eta','duration','distance']),false)
    OR tracking->'available' IS DISTINCT FROM 'true'::jsonb
    OR NOT coalesce(private.shipa_exact_keys(tracking->'location',ARRAY['latitude','longitude']),false)
    OR NOT private.shipa_tracking_number(tracking#>'{location,latitude}')
    OR NOT private.shipa_tracking_number(tracking#>'{location,longitude}') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_tracking_observation';
  END IF;
  IF (tracking#>>'{location,latitude}')::numeric NOT BETWEEN -90 AND 90
    OR (tracking#>>'{location,longitude}')::numeric NOT BETWEEN -180 AND 180
    OR NOT (private.shipa_tracking_text(tracking->'eta') OR private.shipa_tracking_number(tracking->'eta')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_tracking_observation';
  END IF;
  FOREACH measure IN ARRAY ARRAY[tracking->'duration',tracking->'distance'] LOOP
    IF measure='null'::jsonb THEN CONTINUE; END IF;
    IF NOT coalesce(private.shipa_exact_keys(measure,ARRAY['text','value']),false)
      OR NOT private.shipa_tracking_text(measure->'text')
      OR (measure->'value'<>'null'::jsonb AND NOT private.shipa_tracking_number(measure->'value',true)) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_tracking_observation';
    END IF;
  END LOOP;
END
$fn$;

CREATE TABLE IF NOT EXISTS private.shipa_tracking_snapshots (
  shipment_id uuid PRIMARY KEY REFERENCES public.shipments(id) ON DELETE RESTRICT,
  provider_status text CHECK(length(provider_status) BETWEEN 1 AND 120 AND provider_status !~ '[[:cntrl:]]'),
  story jsonb NOT NULL CHECK(jsonb_typeof(story)='array' AND jsonb_array_length(story)<=2000),
  tracking jsonb NOT NULL CHECK(jsonb_typeof(tracking)='object'),
  checked_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL
);
ALTER TABLE private.shipa_tracking_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.shipa_tracking_snapshots FROM PUBLIC,anon,authenticated,service_role;

-- INTERNAL context: never return token/key-binding metadata to the browser.
-- Unlike shipa_read_shipment, this created-booking lookup does not expire leases.
CREATE OR REPLACE FUNCTION public.shipa_read_tracking_context(_shipment_id uuid,_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE shipment public.shipments; credential private.integration_credentials;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  IF _shipment_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_shipment_required'; END IF;
  SELECT s.* INTO shipment FROM public.shipments s JOIN public.integrations i ON i.id=s.integration_id
    WHERE s.id=_shipment_id AND s.provider='shipa' AND i.provider='shipa';
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF shipment.state<>'created' OR shipment.shipa_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_tracking_requires_created';
  END IF;
  SELECT * INTO credential FROM private.integration_credentials
    WHERE integration_id=shipment.integration_id AND environment=shipment.environment;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_tracking_credential_missing'; END IF;
  RETURN private.shipa_dispatch_binding(shipment)||jsonb_build_object('customer_ref',shipment.customer_ref,
    'shipa_ref',shipment.shipa_ref,'attempt_token',shipment.attempt_token,'updated_at',shipment.updated_at,
    'credential_revision',credential.revision,'credential_fingerprint',private.shipa_credential_fingerprint(credential));
END
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_read_tracking_snapshot(_shipment_id uuid,_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE snapshot private.shipa_tracking_snapshots;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  IF _shipment_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_shipment_required'; END IF;
  SELECT * INTO snapshot FROM private.shipa_tracking_snapshots WHERE shipment_id=_shipment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('shipment_id',snapshot.shipment_id,'provider_status',snapshot.provider_status,
    'story',snapshot.story,'tracking',snapshot.tracking,'checked_at',snapshot.checked_at);
END
$fn$;

-- The handler authenticates first, loads the key, fetches through the fixed
-- provider adapter OUTSIDE SQL, then submits only its normalized observation.
-- Timestamp/token/current-key fences refuse out-of-order or rotated-key results.
CREATE OR REPLACE FUNCTION public.shipa_record_tracking_observation(_shipment_id uuid,_attempt_token uuid,
  _expected_updated_at timestamptz,_credential_fingerprint text,_observation jsonb,_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE integration public.integrations; shipment public.shipments; credential private.integration_credentials; observed_at timestamptz;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  PERFORM private.shipa_validate_tracking_observation(_observation);
  IF _shipment_id IS NULL OR _attempt_token IS NULL OR _expected_updated_at IS NULL
    OR _credential_fingerprint IS NULL OR _credential_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_tracking_binding';
  END IF;
  SELECT i.* INTO integration FROM public.integrations i JOIN public.shipments s ON s.integration_id=i.id
    WHERE s.id=_shipment_id AND s.provider='shipa' AND i.provider='shipa' FOR SHARE OF i;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='shipa_shipment_missing'; END IF;
  SELECT * INTO shipment FROM public.shipments WHERE id=_shipment_id FOR UPDATE;
  IF shipment.state<>'created' OR shipment.shipa_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_tracking_requires_created';
  END IF;
  IF shipment.attempt_token IS DISTINCT FROM _attempt_token OR shipment.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_tracking_changed';
  END IF;
  SELECT * INTO credential FROM private.integration_credentials
    WHERE integration_id=integration.id AND environment=shipment.environment FOR SHARE;
  IF credential.integration_id IS NULL OR private.shipa_credential_fingerprint(credential) IS DISTINCT FROM _credential_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_tracking_key_changed';
  END IF;
  IF _observation->>'shipaRef' IS DISTINCT FROM shipment.shipa_ref
    OR _observation->>'customerRef' IS DISTINCT FROM shipment.customer_ref THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_tracking_reference_mismatch';
  END IF;
  observed_at:=clock_timestamp();
  INSERT INTO private.shipa_tracking_snapshots(shipment_id,provider_status,story,tracking,checked_at,recorded_by)
    VALUES(shipment.id,_observation->>'status',_observation->'story',_observation->'tracking',observed_at,_actor_id)
    ON CONFLICT(shipment_id) DO UPDATE SET provider_status=excluded.provider_status,story=excluded.story,
      tracking=excluded.tracking,checked_at=excluded.checked_at,recorded_by=excluded.recorded_by;
  UPDATE public.shipments SET provider_status=coalesce(_observation->>'status',provider_status),updated_at=observed_at WHERE id=shipment.id;
  RETURN public.shipa_read_tracking_snapshot(shipment.id,_actor_id);
END
$fn$;

REVOKE ALL ON FUNCTION private.shipa_tracking_text(jsonb),private.shipa_tracking_number(jsonb,boolean),
  private.shipa_validate_tracking_observation(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.shipa_read_tracking_context(uuid,uuid),public.shipa_read_tracking_snapshot(uuid,uuid),
  public.shipa_record_tracking_observation(uuid,uuid,timestamptz,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.shipa_read_tracking_context(uuid,uuid),public.shipa_read_tracking_snapshot(uuid,uuid),
  public.shipa_record_tracking_observation(uuid,uuid,timestamptz,text,jsonb,uuid) TO service_role;
COMMIT;
