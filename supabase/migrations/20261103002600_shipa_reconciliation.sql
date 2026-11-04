-- Positive-only reconciliation of a possible booking. A miss, incomplete
-- detail, admin identity or local rejection NEVER grants re-creation authority.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,26);

CREATE TABLE IF NOT EXISTS private.shipa_reconciliation_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE RESTRICT,
  attempt_token uuid NOT NULL,
  provider_ref text NOT NULL CHECK(length(provider_ref) BETWEEN 1 AND 200
    AND provider_ref !~ '[^A-Za-z0-9._~-]' AND provider_ref NOT IN ('.','..')),
  credential_fingerprint text NOT NULL CHECK(credential_fingerprint ~ '^[a-f0-9]{64}$'),
  payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
  detail_hash text NOT NULL CHECK(detail_hash ~ '^[a-f0-9]{64}$'),
  disposition text NOT NULL CHECK(disposition IN ('accepted','reference_conflict')),
  observed_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(shipment_id,attempt_token,provider_ref,detail_hash)
);
ALTER TABLE private.shipa_reconciliation_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.shipa_reconciliation_proofs FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.shipa_validate_reconciliation_detail(p_detail jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE party jsonb; package jsonb; field text;
BEGIN
  IF NOT coalesce(private.shipa_exact_keys(p_detail,ARRAY['shipaRef','customerRef','status','type','category','origin','destination','packages']),false)
    OR octet_length(p_detail::text)>16384
    OR jsonb_typeof(p_detail->'shipaRef') IS DISTINCT FROM 'string'
    OR length(p_detail->>'shipaRef') NOT BETWEEN 1 AND 200
    OR p_detail->>'shipaRef' ~ '[^A-Za-z0-9._~-]' OR p_detail->>'shipaRef' IN ('.','..')
    OR jsonb_typeof(p_detail->'customerRef') IS DISTINCT FROM 'string'
    OR length(p_detail->>'customerRef') NOT BETWEEN 1 AND 64
    OR p_detail->>'customerRef' ~ '[^A-Za-z0-9._~-]' OR p_detail->>'customerRef' IN ('.','..')
    OR NOT private.shipa_tracking_text(p_detail->'status') OR p_detail->'type' IS DISTINCT FROM '"Delivery"'::jsonb
    OR jsonb_typeof(p_detail->'category') IS DISTINCT FROM 'string'
    OR p_detail->>'category' NOT IN ('On Demand','Same Day','Next Day')
    OR jsonb_typeof(p_detail->'packages') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_reconciliation_detail';
  END IF;
  IF jsonb_array_length(p_detail->'packages')<>1 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_reconciliation_detail';
  END IF;
  FOREACH party IN ARRAY ARRAY[p_detail->'origin',p_detail->'destination'] LOOP
    IF NOT coalesce(private.shipa_exact_keys(party,ARRAY['contactName','city','country']),false)
      OR party->'country' IS DISTINCT FROM '"KWT"'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_reconciliation_detail';
    END IF;
    FOREACH field IN ARRAY ARRAY['contactName','city'] LOOP
      IF jsonb_typeof(party->field) IS DISTINCT FROM 'string' OR nullif(btrim(party->>field),'') IS NULL
        OR length(party->>field)>(CASE field WHEN 'contactName' THEN 150 ELSE 120 END)
        OR party->>field ~ '[[:cntrl:]]' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_reconciliation_detail';
      END IF;
    END LOOP;
  END LOOP;
  package:=p_detail#>'{packages,0}';
  IF NOT coalesce(private.shipa_exact_keys(package,ARRAY['customerRef','name','weight','length','width','height']),false)
    OR jsonb_typeof(package->'customerRef') IS DISTINCT FROM 'string'
    OR length(package->>'customerRef') NOT BETWEEN 1 AND 200
    OR package->>'customerRef' ~ '[^A-Za-z0-9._~-]' OR package->>'customerRef' IN ('.','..')
    OR jsonb_typeof(package->'name') IS DISTINCT FROM 'string' OR nullif(btrim(package->>'name'),'') IS NULL
    OR length(package->>'name')>200 OR package->>'name' ~ '[[:cntrl:]]'
    OR NOT private.shipa_tracking_number(package->'weight') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_reconciliation_detail';
  END IF;
  IF (package->>'weight')::numeric<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_reconciliation_detail';
  END IF;
  FOREACH field IN ARRAY ARRAY['length','width','height'] LOOP
    IF package->field='null'::jsonb THEN CONTINUE; END IF;
    IF NOT private.shipa_tracking_number(package->field) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_reconciliation_detail';
    END IF;
    IF (package->>field)::numeric<=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_reconciliation_detail';
    END IF;
  END LOOP;
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_reconciliation_facts(p_payload jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('customerRef',p_payload->'customerRef','type',p_payload->'type','category',p_payload->'category',
    'origin',jsonb_build_object('contactName',p_payload#>'{origin,contactName}','city',p_payload#>'{origin,city}','country',p_payload#>'{origin,country}'),
    'destination',jsonb_build_object('contactName',p_payload#>'{destination,contactName}','city',p_payload#>'{destination,city}','country',p_payload#>'{destination,country}'),
    'packages',jsonb_build_array(jsonb_build_object('customerRef',p_payload#>'{packages,0,customerRef}',
      'name',p_payload#>'{packages,0,name}','weight',p_payload#>'{packages,0,weight}',
      'length',p_payload#>'{packages,0,length}','width',p_payload#>'{packages,0,width}','height',p_payload#>'{packages,0,height}')))
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_require_reconciliation_marker(p_shipment public.shipments)
RETURNS private.shipa_submission_markers LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE marker private.shipa_submission_markers;
BEGIN
  SELECT * INTO marker FROM private.shipa_submission_markers WHERE shipment_id=p_shipment.id;
  IF marker.shipment_id IS NULL OR marker.attempt_token IS DISTINCT FROM p_shipment.attempt_token
    OR marker.payload_hash IS DISTINCT FROM p_shipment.payload_hash OR p_shipment.payload IS NULL
    OR marker.input_fingerprint IS DISTINCT FROM p_shipment.input_fingerprint
    OR marker.settings_revision IS DISTINCT FROM p_shipment.integration_revision
    OR marker.credential_fingerprint IS DISTINCT FROM p_shipment.credential_fingerprint
    OR marker.payload_hash IS DISTINCT FROM encode(sha256(convert_to(p_shipment.payload::text,'UTF8')),'hex') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_reconciliation_marker_mismatch';
  END IF;
  RETURN marker;
END
$fn$;

-- MUTATING: locks canonical integration/shipment, expires only this lease and
-- returns INTERNAL context. It neither sends nor authorizes a new attempt.
CREATE OR REPLACE FUNCTION public.shipa_read_reconciliation_context(_shipment_id uuid,_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE integration public.integrations; shipment public.shipments; credential private.integration_credentials;
  marker private.shipa_submission_markers;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  IF _shipment_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_shipment_required'; END IF;
  SELECT i.* INTO integration FROM public.integrations i JOIN public.shipments s ON s.integration_id=i.id
    WHERE s.id=_shipment_id AND s.provider='shipa' AND i.provider='shipa' FOR SHARE OF i;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.shipments WHERE id=_shipment_id FOR UPDATE;
  PERFORM public.shipa_expire_leases(_shipment_id);
  SELECT * INTO shipment FROM public.shipments WHERE id=_shipment_id;
  IF shipment.state<>'unknown' THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_reconciliation_requires_unknown';
  END IF;
  marker:=private.shipa_require_reconciliation_marker(shipment);
  SELECT * INTO credential FROM private.integration_credentials
    WHERE integration_id=integration.id AND environment=shipment.environment FOR SHARE;
  IF credential.integration_id IS NULL OR private.shipa_credential_fingerprint(credential) IS DISTINCT FROM marker.credential_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_reconciliation_original_key_unavailable';
  END IF;
  RETURN private.shipa_dispatch_binding(shipment)||jsonb_build_object('customer_ref',shipment.customer_ref,'shipa_ref',shipment.shipa_ref,
    'attempt_token',shipment.attempt_token,'updated_at',shipment.updated_at,'state',shipment.state,
    'credential_revision',credential.revision,'credential_fingerprint',marker.credential_fingerprint);
END
$fn$;

-- Only a server-normalized positive GET under the original credential may
-- resolve unknown. Misses, errors and incomplete facts have no write/retry path.
CREATE OR REPLACE FUNCTION public.shipa_apply_reconciled_detail(_shipment_id uuid,_attempt_token uuid,
  _expected_updated_at timestamptz,_credential_fingerprint text,_detail jsonb,_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE integration public.integrations; shipment public.shipments; credential private.integration_credentials;
  marker private.shipa_submission_markers; result jsonb; computed_detail_hash text;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  PERFORM private.shipa_validate_reconciliation_detail(_detail);
  IF _shipment_id IS NULL OR _attempt_token IS NULL OR _expected_updated_at IS NULL
    OR _credential_fingerprint IS NULL OR _credential_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_reconciliation_binding';
  END IF;
  SELECT i.* INTO integration FROM public.integrations i JOIN public.shipments s ON s.integration_id=i.id
    WHERE s.id=_shipment_id AND s.provider='shipa' AND i.provider='shipa' FOR SHARE OF i;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='shipa_shipment_missing'; END IF;
  SELECT * INTO shipment FROM public.shipments WHERE id=_shipment_id FOR UPDATE;
  IF shipment.state NOT IN ('unknown','created') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_reconciliation_requires_unknown';
  END IF;
  marker:=private.shipa_require_reconciliation_marker(shipment);
  IF marker.attempt_token IS DISTINCT FROM _attempt_token
    OR (shipment.state='unknown' AND shipment.updated_at IS DISTINCT FROM _expected_updated_at) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_reconciliation_changed';
  END IF;
  SELECT * INTO credential FROM private.integration_credentials
    WHERE integration_id=integration.id AND environment=shipment.environment FOR SHARE;
  IF credential.integration_id IS NULL OR _credential_fingerprint IS DISTINCT FROM marker.credential_fingerprint
    OR private.shipa_credential_fingerprint(credential) IS DISTINCT FROM marker.credential_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_reconciliation_key_changed';
  END IF;
  IF (_detail-ARRAY['shipaRef','status']) IS DISTINCT FROM private.shipa_reconciliation_facts(shipment.payload)
    OR _detail->>'customerRef' IS DISTINCT FROM shipment.customer_ref THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_reconciliation_facts_mismatch';
  END IF;
  result:=public.shipa_complete(shipment.id,marker.attempt_token,jsonb_build_object('outcome','accepted',
    'shipaRef',_detail->'shipaRef','orderStatus',_detail->'status'));
  IF shipment.state='created' THEN RETURN result; END IF;
  computed_detail_hash:=encode(sha256(convert_to(_detail::text,'UTF8')),'hex');
  INSERT INTO private.shipa_reconciliation_proofs(shipment_id,attempt_token,provider_ref,credential_fingerprint,
    payload_hash,detail_hash,disposition,observed_by)
    VALUES(shipment.id,marker.attempt_token,_detail->>'shipaRef',marker.credential_fingerprint,marker.payload_hash,computed_detail_hash,
      CASE WHEN result->>'state'='created' AND result->>'conflict'='false' THEN 'accepted' ELSE 'reference_conflict' END,_actor_id)
    ON CONFLICT(shipment_id,attempt_token,provider_ref,detail_hash) DO NOTHING;
  IF result->>'state'='created' AND result->>'conflict'='false' THEN
    INSERT INTO public.shipment_events(shipment_id,event_key,event_type,attempt_token,code)
      VALUES(shipment.id,'reconciled:'||marker.attempt_token::text,'reconciled',marker.attempt_token,'provider_detail_matched')
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN result;
END
$fn$;

REVOKE ALL ON FUNCTION private.shipa_validate_reconciliation_detail(jsonb),private.shipa_reconciliation_facts(jsonb),
  private.shipa_require_reconciliation_marker(public.shipments) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.shipa_read_reconciliation_context(uuid,uuid),
  public.shipa_apply_reconciled_detail(uuid,uuid,timestamptz,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.shipa_read_reconciliation_context(uuid,uuid),
  public.shipa_apply_reconciled_detail(uuid,uuid,timestamptz,text,jsonb,uuid) TO service_role;
COMMIT;
