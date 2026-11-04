-- Durable dispatch state and result fencing. Trusted payment/enqueue and
-- begin-submission writers are separate required dependencies, not browser input.
-- No constraints/triggers are installed on preexisting orders/payment tables by
-- this schema phase. Their retention links must be armed in the reviewed app phase.
CREATE TABLE IF NOT EXISTS private.order_payment_verifications (
  order_id uuid PRIMARY KEY,
  outcome_id uuid NOT NULL UNIQUE,
  provider text NOT NULL CHECK(provider='myfatoorah'),
  payment_attempt_id uuid NOT NULL,
  invoice_id text NOT NULL CHECK(length(invoice_id) BETWEEN 1 AND 200),
  payment_id text NOT NULL CHECK(length(payment_id) BETWEEN 1 AND 200),
  amount_millis bigint NOT NULL CHECK(amount_millis>0),
  currency text NOT NULL CHECK(currency='KWD'),
  source text NOT NULL CHECK(source IN ('callback','webhook','manual_reverification')),
  dispatch_decision text NOT NULL CHECK(dispatch_decision IN
    ('enqueued','manual_mode','disabled','integrity_hold','manual_reverification','already_paid_manual_only')),
  verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.order_payment_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.order_payment_verifications FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES private.order_payment_verifications(order_id) ON DELETE RESTRICT,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'shipa' CHECK(provider='shipa'),
  environment text NOT NULL CHECK(environment IN ('sandbox','live')),
  source text NOT NULL CHECK(source IN ('manual','automatic')),
  state text NOT NULL DEFAULT 'needs_review'
    CHECK(state IN ('queued','submitting','created','rejected','needs_review','unknown')),
  customer_ref text NOT NULL CHECK(length(customer_ref) BETWEEN 1 AND 64
    AND customer_ref !~ '[^A-Za-z0-9._~-]' AND customer_ref NOT IN ('.','..')),
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(overrides)='object'),
  input_fingerprint text CHECK(input_fingerprint ~ '^[a-f0-9]{64}$' AND length(input_fingerprint)=64),
  reviewed_fingerprint text CHECK(reviewed_fingerprint ~ '^[a-f0-9]{64}$' AND length(reviewed_fingerprint)=64),
  reviewed_by uuid,
  review_reason text CHECK(length(review_reason) BETWEEN 1 AND 1000),
  integration_revision integer CHECK(integration_revision>=0),
  credential_fingerprint text CHECK(credential_fingerprint ~ '^[a-f0-9]{64}$' AND length(credential_fingerprint)=64),
  payload jsonb CHECK(jsonb_typeof(payload)='object'),
  payload_hash text CHECK(payload_hash ~ '^[a-f0-9]{64}$' AND length(payload_hash)=64),
  attempt_token uuid,
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 4),
  retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count BETWEEN 0 AND 3),
  retry_at timestamptz,
  lease_expires_at timestamptz,
  submitted_at timestamptz,
  shipa_ref text CHECK(length(shipa_ref) BETWEEN 1 AND 200
    AND shipa_ref !~ '[^A-Za-z0-9._~-]' AND shipa_ref NOT IN ('.','..')),
  provider_status text CHECK(length(provider_status) BETWEEN 1 AND 120 AND provider_status !~ '[[:cntrl:]]'),
  last_outcome jsonb,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,provider,environment),
  UNIQUE(integration_id,environment,customer_ref),
  CHECK(state<>'created' OR shipa_ref IS NOT NULL),
  CHECK(shipa_ref IS NULL OR state='created'),
  CHECK(state NOT IN ('submitting','unknown','created') OR
    (attempt_token IS NOT NULL AND attempt_count>0 AND payload IS NOT NULL
      AND payload_hash IS NOT NULL AND lease_expires_at IS NOT NULL
      AND submitted_at IS NOT NULL AND integration_revision IS NOT NULL
      AND credential_fingerprint IS NOT NULL)),
  CHECK(state<>'unknown' OR retry_at IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS shipa_unique_remote_reference
  ON public.shipments(integration_id,environment,shipa_ref) WHERE shipa_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipa_expiring_attempts ON public.shipments(lease_expires_at,id) WHERE state='submitting';
CREATE INDEX IF NOT EXISTS shipa_due_candidates ON public.shipments(environment,source,retry_at,created_at,id) WHERE state='queued';
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipments FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.shipments TO authenticated;
DROP POLICY IF EXISTS shipa_admin_shipments ON public.shipments;
CREATE POLICY shipa_admin_shipments ON public.shipments FOR SELECT TO authenticated
  USING(public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE RESTRICT,
  event_key text NOT NULL CHECK(length(event_key) BETWEEN 1 AND 150),
  event_type text NOT NULL CHECK(event_type IN
    ('attempt_accepted','attempt_uncertain','local_rejection','lease_expired','conflicting_result','reconciled')),
  attempt_token uuid NOT NULL,
  code text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shipment_id,event_key)
);
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipment_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.shipment_events TO authenticated;
DROP POLICY IF EXISTS shipa_admin_events ON public.shipment_events;
CREATE POLICY shipa_admin_events ON public.shipment_events FOR SELECT TO authenticated
  USING(public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION private.shipa_dispatch_summary(p_row public.shipments,p_changed boolean,p_conflict boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('shipment_id',p_row.id,'state',p_row.state,'changed',p_changed,
    'conflict',p_conflict,'shipa_ref',p_row.shipa_ref,'provider_status',p_row.provider_status,
    'attempt_count',p_row.attempt_count,'retry_count',p_row.retry_count,'retry_at',p_row.retry_at,
    'last_error_code',p_row.last_error_code,'updated_at',p_row.updated_at)
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_complete(_shipment_id uuid,_attempt_token uuid,_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_row public.shipments; v_kind text; v_code text; v_reference text; v_status text; v_key text; v_event text;
  v_changed boolean:=false;
BEGIN
  v_kind:=_result->>'outcome';
  IF _shipment_id IS NULL OR _attempt_token IS NULL OR v_kind IS NULL OR v_kind NOT IN ('accepted','uncertain','rejected_local') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_result';
  END IF;
  IF v_kind='accepted' THEN
    v_reference:=_result->>'shipaRef'; v_status:=_result->>'orderStatus';
    IF NOT coalesce(private.shipa_exact_keys(_result,ARRAY['outcome','shipaRef','orderStatus']),false)
      OR jsonb_typeof(_result->'shipaRef') IS DISTINCT FROM 'string'
      OR length(v_reference) NOT BETWEEN 1 AND 200 OR v_reference ~ '[^A-Za-z0-9._~-]'
      OR v_reference IN ('.','..') OR jsonb_typeof(_result->'orderStatus') NOT IN ('null','string')
      OR (v_status IS NOT NULL AND (length(v_status) NOT BETWEEN 1 AND 120 OR v_status ~ '[[:cntrl:]]')) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_result';
    END IF;
    v_event:='attempt_accepted';
  ELSE
    v_code:=_result->>'code';
    IF NOT coalesce(private.shipa_exact_keys(_result,ARRAY['outcome','code']),false)
      OR jsonb_typeof(_result->'code') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_result';
    END IF;
    IF v_kind='uncertain' THEN
      IF v_code NOT IN ('invalid_request','invalid_order_ref','timeout','network_error','redirect_refused',
        'not_found','unauthorized','forbidden','rate_limited','server_error','unexpected_status',
        'malformed_response','invalid_response','response_too_large','missing_reference') THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_result';
      END IF;
      v_event:='attempt_uncertain';
    ELSE
      IF v_code NOT IN ('unexpected_field','invalid_customer_ref','invalid_package_ref','invalid_order_type',
        'missing_category','invalid_category','cross_border_not_supported','invalid_auto_confirm','invalid_country',
        'invalid_contact_name','invalid_contact_phone','invalid_city','invalid_address','invalid_email',
        'invalid_coordinates','invalid_package_name','invalid_package_description','invalid_package_weight',
        'invalid_package_dimensions') THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_invalid_result';
      END IF;
      v_event:='local_rejection';
    END IF;
  END IF;
  SELECT * INTO v_row FROM public.shipments WHERE id=_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='shipa_shipment_missing'; END IF;
  IF v_row.attempt_token IS DISTINCT FROM _attempt_token THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='shipa_stale_attempt';
  END IF;
  v_key:=encode(sha256(convert_to(_attempt_token::text||':'||_result::text,'UTF8')),'hex');
  IF v_row.state='created' THEN
    IF v_kind<>'accepted' OR v_row.shipa_ref=v_reference THEN
      RETURN private.shipa_dispatch_summary(v_row,false);
    END IF;
    INSERT INTO public.shipment_events(shipment_id,event_key,event_type,attempt_token,code)
      VALUES(v_row.id,v_key,'conflicting_result',_attempt_token,'creation_result_conflict') ON CONFLICT DO NOTHING;
    RETURN private.shipa_dispatch_summary(v_row,false,true);
  END IF;
  IF v_row.state NOT IN ('submitting','unknown') THEN
    IF v_row.last_outcome=_result THEN RETURN private.shipa_dispatch_summary(v_row,false); END IF;
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='shipa_attempt_not_inflight';
  END IF;
  IF v_kind='rejected_local' THEN
    -- A persisted submission marker records a possible external attempt. A later
    -- validator result, service role or matching token cannot prove non-dispatch.
    -- Pre-marker validation belongs before begin-submission; only authoritative
    -- reconciliation may later resolve this uncertainty.
    IF v_row.state='submitting' THEN
      UPDATE public.shipments SET state='unknown',retry_at=NULL,
        last_error_code='no_dispatch_unproven',
        last_outcome='{"outcome":"uncertain","code":"invalid_response"}'::jsonb,
        updated_at=clock_timestamp() WHERE id=v_row.id RETURNING * INTO v_row;
      v_changed:=true;
    END IF;
    INSERT INTO public.shipment_events(shipment_id,event_key,event_type,attempt_token,code)
      VALUES(v_row.id,v_key,'conflicting_result',_attempt_token,'no_dispatch_unproven') ON CONFLICT DO NOTHING;
    RETURN private.shipa_dispatch_summary(v_row,v_changed,true);
  END IF;
  IF v_row.last_outcome=_result THEN RETURN private.shipa_dispatch_summary(v_row,false); END IF;
  BEGIN
  UPDATE public.shipments SET state=CASE v_kind WHEN 'accepted' THEN 'created' ELSE 'unknown' END,
    shipa_ref=CASE WHEN v_kind='accepted' THEN v_reference ELSE NULL END,
    provider_status=CASE WHEN v_kind='accepted' THEN v_status ELSE provider_status END,
    last_outcome=_result,last_error_code=v_code,retry_at=NULL,updated_at=clock_timestamp()
    WHERE id=v_row.id RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    -- Another order already owns that remote reference. Preserve its record;
    -- this attempt needs reconciliation and must never be queued for creation.
    UPDATE public.shipments SET state='unknown',retry_at=NULL,
      last_outcome='{"outcome":"uncertain","code":"invalid_response"}'::jsonb,
      last_error_code='remote_reference_conflict',updated_at=clock_timestamp()
      WHERE id=v_row.id RETURNING * INTO v_row;
    INSERT INTO public.shipment_events(shipment_id,event_key,event_type,attempt_token,code)
      VALUES(v_row.id,v_key,'conflicting_result',_attempt_token,'remote_reference_conflict') ON CONFLICT DO NOTHING;
    RETURN private.shipa_dispatch_summary(v_row,true,true);
  END;
  INSERT INTO public.shipment_events(shipment_id,event_key,event_type,attempt_token,code)
    VALUES(v_row.id,v_key,v_event,_attempt_token,v_code) ON CONFLICT DO NOTHING;
  RETURN private.shipa_dispatch_summary(v_row,true);
END
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_expire_leases(_shipment_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_row public.shipments; v_count integer:=0;
BEGIN
  FOR v_row IN SELECT * FROM public.shipments WHERE state='submitting'
    AND lease_expires_at<=clock_timestamp() AND (_shipment_id IS NULL OR id=_shipment_id)
    ORDER BY lease_expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.shipments SET state='unknown',retry_at=NULL,last_error_code='timeout',
      last_outcome='{"outcome":"uncertain","code":"timeout"}'::jsonb,updated_at=clock_timestamp() WHERE id=v_row.id;
    INSERT INTO public.shipment_events(shipment_id,event_key,event_type,attempt_token,code)
      VALUES(v_row.id,'expired:'||v_row.attempt_token::text,'lease_expired',v_row.attempt_token,'timeout') ON CONFLICT DO NOTHING;
    v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('expired',v_count,'more_due',EXISTS(SELECT 1 FROM public.shipments
    WHERE state='submitting' AND lease_expires_at<=clock_timestamp() AND (_shipment_id IS NULL OR id=_shipment_id)));
END
$fn$;

-- MUTATING read: performs targeted lease expiry. _actor_id must be derived from
-- the caller's authenticated identity by the service endpoint, never a browser UUID.
CREATE OR REPLACE FUNCTION public.shipa_read_shipment(_shipment_id uuid,_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_row public.shipments;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  IF _shipment_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shipa_shipment_required';
  END IF;
  PERFORM public.shipa_expire_leases(_shipment_id);
  SELECT * INTO v_row FROM public.shipments WHERE id=_shipment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN private.shipa_dispatch_summary(v_row,false)||jsonb_build_object('order_id',v_row.order_id,
    'environment',v_row.environment,'source',v_row.source,'customer_ref',v_row.customer_ref,
    'created_at',v_row.created_at,'reviewed_fingerprint',v_row.reviewed_fingerprint,
    'input_fingerprint',v_row.input_fingerprint);
END
$fn$;

REVOKE ALL ON FUNCTION private.shipa_dispatch_summary(public.shipments,boolean,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.shipa_complete(uuid,uuid,jsonb),public.shipa_expire_leases(uuid),
  public.shipa_read_shipment(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shipa_complete(uuid,uuid,jsonb),public.shipa_expire_leases(uuid),
  public.shipa_read_shipment(uuid,uuid) TO service_role;
