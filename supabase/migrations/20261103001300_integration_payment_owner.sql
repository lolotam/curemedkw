-- Shared first-success owner for WhatsApp and Shipa. Schema application is
-- inert beside old payment writers; activation and handler cutover are separate.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,13);

CREATE TABLE IF NOT EXISTS private.integration_payment_release (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  retention_ready boolean NOT NULL DEFAULT false,
  activated_at timestamptz
);
INSERT INTO private.integration_payment_release(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS private.integration_invoice_bindings (
  invoice_id text PRIMARY KEY CHECK(length(invoice_id) BETWEEN 1 AND 200),
  attempt_id uuid NOT NULL UNIQUE,
  order_id uuid NOT NULL,
  amount numeric(12,3) NOT NULL CHECK(amount>0 AND amount<>'NaN'::numeric),
  currency text NOT NULL CHECK(currency='KWD'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.integration_payment_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.integration_invoice_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.integration_payment_release,private.integration_invoice_bindings
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.integration_activate_payment_retention(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE link record;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  PERFORM pg_advisory_xact_lock(20261103,2);
  PERFORM 1 FROM public.whatsapp_settings WHERE singleton FOR UPDATE;
  PERFORM 1 FROM public.integrations WHERE provider='shipa' FOR UPDATE;
  IF EXISTS(SELECT 1 FROM private.integration_payment_release WHERE singleton AND retention_ready) THEN
    RETURN jsonb_build_object('retention_ready',true,'changed',false);
  END IF;
  IF EXISTS(SELECT 1 FROM private.integration_invoice_bindings) OR EXISTS(SELECT 1 FROM private.order_payment_verifications) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='payment_retention_requires_quiescent_writers';
  END IF;
  PERFORM public.wa_activate_retention_constraints(p_actor_id);
  FOR link IN SELECT * FROM (VALUES
    ('integration_invoice_bindings','order_id','public','orders'),
    ('integration_invoice_bindings','attempt_id','public','payment_attempts'),
    ('order_payment_verifications','order_id','public','orders'),
    ('order_payment_verifications','payment_attempt_id','public','payment_attempts'),
    ('order_payment_verifications','outcome_id','private','wa_payment_outcomes')
  ) links(child,column_name,parent_schema,parent) LOOP
    EXECUTE format('ALTER TABLE private.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(id) ON DELETE RESTRICT',
      link.child,'integration_retention_'||link.column_name,link.column_name,link.parent_schema,link.parent);
  END LOOP;
  UPDATE private.integration_payment_release SET retention_ready=true,activated_at=clock_timestamp() WHERE singleton;
  RETURN jsonb_build_object('retention_ready',true,'changed',true);
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_payment_status(p_status jsonb,p_source text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE field text; invoice text; transaction text; allowed text[];
BEGIN
  IF p_source IS NULL OR p_source NOT IN ('signed_webhook','verified_callback','admin_verification') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_payment_source';
  END IF;
  allowed:=ARRAY['invoice_id','external_identifier','transaction_payment_id','invoice_status','transaction_status','details'];
  IF p_source<>'signed_webhook' THEN allowed:=allowed||ARRAY['amount_millis','currency']; END IF;
  IF p_source='admin_verification' THEN allowed:=allowed||ARRAY['actor_id']; END IF;
  PERFORM private.wa_check_keys(p_status,allowed);
  IF NOT (p_status ?& allowed) OR octet_length(p_status::text)>8192 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_payment_attestation';
  END IF;
  FOREACH field IN ARRAY ARRAY['invoice_id','external_identifier','invoice_status','transaction_status'] LOOP
    IF jsonb_typeof(p_status->field) IS DISTINCT FROM 'string' OR length(p_status->>field)>200 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_payment_attestation';
    END IF;
  END LOOP;
  IF length(p_status->>'invoice_id')=0 OR (p_status->>'external_identifier') !~*
    '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_payment_identity';
  END IF;
  invoice:=upper(p_status->>'invoice_status'); transaction:=upper(p_status->>'transaction_status');
  IF p_status->'transaction_payment_id'<>'null'::jsonb AND (jsonb_typeof(p_status->'transaction_payment_id') IS DISTINCT FROM 'string'
    OR length(p_status->>'transaction_payment_id')>200) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_payment_identity';
  END IF;
  IF transaction='SUCCESS' OR invoice='PAID' THEN
    IF nullif(p_status->>'transaction_payment_id','') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='successful_transaction_identity_required';
    END IF;
    RETURN 'paid';
  ELSIF transaction='FAILED' THEN RETURN 'payment_failed';
  ELSIF transaction IN ('CANCELED','CANCELLED') THEN RETURN 'payment_cancelled';
  ELSIF invoice='EXPIRED' THEN RETURN 'payment_expired';
  ELSIF transaction IN ('AUTHORIZE','') OR invoice='PENDING' THEN RETURN 'pending_payment';
  END IF;
  RETURN 'pending_status_update';
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_payment_details(p_details jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE field text; document jsonb:='{}';
BEGIN
  PERFORM private.wa_check_keys(p_details,ARRAY['invoice_reference','transaction_id','reference_id','track_id',
    'payment_method','card_brand','card_last4','error_code','error_message']);
  FOR field IN SELECT jsonb_object_keys(p_details) LOOP
    IF p_details->field='null'::jsonb THEN CONTINUE; END IF;
    IF jsonb_typeof(p_details->field) IS DISTINCT FROM 'string' OR length(p_details->>field)>500
      OR (field='card_last4' AND p_details->>field !~ '^[0-9]{4}$') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_payment_details';
    END IF;
    document:=document||jsonb_build_object(field,p_details->field);
  END LOOP;
  RETURN document;
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_bind_invoice(p_order_id uuid,p_attempt_id uuid,p_status jsonb,p_source text)
RETURNS public.payment_attempts LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE attempt public.payment_attempts; binding private.integration_invoice_bindings;
BEGIN
  SELECT * INTO attempt FROM public.payment_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR attempt.provider<>'myfatoorah' OR attempt.order_id IS DISTINCT FROM p_order_id
    OR attempt.invoice_id IS DISTINCT FROM p_status->>'invoice_id'
    OR (p_status->>'external_identifier')::uuid<>p_order_id OR attempt.amount<=0 OR attempt.amount='NaN'::numeric
    OR attempt.currency<>'KWD' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment_attempt_binding_mismatch';
  END IF;
  IF (SELECT count(*) FROM public.payment_attempts WHERE provider='myfatoorah' AND invoice_id=attempt.invoice_id)<>1 THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='payment_invoice_mapping_ambiguous';
  END IF;
  IF p_source<>'signed_webhook' THEN
    IF jsonb_typeof(p_status->'amount_millis') IS DISTINCT FROM 'number'
      OR (p_status->>'amount_millis') !~ '^[1-9][0-9]{0,11}$'
      OR p_status->>'currency' IS DISTINCT FROM 'KWD' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_verified_payment_amount';
    END IF;
    IF (p_status->>'amount_millis')::numeric<>attempt.amount*1000 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verified_payment_amount_mismatch';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM private.integration_invoice_bindings
    WHERE attempt_id=attempt.id AND invoice_id<>attempt.invoice_id) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='immutable_payment_binding_conflict';
  END IF;
  INSERT INTO private.integration_invoice_bindings(invoice_id,attempt_id,order_id,amount,currency)
    VALUES(attempt.invoice_id,attempt.id,attempt.order_id,attempt.amount,attempt.currency) ON CONFLICT(invoice_id) DO NOTHING;
  SELECT * INTO binding FROM private.integration_invoice_bindings WHERE invoice_id=attempt.invoice_id FOR UPDATE;
  IF binding.attempt_id IS DISTINCT FROM attempt.id OR binding.order_id IS DISTINCT FROM attempt.order_id
    OR binding.amount IS DISTINCT FROM attempt.amount OR binding.currency IS DISTINCT FROM attempt.currency THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='immutable_payment_binding_conflict';
  END IF;
  RETURN attempt;
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_whatsapp_snapshot(p_settings public.whatsapp_settings,p_manual_only boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE release private.wa_release_state; legacy jsonb; configuration jsonb; failure text;
BEGIN
  SELECT * INTO release FROM private.wa_release_state WHERE singleton;
  BEGIN
    IF release.state='unmigrated' THEN
      SELECT value INTO legacy FROM public.site_settings WHERE key='whatsapp_integration' FOR SHARE;
      configuration:=private.wa_legacy_config(legacy);
    ELSE
      configuration:=private.wa_validate_config(jsonb_build_object('integration_enabled',p_settings.integration_enabled,
        'automation_enabled',p_settings.automation_enabled,'default_country',p_settings.default_country,
        'audiences',p_settings.audiences,'recipients',p_settings.recipients));
    END IF;
  EXCEPTION WHEN invalid_parameter_value THEN failure:='notification_configuration_invalid';
    WHEN raise_exception THEN
      IF SQLERRM<>'empty_recipient' THEN RAISE; END IF;
      failure:='notification_configuration_invalid';
  END;
  -- Only the normalized nonsecret projection is retained. Never snapshot the
  -- legacy settings row itself: it may still contain its plaintext API key.
  RETURN jsonb_build_object('owner',CASE WHEN p_settings.cutover_version=1 THEN 'durable' ELSE 'legacy' END,
    'provider',CASE WHEN release.state='unmigrated' THEN 'postora' ELSE p_settings.provider END,
    'account_identity',CASE WHEN release.state='unmigrated' THEN NULL ELSE p_settings.account_identity END,
    'settings_revision',p_settings.settings_revision,'integration_enabled',coalesce((configuration->>'integration_enabled')::boolean,false),
    'automation_enabled',coalesce((configuration->>'automation_enabled')::boolean,false),
    'configuration',configuration,'configuration_error',failure,'manual_only',p_manual_only);
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_shipa_snapshot(p_order public.orders,p_source text,p_manual_only boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE settings public.integrations; decision text; integrity jsonb;
BEGIN
  SELECT * INTO STRICT settings FROM public.integrations WHERE provider='shipa';
  decision:=CASE WHEN p_source='admin_verification' THEN 'manual_reverification'
    WHEN p_manual_only AND p_order.order_status='cancelled' THEN 'integrity_hold'
    WHEN p_manual_only THEN 'already_paid_manual_only' WHEN NOT settings.enabled THEN 'disabled'
    WHEN settings.dispatch_mode='manual_after_packing' THEN 'manual_mode' ELSE 'enqueued' END;
  IF decision='enqueued' THEN
    integrity:=private.shipa_automatic_integrity(p_order.id,settings.environment);
    IF NOT (integrity->>'accepted')::boolean THEN decision:='integrity_hold'; END IF;
  END IF;
  RETURN jsonb_build_object('integration_id',settings.id,'environment',settings.environment,
    'settings_revision',settings.revision,'dispatch_mode',settings.dispatch_mode,'decision',decision,'integrity',integrity);
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_order_payment_update(p_order public.orders,p_attempt public.payment_attempts,
  p_status jsonb,p_mapped text)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE details jsonb:=p_status->'details';
BEGIN
  IF p_order.payment_status IN ('paid','refunded','partially_refunded') THEN RETURN false; END IF;
  UPDATE public.orders SET payment_status=p_mapped::public.payment_status,payment_verified_at=clock_timestamp(),
    myfatoorah_invoice_id=p_attempt.invoice_id,myfatoorah_payment_id=coalesce(p_status->>'transaction_payment_id',myfatoorah_payment_id),
    myfatoorah_invoice_reference=coalesce(details->>'invoice_reference',myfatoorah_invoice_reference),
    myfatoorah_transaction_id=coalesce(details->>'transaction_id',myfatoorah_transaction_id),
    myfatoorah_reference_id=coalesce(details->>'reference_id',myfatoorah_reference_id),
    myfatoorah_track_id=coalesce(details->>'track_id',myfatoorah_track_id),
    payment_online_method=coalesce(details->>'payment_method',payment_online_method),
    myfatoorah_card_brand=coalesce(details->>'card_brand',myfatoorah_card_brand),
    myfatoorah_card_last4=coalesce(details->>'card_last4',myfatoorah_card_last4),
    paid_at=CASE WHEN p_mapped='paid' THEN coalesce(paid_at,clock_timestamp()) ELSE paid_at END,
    failed_at=CASE WHEN p_mapped IN ('payment_failed','payment_cancelled','payment_expired') THEN clock_timestamp() ELSE failed_at END,
    order_status=CASE WHEN p_mapped='paid' AND order_status='new' THEN 'confirmed'::public.order_status ELSE order_status END,
    payment_error_code=CASE WHEN p_mapped='paid' THEN NULL ELSE coalesce(details->>'error_code',payment_error_code) END,
    payment_error_message=CASE WHEN p_mapped='paid' THEN NULL ELSE coalesce(details->>'error_message',payment_error_message) END
    WHERE id=p_order.id;
  RETURN true;
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_payment_facts(p_order public.orders,p_attempt public.payment_attempts)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE items jsonb; summary text; storefront text;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'product_id',product_id,'name',product_name_snapshot,
    'quantity',quantity,'unit_price',unit_price,'line_total',line_total) ORDER BY id),'[]'),
    coalesce(string_agg(product_name_snapshot||' ×'||quantity::text,chr(10) ORDER BY id),'') INTO items,summary
    FROM public.order_items WHERE order_id=p_order.id;
  SELECT value->>'storefront_url' INTO storefront FROM public.site_settings WHERE key='order_email';
  IF coalesce(storefront,'') !~ '^https?://[^[:space:]]+$' THEN storefront:=''; END IF;
  RETURN jsonb_build_object('order_id',p_order.id,'order_number',p_order.order_number,'customer_name',p_order.customer_name,
    'customer_phone',p_order.customer_phone,'customer_email',p_order.customer_email,'items',items,'items_summary',summary,
    'amount',p_attempt.amount,'currency',p_attempt.currency,'stored_order_total',p_order.total,
    'invoice_url',CASE WHEN storefront='' THEN '' ELSE rtrim(storefront,'/')||'/order/'||p_order.order_number END);
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_schedule_verification(p_outcome private.wa_payment_outcomes)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE pending private.wa_pending_payment_verifications;
BEGIN
  IF EXISTS(SELECT 1 FROM private.wa_payment_evidence WHERE outcome_id=p_outcome.id) THEN RETURN; END IF;
  INSERT INTO private.wa_pending_payment_verifications(order_id,attempt_id,outcome_id,invoice_id,
    transaction_payment_id,signed_external_identifier,signed_status)
    VALUES(p_outcome.order_id,p_outcome.attempt_id,p_outcome.id,p_outcome.invoice_id,
      p_outcome.transaction_payment_id,p_outcome.order_id::text,'PAID')
    ON CONFLICT(invoice_id,transaction_payment_id) DO NOTHING;
  SELECT * INTO pending FROM private.wa_pending_payment_verifications
    WHERE invoice_id=p_outcome.invoice_id AND transaction_payment_id=p_outcome.transaction_payment_id FOR UPDATE;
  IF pending.order_id IS NULL AND pending.attempt_id IS NULL AND pending.outcome_id IS NULL
    AND lower(pending.signed_external_identifier)=p_outcome.order_id::text AND pending.state='unresolved' THEN
    UPDATE private.wa_pending_payment_verifications SET order_id=p_outcome.order_id,attempt_id=p_outcome.attempt_id,
      outcome_id=p_outcome.id WHERE id=pending.id RETURNING * INTO pending;
  END IF;
  IF pending.order_id IS DISTINCT FROM p_outcome.order_id OR pending.attempt_id IS DISTINCT FROM p_outcome.attempt_id
    OR pending.outcome_id IS DISTINCT FROM p_outcome.id THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='pending_payment_binding_conflict';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION private.integration_record_first_success(p_order public.orders,p_attempt public.payment_attempts,
  p_status jsonb,p_source text)
RETURNS private.wa_payment_outcomes LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE settings public.whatsapp_settings; outcome private.wa_payment_outcomes;
  manual_only boolean; snapshot jsonb; wa jsonb;
BEGIN
  SELECT * INTO STRICT settings FROM public.whatsapp_settings WHERE singleton;
  PERFORM id FROM public.order_items WHERE order_id=p_order.id ORDER BY id FOR SHARE;
  manual_only:=p_order.payment_status IN ('paid','refunded','partially_refunded')
    OR p_order.order_status='cancelled' OR p_source='admin_verification';
  wa:=private.integration_whatsapp_snapshot(settings,manual_only);
  snapshot:=jsonb_build_object('version',1,'entrypoint',p_source,'whatsapp',wa,
    'shipa',private.integration_shipa_snapshot(p_order,p_source,manual_only),'facts',private.integration_payment_facts(p_order,p_attempt));
  INSERT INTO private.wa_payment_outcomes(order_id,attempt_id,invoice_id,transaction_payment_id,source,owner,
    provider,account_identity,settings_revision,integration_enabled,automation_enabled,input_snapshot,
    legacy_expansion_state,safe_reason)
    VALUES(p_order.id,p_attempt.id,p_attempt.invoice_id,p_status->>'transaction_payment_id',
      CASE WHEN p_source='signed_webhook' THEN 'signed_webhook' ELSE 'verified_callback' END,wa->>'owner',wa->>'provider',
      wa->>'account_identity',settings.settings_revision,(wa->>'integration_enabled')::boolean,(wa->>'automation_enabled')::boolean,snapshot,
      CASE WHEN manual_only THEN 'skipped' WHEN wa->>'configuration_error' IS NOT NULL THEN 'enqueue_failed' ELSE 'pending' END,
      CASE WHEN manual_only THEN 'historical_or_manual_only' ELSE wa->>'configuration_error' END) RETURNING * INTO outcome;
  RETURN outcome;
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_record_provider_payment_outcome(p_order_id uuid,p_attempt_id uuid,
  p_provider_status jsonb,p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE ordered public.orders; attempt public.payment_attempts;
  outcome private.wa_payment_outcomes; mapped text; changed boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.integration_payment_release WHERE singleton AND retention_ready) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='shared_payment_activation_required';
  END IF;
  PERFORM private.wa_require_retention();
  mapped:=private.integration_payment_status(p_provider_status,p_source);
  PERFORM private.integration_payment_details(p_provider_status->'details');
  IF p_source='admin_verification' THEN
    IF p_provider_status->>'actor_id' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verified_admin_actor_required';
    END IF;
    PERFORM private.wa_require_admin((p_provider_status->>'actor_id')::uuid);
  END IF;
  PERFORM 1 FROM public.whatsapp_settings WHERE singleton FOR SHARE;
  PERFORM 1 FROM public.integrations WHERE provider='shipa' FOR SHARE;
  SELECT * INTO ordered FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='payment_order_missing'; END IF;
  attempt:=private.integration_bind_invoice(p_order_id,p_attempt_id,p_provider_status,p_source);
  SELECT * INTO outcome FROM private.wa_payment_outcomes WHERE order_id=p_order_id;
  IF mapped='paid' AND outcome.id IS NULL THEN
    outcome:=private.integration_record_first_success(ordered,attempt,p_provider_status,p_source);
  END IF;
  changed:=private.integration_order_payment_update(ordered,attempt,p_provider_status,mapped);
  IF mapped='paid' AND outcome.id IS NOT NULL THEN
    PERFORM private.integration_schedule_verification(outcome);
  END IF;
  SELECT * INTO ordered FROM public.orders WHERE id=p_order_id;
  RETURN jsonb_build_object('outcome_id',outcome.id,'owner_snapshot',outcome.input_snapshot,'changed',changed,
    'payment_status',ordered.payment_status,'order_status',ordered.order_status,
    'verification_pending',outcome.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.wa_payment_evidence WHERE outcome_id=outcome.id));
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_read_payment_owner(p_order_id uuid,p_outcome_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
  SELECT jsonb_build_object('outcome_id',id,'attempt_id',attempt_id,'invoice_id',invoice_id,
    'transaction_payment_id',transaction_payment_id,'source',source,'owner',owner,'provider',provider,'account_identity',account_identity,
    'owner_snapshot',input_snapshot,'legacy_expansion_state',legacy_expansion_state,'safe_reason',safe_reason)
  FROM private.wa_payment_outcomes WHERE order_id=p_order_id AND (p_outcome_id IS NULL OR id=p_outcome_id)
$fn$;

REVOKE ALL ON FUNCTION public.integration_activate_payment_retention(uuid),
  public.wa_record_provider_payment_outcome(uuid,uuid,jsonb,text),public.wa_read_payment_owner(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.integration_activate_payment_retention(uuid),
  public.wa_record_provider_payment_outcome(uuid,uuid,jsonb,text),public.wa_read_payment_owner(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION private.integration_payment_status(jsonb,text),private.integration_payment_details(jsonb),
  private.integration_bind_invoice(uuid,uuid,jsonb,text),private.integration_whatsapp_snapshot(public.whatsapp_settings,boolean),
  private.integration_shipa_snapshot(public.orders,text,boolean),
  private.integration_order_payment_update(public.orders,public.payment_attempts,jsonb,text),
  private.integration_payment_facts(public.orders,public.payment_attempts),
  private.integration_schedule_verification(private.wa_payment_outcomes),
  private.integration_record_first_success(public.orders,public.payment_attempts,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
