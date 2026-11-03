-- Read/lock-only integrity foundation. No payment evidence, shipment intent,
-- submission permission, activation or existing-table enforcement is installed.
CREATE OR REPLACE FUNCTION private.shipa_kuwait_phone(p_phone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE v_phone text:=translate(btrim(p_phone),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789');
BEGIN
  IF v_phone IS NULL OR v_phone !~ '^[+0-9 ().-]+$' THEN RETURN NULL; END IF;
  v_phone:=regexp_replace(v_phone,'[ ().-]','','g');
  IF left(v_phone,2)='00' THEN v_phone:='+'||substr(v_phone,3); END IF;
  IF v_phone ~ '^[0-9]{8}$' THEN v_phone:='+965'||v_phone;
  ELSIF v_phone ~ '^965[0-9]{8}$' THEN v_phone:='+'||v_phone; END IF;
  IF v_phone !~ '^\+965[0-9]{8}$' OR v_phone='+96500000000' THEN RETURN NULL; END IF;
  RETURN v_phone;
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_delivery_snapshot(p_order public.orders,p_config jsonb,p_overrides jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,private AS $fn$
DECLARE v_destination jsonb; v_parcel jsonb; v_field text;
BEGIN
  IF jsonb_typeof(p_overrides) IS DISTINCT FROM 'object' OR p_overrides-ARRAY['destination','parcel']<>'{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_review_snapshot';
  END IF;
  v_destination:=jsonb_build_object('contactName',p_order.customer_name,'contactPhone',p_order.customer_phone,
    'countryCode',p_order.country,'governorate',p_order.governorate,'city',p_order.city,
    'addressLine',p_order.address_line,'area',p_order.area,'block',p_order.block,
    'street',p_order.street,'building',p_order.building);
  IF p_overrides ? 'destination' THEN
    IF jsonb_typeof(p_overrides->'destination') IS DISTINCT FROM 'object'
      OR (p_overrides->'destination')-ARRAY['contactName','contactPhone','countryCode','governorate','city',
        'addressLine','area','block','street','building']<>'{}'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_review_snapshot';
    END IF;
    v_destination:=v_destination||(p_overrides->'destination');
  END IF;
  FOR v_field IN SELECT jsonb_object_keys(v_destination) LOOP
    IF jsonb_typeof(v_destination->v_field) IS DISTINCT FROM 'string'
      OR length(v_destination->>v_field)>1000 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_review_snapshot';
    END IF;
  END LOOP;
  v_destination:=jsonb_set(v_destination,'{contactPhone}',
    coalesce(to_jsonb(private.shipa_kuwait_phone(v_destination->>'contactPhone')),'null'::jsonb));
  v_parcel:=CASE WHEN p_overrides ? 'parcel' THEN p_overrides->'parcel' ELSE p_config->'parcel' END;
  -- Reuse the frozen settings shape; this validates overrides without saving them.
  PERFORM private.shipa_validate_environment(jsonb_set(p_config,'{parcel}',v_parcel));
  RETURN jsonb_build_object('destination',v_destination,'parcel',v_parcel);
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_item_snapshot(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_row record; v_items jsonb; v_count integer:=0; v_sum numeric:=0; v_reasons text[]:='{}';
BEGIN
  -- The caller transaction keeps these locks through enqueue/begin. Parent
  -- FOR UPDATE also conflicts with FK checks on newly inserted order items.
  PERFORM id FROM public.order_items WHERE order_id=p_order_id ORDER BY id FOR SHARE;
  PERFORM p.id FROM public.products p JOIN public.order_items oi ON oi.product_id=p.id
    WHERE oi.order_id=p_order_id ORDER BY p.id FOR SHARE OF p;
  FOR v_row IN SELECT oi.*,p.price AS catalog_price FROM public.order_items oi
    LEFT JOIN public.products p ON p.id=oi.product_id WHERE oi.order_id=p_order_id ORDER BY oi.id LOOP
    v_count:=v_count+1;
    IF v_row.catalog_price IS NULL THEN v_reasons:=array_append(v_reasons,'catalog_missing');
    ELSIF v_row.catalog_price::text='NaN' OR v_row.catalog_price<0
      OR v_row.unit_price IS DISTINCT FROM v_row.catalog_price THEN
      v_reasons:=array_append(v_reasons,'catalog_price_mismatch');
    END IF;
    IF v_row.quantity<=0 OR v_row.unit_price::text='NaN' OR v_row.line_total::text='NaN'
      OR v_row.unit_price<0 OR v_row.line_total<0
      OR v_row.line_total IS DISTINCT FROM round(v_row.quantity::numeric*v_row.unit_price,3) THEN
      v_reasons:=array_append(v_reasons,'item_total_mismatch');
    END IF;
    v_sum:=v_sum+v_row.line_total;
  END LOOP;
  IF v_count=0 THEN v_reasons:=array_append(v_reasons,'items_missing'); END IF;
  SELECT jsonb_agg(jsonb_build_object('id',oi.id,'product_id',oi.product_id,'name',oi.product_name_snapshot,
    'quantity',oi.quantity,'unit_price',oi.unit_price,'line_total',oi.line_total,'catalog_price',p.price,
    'catalog_stock',p.stock_status) ORDER BY oi.id) INTO v_items
    FROM public.order_items oi LEFT JOIN public.products p ON p.id=oi.product_id WHERE oi.order_id=p_order_id;
  RETURN jsonb_build_object('items',coalesce(v_items,'[]'),'sum',v_sum,'reasons',to_jsonb(v_reasons));
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_coupon_snapshot(p_order public.orders)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_coupon public.coupons; v_coupon_facts jsonb:='null'::jsonb; v_discount numeric:=0; v_coupon_eligible boolean:=false; v_reasons text[]:='{}';
BEGIN
  IF nullif(btrim(p_order.coupon_code),'') IS NOT NULL THEN
    -- Row locks cannot fence insertion of a previously missing code. This
    -- short transaction lock also covers that phantom during enqueue/begin.
    LOCK TABLE public.coupons IN SHARE MODE;
    SELECT * INTO v_coupon FROM public.coupons WHERE code=upper(btrim(p_order.coupon_code)) FOR SHARE;
    IF FOUND THEN
      v_coupon_eligible:=v_coupon.is_active AND (v_coupon.expires_at IS NULL OR v_coupon.expires_at>=clock_timestamp())
        AND (v_coupon.max_uses IS NULL OR v_coupon.used_count<v_coupon.max_uses)
        AND p_order.subtotal>=v_coupon.min_order_amount;
      v_coupon_facts:=jsonb_build_object('id',v_coupon.id,'code',v_coupon.code,'type',v_coupon.discount_type,
        'value',v_coupon.discount_value,'minimum',v_coupon.min_order_amount,'max_uses',v_coupon.max_uses,
        'used_count',v_coupon.used_count,'expires_at',v_coupon.expires_at,'active',v_coupon.is_active,
        'eligible_now',v_coupon_eligible);
      v_discount:=CASE WHEN v_coupon.discount_type='percent' THEN round(p_order.subtotal*v_coupon.discount_value/100,3)
        ELSE least(p_order.subtotal,v_coupon.discount_value) END;
    END IF;
    IF NOT v_coupon_eligible THEN v_reasons:=array_append(v_reasons,'coupon_requires_review'); END IF;
  END IF;
  RETURN jsonb_build_object('facts',v_coupon_facts,'discount',v_discount,'reasons',to_jsonb(v_reasons));
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_price_snapshot(p_order public.orders)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_items jsonb; v_coupon jsonb; v_sum numeric; v_discount numeric; v_reasons text[];
BEGIN
  v_items:=private.shipa_item_snapshot(p_order.id);
  v_coupon:=private.shipa_coupon_snapshot(p_order);
  v_sum:=(v_items->>'sum')::numeric; v_discount:=(v_coupon->>'discount')::numeric;
  SELECT coalesce(array_agg(reason),'{}') INTO v_reasons FROM jsonb_array_elements_text((v_items->'reasons')||(v_coupon->'reasons')) reason;
  IF p_order.subtotal::text='NaN' OR p_order.subtotal<0 OR p_order.subtotal IS DISTINCT FROM v_sum THEN
    v_reasons:=array_append(v_reasons,'subtotal_mismatch');
  END IF;
  IF p_order.discount_amount::text='NaN' OR v_discount::text='NaN' OR p_order.discount_amount<0
    OR v_discount<0 OR v_discount>p_order.subtotal OR p_order.discount_amount IS DISTINCT FROM v_discount THEN
    v_reasons:=array_append(v_reasons,'discount_mismatch');
  END IF;
  IF p_order.total::text='NaN' OR p_order.total<=0
    OR p_order.total IS DISTINCT FROM p_order.subtotal-p_order.discount_amount THEN
    v_reasons:=array_append(v_reasons,'order_total_mismatch');
  END IF;
  IF coalesce((to_jsonb(p_order)->>'delivery_fee')::numeric,0)<>0
    OR coalesce((to_jsonb(p_order)->>'tax_amount')::numeric,0)<>0 THEN
    v_reasons:=array_append(v_reasons,'unsupported_fee_or_tax');
  END IF;
  IF p_order.payment_currency<>'KWD' THEN v_reasons:=array_append(v_reasons,'unsupported_currency'); END IF;
  RETURN jsonb_build_object('items',v_items->'items','coupon',v_coupon->'facts','reasons',to_jsonb(v_reasons));
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_delivery_issues(p_delivery jsonb,p_config jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_reasons text[]:='{}';
BEGIN
  IF lower(btrim(p_delivery#>>'{destination,countryCode}')) NOT IN ('kw','kwt','kuwait','الكويت')
    OR nullif(btrim(p_delivery#>>'{destination,contactName}'),'') IS NULL
    OR p_delivery#>'{destination,contactPhone}'='null'::jsonb
    OR nullif(btrim(p_delivery#>>'{destination,governorate}'),'') IS NULL
    OR nullif(btrim(p_delivery#>>'{destination,city}'),'') IS NULL
    OR nullif(btrim(p_delivery#>>'{destination,addressLine}'),'') IS NULL THEN
    v_reasons:=array_append(v_reasons,'destination_incomplete');
  END IF;
  IF nullif(btrim(p_config#>>'{origin,contactName}'),'') IS NULL
    OR private.shipa_kuwait_phone(p_config#>>'{origin,contactPhone}') IS NULL
    OR nullif(btrim(p_config#>>'{origin,address,governorate}'),'') IS NULL
    OR nullif(btrim(p_config#>>'{origin,address,area}'),'') IS NULL
    OR nullif(btrim(p_config#>>'{origin,address,addressLine}'),'') IS NULL
    OR p_config->>'serviceCode' IS NULL THEN v_reasons:=array_append(v_reasons,'origin_or_service_incomplete'); END IF;
  IF p_delivery#>'{parcel,weightKg}'='null'::jsonb OR p_delivery#>'{parcel,dimensionsCm}'='null'::jsonb THEN
    v_reasons:=array_append(v_reasons,'parcel_incomplete');
  END IF;
  RETURN v_reasons;
END
$fn$;

CREATE OR REPLACE FUNCTION private.shipa_input_fingerprint(p_order public.orders,p_integration public.integrations,p_context jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_document jsonb;
BEGIN
  v_document:=jsonb_build_object('version',1,'order_id',p_order.id,'order_number',p_order.order_number,
    'customer_email',p_order.customer_email,'notes',p_order.notes,'subtotal',p_order.subtotal,
    'discount',p_order.discount_amount,'total',p_order.total,'currency',p_order.payment_currency,
    'coupon_code',p_order.coupon_code,'delivery_fee',to_jsonb(p_order)->'delivery_fee',
    'tax_amount',to_jsonb(p_order)->'tax_amount',
    'original_destination',jsonb_build_object('name',p_order.customer_name,'phone',p_order.customer_phone,
      'country',p_order.country,'governorate',p_order.governorate,'city',p_order.city,'address',p_order.address_line,
      'area',p_order.area,'block',p_order.block,'street',p_order.street,'building',p_order.building),
    'delivery',p_context->'delivery','items',p_context#>'{pricing,items}','coupon',p_context#>'{pricing,coupon}',
    'integration_id',p_integration.id,'settings_revision',p_integration.revision,
    'environment',p_context->>'environment','configuration',p_context->'configuration','credential_fingerprint',p_context->>'credential_fingerprint',
    'review_reasons',p_context->'reasons');
  RETURN encode(sha256(convert_to(v_document::text,'UTF8')),'hex');
END
$fn$;

CREATE OR REPLACE FUNCTION public.shipa_check_integrity(_order_id uuid,_review_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_integration public.integrations; v_order public.orders;
  v_config jsonb; v_delivery jsonb; v_pricing jsonb; v_credential_fingerprint text;
  v_environment text; v_overrides jsonb; v_reasons text[]; v_fingerprint text;
BEGIN
  IF _order_id IS NULL OR jsonb_typeof(_review_snapshot) IS DISTINCT FROM 'object'
    OR octet_length(_review_snapshot::text)>16384
    OR NOT (_review_snapshot ? 'environment')
    OR _review_snapshot-ARRAY['environment','overrides']<>'{}'::jsonb
    OR jsonb_typeof(_review_snapshot->'environment') IS DISTINCT FROM 'string'
    OR _review_snapshot->>'environment' NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shipa_invalid_review_snapshot';
  END IF;
  v_environment:=_review_snapshot->>'environment';
  v_overrides:=CASE WHEN _review_snapshot ? 'overrides' THEN _review_snapshot->'overrides' ELSE '{}'::jsonb END;
  SELECT * INTO STRICT v_integration FROM public.integrations WHERE provider='shipa' FOR SHARE;
  SELECT * INTO v_order FROM public.orders WHERE id=_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='shipa_order_missing'; END IF;
  v_config:=v_integration.configuration->v_environment;
  v_delivery:=private.shipa_delivery_snapshot(v_order,v_config,v_overrides);
  v_pricing:=private.shipa_price_snapshot(v_order);
  SELECT coalesce(array_agg(DISTINCT reason ORDER BY reason),'{}') INTO v_reasons
    FROM (SELECT jsonb_array_elements_text(v_pricing->'reasons') reason UNION ALL
      SELECT unnest(private.shipa_delivery_issues(v_delivery,v_config))) reasons;
  SELECT encode(sha256(convert_to(jsonb_build_object('integration_id',c.integration_id,
    'environment',c.environment,'key_version',c.key_version,'nonce',c.nonce,'ciphertext',c.ciphertext)::text,'UTF8')),'hex')
    INTO v_credential_fingerprint FROM private.integration_credentials c
    WHERE c.integration_id=v_integration.id AND c.environment=v_environment FOR SHARE;
  v_fingerprint:=private.shipa_input_fingerprint(v_order,v_integration,jsonb_build_object(
    'environment',v_environment,'configuration',v_config,'delivery',v_delivery,'pricing',v_pricing,
    'credential_fingerprint',v_credential_fingerprint,'reasons',to_jsonb(v_reasons)));
  RETURN jsonb_build_object('accepted',cardinality(v_reasons)=0,'reasons',to_jsonb(v_reasons),
    'input_fingerprint',v_fingerprint,'settings_revision',v_integration.revision);
END
$fn$;

REVOKE ALL ON FUNCTION private.shipa_kuwait_phone(text),
  private.shipa_delivery_snapshot(public.orders,jsonb,jsonb),
  private.shipa_item_snapshot(uuid),private.shipa_coupon_snapshot(public.orders),
  private.shipa_price_snapshot(public.orders),private.shipa_delivery_issues(jsonb,jsonb),
  private.shipa_input_fingerprint(public.orders,public.integrations,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.shipa_check_integrity(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shipa_check_integrity(uuid,jsonb) TO service_role;
