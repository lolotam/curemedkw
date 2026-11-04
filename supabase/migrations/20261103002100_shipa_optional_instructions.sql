-- Keep the SQL draft/wire mapping equal to the real adapter for an optional
-- empty instruction. No settings, review, receipt or begin gate changes.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,21);
CREATE OR REPLACE FUNCTION private.shipa_submission_draft(p_order public.orders,p_config jsonb,p_delivery jsonb,p_reference text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,private AS $fn$
  SELECT jsonb_build_object('customerRef',p_reference,'orderType','Delivery','category',p_config->'serviceCode',
    'autoConfirm',p_config->'autoConfirm','pickupInstructions',CASE WHEN private.wa_blank(p_config->>'pickupInstructions')
      THEN NULL ELSE p_config->>'pickupInstructions' END,
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
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
  SELECT jsonb_build_object('customerRef',p_draft->'customerRef','type',p_draft->'orderType','category',p_draft->'category',
    'autoConfirm',p_draft->'autoConfirm','origin',(p_draft->'origin')||CASE WHEN private.wa_blank(p_draft->>'pickupInstructions')
      THEN '{}'::jsonb ELSE jsonb_build_object('options',jsonb_build_object('specialInstructions',p_draft->'pickupInstructions')) END,
    'destination',(p_draft->'destination')||'{"type":"Doorstep","options":{"amountToCollect":0}}'::jsonb,
    'packages',jsonb_build_array(((p_draft->'package')-ARRAY['weightKg','lengthCm','widthCm','heightCm'])||
      jsonb_build_object('weight',p_draft#>'{package,weightKg}','length',p_draft#>'{package,lengthCm}',
        'width',p_draft#>'{package,widthCm}','height',p_draft#>'{package,heightCm}')))
$fn$;
REVOKE ALL ON FUNCTION private.shipa_submission_draft(public.orders,jsonb,jsonb,text),private.shipa_submission_payload(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
