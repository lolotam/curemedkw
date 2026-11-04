-- Receipt-owned intent creation and explicit staff adoption. No provider I/O,
-- submission marker or automatic re-creation authority is issued here.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,15);
CREATE TABLE IF NOT EXISTS private.shipa_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  input_fingerprint text NOT NULL CHECK(input_fingerprint ~ '^[a-f0-9]{64}$'),
  settings_revision integer NOT NULL CHECK(settings_revision>=0),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
  pricing_acknowledged boolean NOT NULL,
  overrides jsonb NOT NULL CHECK(jsonb_typeof(overrides)='object'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shipment_id,actor_id,input_fingerprint,reason,pricing_acknowledged)
);
ALTER TABLE private.shipa_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.shipa_reviews FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.shipa_require_paid_receipt(p_order public.orders)
RETURNS private.order_payment_verifications LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE receipt private.order_payment_verifications; evidence private.wa_payment_evidence;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.integration_payment_release WHERE singleton AND retention_ready) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shared_payment_activation_required';
  END IF;
  SELECT * INTO receipt FROM private.order_payment_verifications WHERE order_id=p_order.id FOR SHARE;
  SELECT * INTO evidence FROM private.wa_payment_evidence WHERE outcome_id=receipt.outcome_id;
  IF receipt.order_id IS NULL OR evidence.id IS NULL OR p_order.payment_status<>'paid'
    OR p_order.order_status IN ('cancelled','delivered') OR p_order.payment_currency<>'KWD'
    OR evidence.order_id IS DISTINCT FROM p_order.id OR evidence.attempt_id IS DISTINCT FROM receipt.payment_attempt_id
    OR evidence.invoice_id IS DISTINCT FROM receipt.invoice_id OR evidence.transaction_payment_id IS DISTINCT FROM receipt.payment_id
    OR evidence.currency IS DISTINCT FROM receipt.currency OR evidence.amount IS DISTINCT FROM p_order.total
    OR receipt.amount_millis IS DISTINCT FROM (evidence.amount*1000)::bigint THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_verified_paid_receipt_required';
  END IF;
  RETURN receipt;
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_paid_items_match(p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
  SELECT (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'product_id',product_id,'name',product_name_snapshot,
    'quantity',quantity,'unit_price',unit_price,'line_total',line_total) ORDER BY id),'[]')
    FROM public.order_items WHERE order_id=p_order_id) IS NOT DISTINCT FROM
    (SELECT input_snapshot#>'{facts,items}' FROM private.wa_payment_outcomes WHERE order_id=p_order_id)
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_has_possible_dispatch(p_shipment public.shipments)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT p_shipment.attempt_count>0 OR p_shipment.attempt_token IS NOT NULL OR p_shipment.submitted_at IS NOT NULL
    OR p_shipment.payload IS NOT NULL OR p_shipment.payload_hash IS NOT NULL OR p_shipment.shipa_ref IS NOT NULL
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_require_ordering_open()
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE mode jsonb;
BEGIN
  SELECT value INTO mode FROM public.site_settings WHERE key='ecommerce_mode' FOR SHARE;
  IF mode->'shoppingEnabled' IS DISTINCT FROM 'true'::jsonb OR mode->'checkoutEnabled' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_ordering_disabled';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_review_request(p_request jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  IF NOT coalesce(private.shipa_exact_keys(p_request,ARRAY['environment','overrides','expectedSettingsRevision',
    'expectedInputFingerprint','reviewReason','acknowledgePricing','packedConfirmed']),false)
    OR octet_length(p_request::text)>16384 OR jsonb_typeof(p_request->'environment') IS DISTINCT FROM 'string'
    OR p_request->>'environment' NOT IN ('sandbox','live')
    OR jsonb_typeof(p_request->'expectedSettingsRevision') IS DISTINCT FROM 'number'
    OR p_request->>'expectedSettingsRevision' !~ '^(0|[1-9][0-9]{0,9})$'
    OR (p_request->>'expectedSettingsRevision')::numeric>2147483647
    OR jsonb_typeof(p_request->'expectedInputFingerprint') IS DISTINCT FROM 'string'
    OR p_request->>'expectedInputFingerprint' !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_request->'reviewReason') IS DISTINCT FROM 'string'
    OR length(btrim(p_request->>'reviewReason')) NOT BETWEEN 1 AND 1000
    OR jsonb_typeof(p_request->'acknowledgePricing') IS DISTINCT FROM 'boolean'
    OR p_request->'packedConfirmed' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_manual_request';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_require_reviewable_integrity(p_integrity jsonb,p_request jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  IF p_integrity->>'accepted'='true' THEN RETURN; END IF;
  IF p_request->'acknowledgePricing'<>'true'::jsonb OR EXISTS(
    SELECT 1 FROM jsonb_array_elements_text(p_integrity->'reasons') reason
      WHERE reason NOT IN ('catalog_price_mismatch','coupon_requires_review','discount_mismatch')) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_integrity_requires_correction';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_enqueue_automatic(_outcome_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE outcome private.wa_payment_outcomes; integration public.integrations; ordered public.orders;
  receipt private.order_payment_verifications; integrity jsonb; shipment public.shipments; inserted boolean:=true;
  failure text; v_environment text;
BEGIN
  SELECT * INTO outcome FROM private.wa_payment_outcomes WHERE id=_outcome_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='payment_outcome_missing'; END IF;
  IF outcome.input_snapshot#>>'{shipa,dispatch_mode}' IS DISTINCT FROM 'automatic_after_payment'
    OR outcome.input_snapshot#>>'{whatsapp,manual_only}' IS DISTINCT FROM 'false'
    OR outcome.input_snapshot#>>'{shipa,decision}' NOT IN ('enqueued','integrity_hold') THEN RETURN NULL; END IF;
  SELECT * INTO STRICT integration FROM public.integrations WHERE provider='shipa' FOR SHARE;
  IF integration.id::text IS DISTINCT FROM outcome.input_snapshot#>>'{shipa,integration_id}' THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_recorded_integration_changed';
  END IF;
  SELECT * INTO ordered FROM public.orders WHERE id=outcome.order_id FOR UPDATE;
  IF ordered.payment_status<>'paid' OR ordered.order_status IN ('cancelled','delivered') THEN RETURN NULL; END IF;
  receipt:=private.shipa_require_paid_receipt(ordered);
  v_environment:=outcome.input_snapshot#>>'{shipa,environment}';
  integrity:=private.shipa_automatic_integrity(ordered.id,v_environment);
  failure:=CASE WHEN NOT private.shipa_paid_items_match(ordered.id) THEN 'paid_items_changed'
    WHEN receipt.dispatch_decision='integrity_hold' THEN 'recorded_integrity_hold'
    WHEN integrity->>'accepted'<>'true' THEN 'integrity_requires_review' END;
  INSERT INTO public.shipments(order_id,integration_id,environment,source,state,customer_ref,input_fingerprint,last_error_code)
    VALUES(ordered.id,integration.id,v_environment,'automatic',CASE WHEN failure IS NULL THEN 'queued' ELSE 'needs_review' END,
      'CM-'||gen_random_uuid()::text,integrity->>'input_fingerprint',failure)
    ON CONFLICT(order_id,provider,environment) DO NOTHING RETURNING * INTO shipment;
  IF NOT FOUND THEN
    inserted:=false;
    SELECT * INTO shipment FROM public.shipments WHERE order_id=ordered.id AND provider='shipa' AND environment=v_environment FOR UPDATE;
  END IF;
  RETURN private.shipa_dispatch_summary(shipment,inserted);
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_adopt_review(p_order public.orders,p_integration public.integrations,
  p_request jsonb,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE shipment public.shipments; changed boolean; fingerprint text:=p_request->>'expectedInputFingerprint';
BEGIN
  INSERT INTO public.shipments(order_id,integration_id,environment,source,state,customer_ref)
    VALUES(p_order.id,p_integration.id,p_request->>'environment','manual','needs_review','CM-'||gen_random_uuid()::text)
    ON CONFLICT(order_id,provider,environment) DO NOTHING;
  SELECT * INTO shipment FROM public.shipments WHERE order_id=p_order.id AND provider='shipa'
    AND environment=p_request->>'environment' FOR UPDATE;
  IF shipment.state NOT IN ('queued','needs_review','rejected') OR private.shipa_has_possible_dispatch(shipment) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_possible_dispatch_requires_reconciliation';
  END IF;
  changed:=shipment.source<>'manual' OR shipment.state<>'queued' OR shipment.overrides IS DISTINCT FROM p_request->'overrides'
    OR shipment.reviewed_by IS DISTINCT FROM p_actor OR shipment.review_reason IS DISTINCT FROM btrim(p_request->>'reviewReason')
    OR shipment.reviewed_fingerprint IS DISTINCT FROM fingerprint;
  IF changed THEN
    UPDATE public.shipments SET source='manual',state='queued',overrides=p_request->'overrides',reviewed_by=p_actor,
      review_reason=btrim(p_request->>'reviewReason'),reviewed_fingerprint=fingerprint,
      input_fingerprint=fingerprint,last_error_code=NULL,updated_at=clock_timestamp()
      WHERE id=shipment.id RETURNING * INTO shipment;
  END IF;
  INSERT INTO private.shipa_reviews(shipment_id,actor_id,input_fingerprint,settings_revision,reason,pricing_acknowledged,overrides)
    VALUES(shipment.id,p_actor,fingerprint,p_integration.revision,btrim(p_request->>'reviewReason'),
      (p_request->>'acknowledgePricing')::boolean,p_request->'overrides') ON CONFLICT DO NOTHING;
  RETURN private.shipa_dispatch_summary(shipment,changed);
END
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_request_manual(_order_id uuid,_request jsonb,_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE integration public.integrations; ordered public.orders; integrity jsonb; v_environment text;
BEGIN
  PERFORM private.shipa_require_admin(_actor_id);
  PERFORM private.shipa_review_request(_request);
  PERFORM private.shipa_require_ordering_open();
  SELECT * INTO STRICT integration FROM public.integrations WHERE provider='shipa' FOR SHARE;
  v_environment:=_request->>'environment';
  IF NOT integration.enabled OR integration.environment<>v_environment THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_integration_ineligible';
  END IF;
  IF integration.revision<>(_request->>'expectedSettingsRevision')::integer THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_settings_changed';
  END IF;
  SELECT * INTO ordered FROM public.orders WHERE id=_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='shipa_order_missing'; END IF;
  PERFORM private.shipa_require_paid_receipt(ordered);
  integrity:=public.shipa_check_integrity(_order_id,jsonb_build_object('environment',v_environment,'overrides',_request->'overrides'));
  IF integrity->>'input_fingerprint' IS DISTINCT FROM _request->>'expectedInputFingerprint' THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shipa_review_changed';
  END IF;
  IF NOT private.shipa_paid_items_match(ordered.id) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shipa_paid_items_changed';
  END IF;
  PERFORM private.shipa_require_reviewable_integrity(integrity,_request);
  RETURN private.shipa_adopt_review(ordered,integration,_request,_actor_id);
END
$fn$;

-- Replaces only the new strict-evidence helper. Its receipt and eligible intent
-- now commit atomically; old deployed payment handlers do not call this helper.
CREATE OR REPLACE FUNCTION private.integration_verified_shipa_receipt(p_outcome private.wa_payment_outcomes,
  p_evidence private.wa_payment_evidence,p_order public.orders,p_pending private.wa_pending_payment_verifications)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE decision text:=p_outcome.input_snapshot#>>'{shipa,decision}'; receipt private.order_payment_verifications;
BEGIN
  IF decision='enqueued' AND (p_order.payment_status<>'paid' OR p_order.order_status='cancelled'
    OR p_pending.first_seen<=clock_timestamp()-interval '24 hours') THEN decision:='integrity_hold'; END IF;
  INSERT INTO private.order_payment_verifications(order_id,outcome_id,provider,payment_attempt_id,invoice_id,payment_id,
    amount_millis,currency,source,dispatch_decision)
    VALUES(p_order.id,p_outcome.id,'myfatoorah',p_evidence.attempt_id,p_evidence.invoice_id,p_evidence.transaction_payment_id,
      (p_evidence.amount*1000)::bigint,p_evidence.currency,CASE
        WHEN p_outcome.input_snapshot->>'entrypoint'='admin_verification' THEN 'manual_reverification'
        WHEN p_outcome.source='signed_webhook' THEN 'webhook' ELSE 'callback' END,decision)
    ON CONFLICT(order_id) DO NOTHING;
  SELECT * INTO receipt FROM private.order_payment_verifications WHERE order_id=p_order.id;
  IF receipt.outcome_id IS DISTINCT FROM p_outcome.id OR receipt.payment_attempt_id IS DISTINCT FROM p_evidence.attempt_id
    OR receipt.invoice_id IS DISTINCT FROM p_evidence.invoice_id OR receipt.payment_id IS DISTINCT FROM p_evidence.transaction_payment_id
    OR receipt.amount_millis IS DISTINCT FROM (p_evidence.amount*1000)::bigint OR receipt.currency IS DISTINCT FROM p_evidence.currency THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='immutable_shipa_payment_evidence_conflict';
  END IF;
  PERFORM public.shipa_enqueue_automatic(p_outcome.id);
END
$fn$;

REVOKE ALL ON FUNCTION public.shipa_enqueue_automatic(uuid),public.shipa_request_manual(uuid,jsonb,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shipa_enqueue_automatic(uuid),public.shipa_request_manual(uuid,jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION private.shipa_require_paid_receipt(public.orders),private.shipa_paid_items_match(uuid),
  private.shipa_has_possible_dispatch(public.shipments),private.shipa_require_ordering_open(),private.shipa_review_request(jsonb),
  private.shipa_require_reviewable_integrity(jsonb,jsonb),private.shipa_adopt_review(public.orders,public.integrations,jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
