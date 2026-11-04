-- Actual PostgreSQL codepoint/money/rendering behavior, not a JS renderer.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('90000000-0000-4000-8000-000000000001','render-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('90000000-0000-4000-8000-000000000001','admin');
SET LOCAL ROLE service_role;
DO $preview_contract$
DECLARE actor uuid:='90000000-0000-4000-8000-000000000001'; preview jsonb; draft jsonb;
BEGIN
  draft:='{"audience":"buyer","language":"en","body":"{{total}} {{currency}} {{customer_name}}"}';
  preview:=public.wa_preview_template(draft,'{"sample":true}',actor);
  IF preview->>'status'<>'ok' OR preview->>'rendered'<>'14.005 KWD Sample buyer'
    OR preview->'errors'<>'[]'::jsonb OR preview->>'truncated'<>'false' THEN RAISE EXCEPTION 'Sample preview contract differs from SQL rendering'; END IF;
  preview:=public.wa_preview_template(jsonb_set(draft,'{body}','"Hi {{unknown}}"'),'{"sample":true}',actor);
  IF preview->>'status'<>'invalid' OR preview->'unsupportedTokens'<>'["unknown"]'::jsonb
    OR preview->'rendered'<>'null'::jsonb OR preview#>>'{errors,0,code}'<>'unsupported_template_token' THEN
    RAISE EXCEPTION 'Unsupported token was hidden or rendered'; END IF;
  preview:=public.wa_preview_template(jsonb_set(draft,'{body}',to_jsonb(repeat('🌿',4096))),'{"sample":true}',actor);
  IF preview->>'status'<>'ok' OR (preview->>'codepoints')::integer<>4096 THEN RAISE EXCEPTION 'Unicode codepoints became bytes/UTF16 length'; END IF;
  preview:=public.wa_preview_template(jsonb_set(draft,'{body}',to_jsonb(repeat('🌿',4097))),'{"sample":true}',actor);
  IF preview->>'status'<>'invalid' THEN RAISE EXCEPTION 'Oversized template accepted'; END IF;
  preview:=public.wa_preview_template(jsonb_set(draft,'{body}',to_jsonb(chr(160)||chr(65279)||chr(8195))),'{"sample":true}',actor);
  IF preview#>>'{errors,0,code}'<>'invalid_template_body' THEN RAISE EXCEPTION 'Unicode blank parity differs from shared TS trim'; END IF;
  preview:=public.wa_preview_template(jsonb_set(draft,'{body}',to_jsonb('{{'||chr(160)||'items_summary'||chr(9)||'}}')),'{"sample":true}',actor);
  IF preview->>'rendered'<>'Sample item ×2' THEN RAISE EXCEPTION 'Unicode token whitespace was not rendered consistently'; END IF;
  BEGIN
    PERFORM public.wa_preview_template(draft,'{"sample":true,"amount":0}',actor);
    RAISE EXCEPTION 'Caller replaced trusted preview facts';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.wa_preview_template(draft||'{"audience":null}','{"sample":true}',actor);
    RAISE EXCEPTION 'Null preview audience passed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.wa_preview_template(draft,'{"sample":true}','90000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'Unverified nonadmin actor previewed private facts';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$preview_contract$;
RESET ROLE;
DO $renderer_boundaries$
DECLARE facts jsonb; rendered jsonb; summary jsonb; language text; items jsonb;
BEGIN
  facts:='{"order_number":"R1","customer_name":"{{total}}","customer_phone":"50000001","amount":2.675,"currency":"KWD",
    "invoice_url":"https://example.invalid/order/R1","items":[{"name":"Item {{customer_name}}","quantity":2}]}';
  rendered:=private.wa_render_paid_template('{{customer_name}}|{{total}}|{{order_url}}','en',facts);
  IF rendered->>'body'<>'{{total}}|2.675|https://example.invalid/order/R1' THEN RAISE EXCEPTION 'Facts were reinterpreted or decimal formatting drifted'; END IF;
  rendered:=private.wa_render_paid_template('{{items_summary}}','en',jsonb_set(facts,'{items,0,quantity}','2147483647'));
  IF right(rendered->>'body',12)<>' ×2147483647' THEN RAISE EXCEPTION 'Valid stored integer quantity was lost'; END IF;
  SELECT jsonb_agg(jsonb_build_object('name','Whole item '||i::text||repeat('x',75),'quantity',1) ORDER BY i) INTO items FROM generate_series(1,100) i;
  FOREACH language IN ARRAY ARRAY['en','ar'] LOOP
    rendered:=private.wa_render_paid_template('{{items_summary}}'||chr(10)||'---'||chr(10)||'{{ items_summary }}',language,jsonb_set(facts,'{items}',items));
    IF (rendered->>'codepoints')::integer>4096 OR rendered->>'truncated'<>'true' OR (rendered->>'remaining_items')::integer<1
      OR strpos(rendered->>'body',private.wa_remaining_items((rendered->>'remaining_items')::integer,language))=0 THEN
      RAISE EXCEPTION 'Repeated item token exceeded its reserved/localized budget'; END IF;
  END LOOP;
  rendered:=private.wa_render_paid_template('{{items_summary}}','en',jsonb_set(facts,'{items}',
    jsonb_build_array(jsonb_build_object('name',repeat('ع🌿',5000),'quantity',2))));
  IF (rendered->>'codepoints')::integer<>4096 OR rendered->>'truncated'<>'true'
    OR rendered->>'remaining_items'<>'0' OR right(rendered->>'body',3)<>' ×2' THEN
    RAISE EXCEPTION 'Single long item did not shorten safely while retaining quantity'; END IF;
  BEGIN
    PERFORM private.wa_render_paid_template('{{customer_name}}{{items_summary}}','en',jsonb_set(facts,'{customer_name}',to_jsonb(repeat('x',4096))));
    RAISE EXCEPTION 'No-budget item summary was silently dropped';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM<>'items_summary_budget_exceeded' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM private.wa_render_paid_template('{{customer_name}}{{items_summary}}','en',jsonb_set(facts,'{customer_name}',to_jsonb(repeat('x',4094))));
    RAISE EXCEPTION 'Tiny summary budget discarded quantity and omitted remaining count';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM<>'items_summary_budget_exceeded' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM private.wa_render_paid_template('{{customer_name}}','en',jsonb_set(facts,'{customer_name}',to_jsonb(repeat('x',4097))));
    RAISE EXCEPTION 'Non-item fact overflow was truncated';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM<>'rendered_content_too_long' THEN RAISE; END IF;
  END;
END
$renderer_boundaries$;
SET LOCAL ROLE service_role;
SELECT public.integration_activate_payment_retention('90000000-0000-4000-8000-000000000001');
RESET ROLE;
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,subtotal,total,payment_method)
VALUES('90000000-0000-4000-8000-000000000002','{{total}}','render@example.test','50000001',14.005,14.005,'pay_by_link');
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id)
VALUES('90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002',14.005,'render-attempt','render-invoice');
SET LOCAL ROLE service_role;
SELECT public.wa_record_provider_payment_outcome('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003',
  '{"invoice_id":"render-invoice","external_identifier":"90000000-0000-4000-8000-000000000002","transaction_payment_id":"render-payment",
    "invoice_status":"PAID","transaction_status":"SUCCESS","details":{}}','signed_webhook');
RESET ROLE;
UPDATE public.orders SET customer_name='Changed after payment',total=99 WHERE id='90000000-0000-4000-8000-000000000002';
SET LOCAL ROLE service_role;
DO $immutable_preview$
DECLARE preview jsonb;
BEGIN
  preview:=public.wa_preview_template('{"audience":"admins","language":"en","body":"{{total}}|{{customer_name}}"}',
    '{"order_id":"90000000-0000-4000-8000-000000000002"}','90000000-0000-4000-8000-000000000001');
  IF preview->>'rendered'<>'14.005|{{total}}' THEN RAISE EXCEPTION 'Preview used mutable current order instead of paid facts'; END IF;
END
$immutable_preview$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $browser_denied$
BEGIN
  BEGIN
    PERFORM public.wa_preview_template('{}','{}','90000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Browser called service-only preview';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM private.wa_render_paid_template('text','en','{}');
    RAISE EXCEPTION 'Browser bypassed authoritative renderer boundary';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$browser_denied$;
ROLLBACK;
