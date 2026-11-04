-- One durable submission marker before HTTP. An uncertain or lost begin
-- response never grants permission to issue another provider creation.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,16);
CREATE TABLE IF NOT EXISTS private.shipa_submission_markers (
  shipment_id uuid PRIMARY KEY REFERENCES public.shipments(id) ON DELETE RESTRICT,
  attempt_token uuid NOT NULL UNIQUE,
  settings_revision integer NOT NULL CHECK(settings_revision>=0),
  credential_revision integer NOT NULL CHECK(credential_revision>0),
  credential_fingerprint text NOT NULL CHECK(credential_fingerprint ~ '^[a-f0-9]{64}$'),
  input_fingerprint text NOT NULL CHECK(input_fingerprint ~ '^[a-f0-9]{64}$'),
  payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.shipa_submission_markers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.shipa_submission_markers FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.shipa_has_possible_dispatch(p_shipment public.shipments)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
  SELECT p_shipment.attempt_count>0 OR p_shipment.attempt_token IS NOT NULL OR p_shipment.submitted_at IS NOT NULL
    OR p_shipment.payload IS NOT NULL OR p_shipment.payload_hash IS NOT NULL OR p_shipment.shipa_ref IS NOT NULL
    OR EXISTS(SELECT 1 FROM private.shipa_submission_markers WHERE shipment_id=p_shipment.id)
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_credential_fingerprint(p_row private.integration_credentials)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object('integration_id',p_row.integration_id,
    'environment',p_row.environment,'key_version',p_row.key_version,'nonce',p_row.nonce,
    'ciphertext',p_row.ciphertext)::text,'UTF8')),'hex')
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_read_credential(_integration_id uuid,_environment text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE credential private.integration_credentials;
BEGIN
  IF _environment IS NULL OR _environment NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_environment';
  END IF;
  SELECT * INTO credential FROM private.integration_credentials WHERE integration_id=_integration_id AND environment=_environment;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('envelope',jsonb_build_object('integration_id',credential.integration_id,'provider',credential.provider,
    'environment',credential.environment,'key_version',credential.key_version,'nonce',credential.nonce,'ciphertext',credential.ciphertext),
    'credential_revision',credential.revision,'rotated_at',credential.rotated_at,
    'credential_fingerprint',private.shipa_credential_fingerprint(credential));
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_integrity_or_review(p_order_id uuid,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  RETURN public.shipa_check_integrity(p_order_id,p_snapshot);
EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM NOT IN ('shipa_invalid_review_snapshot','shipa_invalid_config','shipa_invalid_origin','shipa_invalid_parcel') THEN RAISE; END IF;
  RETURN jsonb_build_object('accepted',false,'reasons',jsonb_build_array('delivery_input_invalid'),'input_fingerprint',NULL);
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_automatic_integrity(p_order_id uuid,p_environment text)
RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
  SELECT private.shipa_integrity_or_review(p_order_id,jsonb_build_object('environment',p_environment))
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_delivery_address(p_address jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT coalesce(nullif(btrim(p_address->>'addressLine'),''),
    concat_ws(', ',nullif(btrim(p_address->>'block'),''),nullif(btrim(p_address->>'street'),''),nullif(btrim(p_address->>'building'),'')))
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_submission_draft(p_order public.orders,p_config jsonb,p_delivery jsonb,p_reference text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,private AS $fn$
  SELECT jsonb_build_object('customerRef',p_reference,'orderType','Delivery','category',p_config->'serviceCode',
    'autoConfirm',p_config->'autoConfirm','pickupInstructions',p_config->'pickupInstructions',
    'origin',jsonb_build_object('country','KWT','contactName',p_config#>'{origin,contactName}',
      'contactNo',private.shipa_kuwait_phone(p_config#>>'{origin,contactPhone}'),'city',p_config#>'{origin,address,area}',
      'address',private.shipa_delivery_address(p_config#>'{origin,address}')),
    'destination',jsonb_build_object('country','KWT','contactName',p_delivery#>'{destination,contactName}',
      'contactNo',p_delivery#>'{destination,contactPhone}','city',p_delivery#>'{destination,city}',
      'address',private.shipa_delivery_address(p_delivery->'destination')),
    'package',jsonb_build_object('customerRef',p_reference||'-1','name','CureMed order','description','Order '||p_order.order_number,
      'weightKg',p_delivery#>'{parcel,weightKg}','lengthCm',p_delivery#>'{parcel,dimensionsCm,lengthCm}',
      'widthCm',p_delivery#>'{parcel,dimensionsCm,widthCm}','heightCm',p_delivery#>'{parcel,dimensionsCm,heightCm}'))
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_submission_payload(p_draft jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('customerRef',p_draft->'customerRef','type',p_draft->'orderType','category',p_draft->'category',
    'autoConfirm',p_draft->'autoConfirm','origin',(p_draft->'origin')||jsonb_build_object('options',
      jsonb_build_object('specialInstructions',p_draft->'pickupInstructions')),
    'destination',(p_draft->'destination')||'{"type":"Doorstep","options":{"amountToCollect":0}}'::jsonb,
    'packages',jsonb_build_array(((p_draft->'package')-ARRAY['weightKg','lengthCm','widthCm','heightCm'])||
      jsonb_build_object('weight',p_draft#>'{package,weightKg}','length',p_draft#>'{package,lengthCm}',
        'width',p_draft#>'{package,widthCm}','height',p_draft#>'{package,heightCm}')))
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_draft_problem(p_draft jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE party jsonb; field text;
BEGIN
  FOREACH party IN ARRAY ARRAY[p_draft->'origin',p_draft->'destination'] LOOP
    FOREACH field IN ARRAY ARRAY['contactName','city','address'] LOOP
      IF nullif(btrim(party->>field),'') IS NULL OR length(party->>field)>(CASE field
        WHEN 'contactName' THEN 150 WHEN 'city' THEN 120 ELSE 1000 END) THEN RETURN 'delivery_input_invalid'; END IF;
    END LOOP;
    IF party->>'contactNo' !~ '^\+965[0-9]{8}$' THEN RETURN 'delivery_input_invalid'; END IF;
  END LOOP;
  IF length(p_draft#>>'{package,description}')>1000 THEN RETURN 'delivery_input_invalid'; END IF;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_review_allows(p_shipment public.shipments,p_integrity jsonb)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  IF p_shipment.reviewed_fingerprint IS DISTINCT FROM p_integrity->>'input_fingerprint' OR NOT EXISTS(
    SELECT 1 FROM private.shipa_reviews WHERE shipment_id=p_shipment.id AND actor_id=p_shipment.reviewed_by
      AND input_fingerprint=p_shipment.reviewed_fingerprint AND reason=p_shipment.review_reason
      AND (p_integrity->>'accepted'='true' OR pricing_acknowledged)) THEN RETURN false; END IF;
  PERFORM private.shipa_require_reviewable_integrity(p_integrity,'{"acknowledgePricing":true}');
  RETURN true;
EXCEPTION WHEN object_not_in_prerequisite_state THEN
  IF SQLERRM<>'shipa_integrity_requires_correction' THEN RAISE; END IF;
  RETURN false;
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_hold_unattempted(p_shipment public.shipments,p_code text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  IF p_shipment.state='queued' AND NOT private.shipa_has_possible_dispatch(p_shipment) THEN
    UPDATE public.shipments SET state='needs_review',last_error_code=p_code,updated_at=clock_timestamp() WHERE id=p_shipment.id;
  END IF;
  RETURN jsonb_build_object('ready',false,'shipment_id',p_shipment.id,'code',p_code);
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_prepared_context(p_shipment public.shipments,p_integration public.integrations,p_order public.orders)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE integrity jsonb; delivery jsonb; config jsonb; draft jsonb; payload jsonb; problem text;
  credential private.integration_credentials;
BEGIN
  integrity:=private.shipa_integrity_or_review(p_order.id,jsonb_build_object('environment',p_shipment.environment,'overrides',p_shipment.overrides));
  IF NOT private.shipa_paid_items_match(p_order.id) THEN RETURN private.shipa_hold_unattempted(p_shipment,'paid_items_changed'); END IF;
  IF integrity->>'input_fingerprint' IS NULL THEN RETURN private.shipa_hold_unattempted(p_shipment,'delivery_input_invalid'); END IF;
  IF (p_shipment.source='manual' AND NOT private.shipa_review_allows(p_shipment,integrity))
    OR (p_shipment.source='automatic' AND integrity->>'accepted'<>'true') THEN
    RETURN private.shipa_hold_unattempted(p_shipment,'integrity_or_review_changed');
  END IF;
  SELECT * INTO credential FROM private.integration_credentials WHERE integration_id=p_integration.id
    AND environment=p_shipment.environment FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ready',false,'shipment_id',p_shipment.id,'code','credential_missing'); END IF;
  config:=p_integration.configuration->p_shipment.environment;
  delivery:=private.shipa_delivery_snapshot(p_order,config,p_shipment.overrides);
  draft:=private.shipa_submission_draft(p_order,config,delivery,p_shipment.customer_ref);
  problem:=private.shipa_draft_problem(draft);
  IF problem IS NOT NULL THEN RETURN private.shipa_hold_unattempted(p_shipment,problem); END IF;
  payload:=private.shipa_submission_payload(draft);
  RETURN jsonb_build_object('ready',true,'shipment_id',p_shipment.id,'integration_id',p_integration.id,'environment',p_shipment.environment,
    'settings_revision',p_integration.revision,'input_fingerprint',integrity->>'input_fingerprint',
    'credential_revision',credential.revision,'credential_fingerprint',private.shipa_credential_fingerprint(credential),
    'draft',draft,'payload',payload,'payload_hash',encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
END
$fn$;

-- MUTATING preparation can hold unattempted work for review; it never issues
-- send authority. Only a successful begin result permits one provider request.
CREATE OR REPLACE FUNCTION public.shipa_prepare_submission(_shipment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE integration public.integrations; ordered public.orders; shipment public.shipments;
BEGIN
  PERFORM private.shipa_require_ordering_open();
  SELECT * INTO STRICT integration FROM public.integrations WHERE provider='shipa' FOR SHARE;
  SELECT ordered_row.* INTO ordered FROM public.orders ordered_row JOIN public.shipments intent ON intent.order_id=ordered_row.id
    WHERE intent.id=_shipment_id FOR UPDATE OF ordered_row;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='shipa_shipment_missing'; END IF;
  SELECT * INTO shipment FROM public.shipments WHERE id=_shipment_id FOR UPDATE;
  IF shipment.state<>'queued' OR private.shipa_has_possible_dispatch(shipment) THEN
    RETURN jsonb_build_object('ready',false,'shipment_id',shipment.id,'code','possible_dispatch_or_state_ineligible');
  END IF;
  IF NOT integration.enabled OR integration.environment<>shipment.environment
    OR (shipment.source='automatic' AND integration.dispatch_mode<>'automatic_after_payment')
    OR (shipment.retry_at IS NOT NULL AND shipment.retry_at>clock_timestamp()) THEN
    RETURN jsonb_build_object('ready',false,'shipment_id',shipment.id,'code','integration_ineligible');
  END IF;
  PERFORM private.shipa_require_paid_receipt(ordered);
  RETURN private.shipa_prepared_context(shipment,integration,ordered);
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_validate_prepared(p_prepared jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE field text;
BEGIN
  IF NOT coalesce(private.shipa_exact_keys(p_prepared,ARRAY['settings_revision','input_fingerprint','credential_revision',
    'credential_fingerprint','payload','payload_hash']),false) OR octet_length(p_prepared::text)>16384
    OR jsonb_typeof(p_prepared->'settings_revision') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_prepared->'credential_revision') IS DISTINCT FROM 'number'
    OR p_prepared->>'settings_revision' !~ '^(0|[1-9][0-9]{0,9})$'
    OR p_prepared->>'credential_revision' !~ '^[1-9][0-9]{0,9}$'
    OR (p_prepared->>'settings_revision')::numeric>2147483647
    OR (p_prepared->>'credential_revision')::numeric>2147483647
    OR jsonb_typeof(p_prepared->'payload') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_prepared_request';
  END IF;
  FOREACH field IN ARRAY ARRAY['input_fingerprint','credential_fingerprint','payload_hash'] LOOP
    IF jsonb_typeof(p_prepared->field) IS DISTINCT FROM 'string' OR p_prepared->>field !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_prepared_request';
    END IF;
  END LOOP;
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_mark_submission(p_shipment_id uuid,p_token uuid,p_context jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE shipment public.shipments; submitted timestamptz:=clock_timestamp();
BEGIN
  BEGIN
    INSERT INTO private.shipa_submission_markers(shipment_id,attempt_token,settings_revision,credential_revision,
      credential_fingerprint,input_fingerprint,payload_hash,submitted_at)
      VALUES(p_shipment_id,p_token,(p_context->>'settings_revision')::integer,(p_context->>'credential_revision')::integer,
        p_context->>'credential_fingerprint',p_context->>'input_fingerprint',p_context->>'payload_hash',submitted);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_submission_marker_conflict';
  END;
  UPDATE public.shipments SET state='submitting',attempt_token=p_token,attempt_count=attempt_count+1,
    integration_revision=(p_context->>'settings_revision')::integer,credential_fingerprint=p_context->>'credential_fingerprint',
    input_fingerprint=p_context->>'input_fingerprint',payload=p_context->'payload',payload_hash=p_context->>'payload_hash',
    lease_expires_at=submitted+interval '45 seconds',submitted_at=submitted,retry_at=NULL,last_error_code=NULL,updated_at=submitted
    WHERE id=p_shipment_id RETURNING * INTO shipment;
  RETURN p_context||jsonb_build_object('attempt_token',p_token,'lease_expires_at',shipment.lease_expires_at);
END
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_begin_submission(_shipment_id uuid,_attempt_token uuid,_prepared jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE context jsonb; shipment public.shipments;
BEGIN
  IF _attempt_token IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_attempt_token_required'; END IF;
  PERFORM private.shipa_validate_prepared(_prepared);
  context:=public.shipa_prepare_submission(_shipment_id);
  IF context->>'ready'<>'true' THEN RETURN context; END IF;
  IF context->'settings_revision' IS DISTINCT FROM _prepared->'settings_revision'
    OR context->'input_fingerprint' IS DISTINCT FROM _prepared->'input_fingerprint'
    OR context->'credential_revision' IS DISTINCT FROM _prepared->'credential_revision'
    OR context->'credential_fingerprint' IS DISTINCT FROM _prepared->'credential_fingerprint' THEN
    SELECT * INTO shipment FROM public.shipments WHERE id=_shipment_id;
    RETURN private.shipa_hold_unattempted(shipment,'prepared_inputs_changed');
  END IF;
  IF context->'payload' IS DISTINCT FROM _prepared->'payload' OR context->'payload_hash' IS DISTINCT FROM _prepared->'payload_hash' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_prepared_payload_mismatch';
  END IF;
  RETURN private.shipa_mark_submission(_shipment_id,_attempt_token,context);
END
$fn$;

REVOKE ALL ON FUNCTION public.shipa_prepare_submission(uuid),public.shipa_begin_submission(uuid,uuid,jsonb),
  public.shipa_read_credential(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shipa_prepare_submission(uuid),public.shipa_begin_submission(uuid,uuid,jsonb),
  public.shipa_read_credential(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION private.shipa_has_possible_dispatch(public.shipments),private.shipa_credential_fingerprint(private.integration_credentials),
  private.shipa_integrity_or_review(uuid,jsonb),private.shipa_automatic_integrity(uuid,text),private.shipa_delivery_address(jsonb),
  private.shipa_submission_draft(public.orders,jsonb,jsonb,text),private.shipa_submission_payload(jsonb),private.shipa_draft_problem(jsonb),
  private.shipa_review_allows(public.shipments,jsonb),private.shipa_hold_unattempted(public.shipments,text),
  private.shipa_prepared_context(public.shipments,public.integrations,public.orders),private.shipa_validate_prepared(jsonb),
  private.shipa_mark_submission(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
