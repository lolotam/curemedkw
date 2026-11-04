-- Canonical server bindings and bounded candidate selection, not a claim or
-- dispatch authorization. Begin-submission remains the only send authority.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,24);

CREATE OR REPLACE FUNCTION private.shipa_dispatch_binding(p_shipment public.shipments)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('shipment_id',p_shipment.id,'order_id',p_shipment.order_id,
    'integration_id',p_shipment.integration_id,'environment',p_shipment.environment)
$fn$;

-- INTERNAL service operation. The route/worker must authenticate first. No
-- browser-supplied integration/environment binding is accepted as authority.
-- This lookup is read-only; shipa_read_shipment is a separate MUTATING read.
CREATE OR REPLACE FUNCTION public.shipa_resolve_dispatch_binding(_shipment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE shipment public.shipments;
BEGIN
  IF _shipment_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_shipment_required';
  END IF;
  SELECT s.* INTO shipment FROM public.shipments s JOIN public.integrations i ON i.id=s.integration_id
    WHERE s.id=_shipment_id AND s.provider='shipa' AND i.provider='shipa';
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN private.shipa_dispatch_binding(shipment);
END
$fn$;

-- Read-only selection may return the same candidates to concurrent workers.
-- It creates no marker/token/lease, changes no state, and records no heartbeat.
-- Filter before LIMIT so old paused/future/ineligible work cannot starve due
-- manual work or work in the current automatic mode and environment.
CREATE OR REPLACE FUNCTION public.shipa_select_dispatch_candidates(_limit integer DEFAULT 3,_shipment_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE candidates jsonb;
BEGIN
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_candidate_limit';
  END IF;
  SELECT coalesce(jsonb_agg(private.shipa_dispatch_binding(due.shipment) ORDER BY due.created_at,due.id),'[]'::jsonb)
    INTO candidates FROM (
      SELECT s AS shipment,s.created_at,s.id FROM public.shipments s
      JOIN public.integrations i ON i.id=s.integration_id AND i.provider='shipa'
      JOIN public.orders o ON o.id=s.order_id
      JOIN private.order_payment_verifications r ON r.order_id=o.id
      JOIN private.wa_payment_evidence e ON e.outcome_id=r.outcome_id AND e.order_id=o.id
        AND e.attempt_id=r.payment_attempt_id AND e.invoice_id=r.invoice_id
        AND e.transaction_payment_id=r.payment_id AND e.currency=r.currency
        AND r.amount_millis=(e.amount*1000)::bigint AND e.amount=o.total
      WHERE s.provider='shipa' AND (_shipment_id IS NULL OR s.id=_shipment_id)
        AND i.enabled AND i.environment=s.environment AND s.state='queued'
        AND (s.source='manual' OR i.dispatch_mode='automatic_after_payment')
        AND (s.retry_at IS NULL OR s.retry_at<=statement_timestamp())
        AND NOT private.shipa_has_possible_dispatch(s)
        AND o.payment_status='paid' AND o.payment_currency='KWD' AND e.currency='KWD'
        AND o.order_status NOT IN ('cancelled','delivered')
        AND EXISTS(SELECT 1 FROM private.integration_payment_release WHERE singleton AND retention_ready)
        AND EXISTS(SELECT 1 FROM public.site_settings WHERE key='ecommerce_mode'
          AND value->'shoppingEnabled'='true'::jsonb AND value->'checkoutEnabled'='true'::jsonb)
        AND (s.source<>'manual' OR EXISTS(SELECT 1 FROM private.shipa_reviews review
          WHERE review.shipment_id=s.id AND review.actor_id=s.reviewed_by
            AND review.input_fingerprint=s.reviewed_fingerprint AND review.reason=s.review_reason))
      ORDER BY s.created_at,s.id LIMIT _limit
    ) due;
  RETURN candidates;
END
$fn$;

REVOKE ALL ON FUNCTION private.shipa_dispatch_binding(public.shipments) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.shipa_resolve_dispatch_binding(uuid),public.shipa_select_dispatch_candidates(integer,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.shipa_resolve_dispatch_binding(uuid),public.shipa_select_dispatch_candidates(integer,uuid)
  TO service_role;
COMMIT;
