BEGIN;
INSERT INTO auth.users(id,email) VALUES('8a000000-0000-4000-8000-000000000001','orders-wa@example.test'),
  ('8a000000-0000-4000-8000-000000000002','shopper-wa@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('8a000000-0000-4000-8000-000000000001','admin');
-- Orders: paid in English, unusable number, and four to be delivered (no language recorded).
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,subtotal,total,payment_method,language)
VALUES
  ('8a000000-0000-4000-8000-0000000000a1','Sara','a@example.test','+96550000101','Hawally','Hawally','Street',12.5,12.5,'pay_by_link','en'),
  ('8a000000-0000-4000-8000-0000000000a2','Bad number','b@example.test','not a phone','Hawally','Hawally','Street',5,5,'pay_by_link',NULL),
  ('8a000000-0000-4000-8000-0000000000a3','Mona','c@example.test','50000103','Hawally','Hawally','Street',7,7,'pay_by_link',NULL),
  ('8a000000-0000-4000-8000-0000000000a4','Returned','d@example.test','50000104','Hawally','Hawally','Street',7,7,'pay_by_link',NULL),
  ('8a000000-0000-4000-8000-0000000000a5','Later follow-up','e@example.test','50000105','Hawally','Hawally','Street',7,7,'pay_by_link',NULL),
  ('8a000000-0000-4000-8000-0000000000a6','Disabled tab','f@example.test','50000106','Hawally','Hawally','Street',7,7,'pay_by_link',NULL);
DELETE FROM public.site_settings WHERE key IN ('order_whatsapp','order_email');
INSERT INTO public.site_settings(key,value) VALUES('order_email','{"storefront_url":"https://shop.example.test/"}');

DO $proof$
DECLARE
  a uuid:='8a000000-0000-4000-8000-0000000000a1'; b uuid:='8a000000-0000-4000-8000-0000000000a2';
  c uuid:='8a000000-0000-4000-8000-0000000000a3'; d uuid:='8a000000-0000-4000-8000-0000000000a4';
  e uuid:='8a000000-0000-4000-8000-0000000000a5'; f uuid:='8a000000-0000-4000-8000-0000000000a6';
  receipt jsonb; claimed jsonb; message jsonb;
BEGIN
  -- With no saved settings the tab is off: nothing is queued and the caller keeps the legacy message.
  receipt:=public.owa_enqueue_confirmation(a);
  IF receipt<>'{"enabled":false,"queued":false}' OR EXISTS (SELECT 1 FROM public.order_whatsapp_messages WHERE order_id=a) THEN
    RAISE EXCEPTION 'Disabled tab queued a confirmation: %',receipt; END IF;
  -- A delivery made while the tab is off is queued, then skipped when claimed.
  UPDATE public.orders SET order_status='delivered' WHERE id=f;
  claimed:=public.owa_claim_due(10);
  IF jsonb_array_length(claimed->'messages')<>0
      OR (SELECT status||':'||reason FROM public.order_whatsapp_messages WHERE order_id=f AND kind='delivery')<>'skipped:disabled' THEN
    RAISE EXCEPTION 'Disabled tab sent or kept a delivery message: %',claimed; END IF;

  INSERT INTO public.site_settings(key,value) VALUES('order_whatsapp',
    '{"enabled":true,"language":"order","follow_up_days":3,"templates":{"delivery_ar":"وصل طلبك"}}');
  receipt:=public.owa_enqueue_confirmation(a);
  PERFORM public.owa_enqueue_confirmation(a);
  IF receipt<>'{"enabled":true,"queued":true}'
      OR (SELECT count(*) FROM public.order_whatsapp_messages WHERE order_id=a)<>1
      OR (SELECT recipient FROM public.order_whatsapp_messages WHERE order_id=a)<>'96550000101' THEN
    RAISE EXCEPTION 'Confirmation not queued exactly once with a normalized number: %',receipt; END IF;
  PERFORM public.owa_enqueue_confirmation(b);
  IF (SELECT status||':'||reason FROM public.order_whatsapp_messages WHERE order_id=b)<>'skipped:invalid_phone' THEN
    RAISE EXCEPTION 'An unusable number was queued'; END IF;

  -- The order's own language is used, the tokens are filled and the saved templates are returned.
  claimed:=public.owa_claim_due(10);
  message:=claimed->'messages'->0;
  IF jsonb_array_length(claimed->'messages')<>1 OR message->>'kind'<>'confirmation' OR message->>'language'<>'en'
      OR message->'tokens'->>'total'<>'12.500' OR message->'tokens'->>'order_url' NOT LIKE 'https://shop.example.test/order/%'
      OR claimed->'templates'->>'delivery_ar'<>'وصل طلبك' THEN
    RAISE EXCEPTION 'Unexpected claim: %',claimed; END IF;
  IF jsonb_array_length(public.owa_claim_due(10)->'messages')<>0 THEN RAISE EXCEPTION 'A sending message was claimed twice'; END IF;
  IF NOT public.owa_finish((message->>'id')::uuid,'sent','Thanks','wa-1') OR public.owa_finish((message->>'id')::uuid,'uncertain','',NULL) THEN
    RAISE EXCEPTION 'Finish did not record exactly once'; END IF;

  -- An administrator marking an order delivered stamps it and queues delivery and follow-up messages.
  PERFORM set_config('request.jwt.claim.sub','8a000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('request.jwt.claims','{"sub":"8a000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  UPDATE public.orders SET order_status='delivered' WHERE id IN (c,d,e);
  IF (SELECT count(*) FROM public.order_whatsapp_messages)<6 THEN RAISE EXCEPTION 'Admin cannot read the message log'; END IF;
  RESET ROLE;
  IF (SELECT delivered_at FROM public.orders WHERE id=c) IS NULL
      OR (SELECT count(*) FROM public.order_whatsapp_messages WHERE order_id=c AND status='pending')<>2 THEN
    RAISE EXCEPTION 'Delivery did not queue two messages'; END IF;

  -- Re-marking an order delivered never queues again or moves the delivery time.
  UPDATE public.orders SET order_status='processing' WHERE id=c;
  UPDATE public.orders SET order_status='delivered',delivered_at=delivered_at WHERE id=c;
  IF (SELECT count(*) FROM public.order_whatsapp_messages WHERE order_id=c)<>2 THEN RAISE EXCEPTION 'Delivery queued twice'; END IF;

  -- Delivery messages are due at once and follow-ups are not; an order without a recorded language gets
  -- Arabic, and an order that is no longer delivered is skipped instead of sent.
  UPDATE public.orders SET order_status='cancelled' WHERE id=d;
  claimed:=public.owa_claim_due(10);
  IF jsonb_array_length(claimed->'messages')<>2
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(claimed->'messages') m WHERE m->>'kind'<>'delivery' OR m->>'language'<>'ar')
      OR (SELECT count(*) FROM public.order_whatsapp_messages WHERE order_id IN (c,e) AND kind='delivery' AND status='sending')<>2 THEN
    RAISE EXCEPTION 'Unexpected delivery claim: %',claimed; END IF;
  IF (SELECT status||':'||reason FROM public.order_whatsapp_messages WHERE order_id=d AND kind='delivery')<>'skipped:not_delivered' THEN
    RAISE EXCEPTION 'A cancelled order got a delivery message'; END IF;

  -- The follow-up becomes due follow_up_days after delivery, and an explicit language setting wins.
  UPDATE public.orders SET delivered_at=clock_timestamp()-interval '3 days 1 minute' WHERE id=c;
  UPDATE public.site_settings SET value=value||'{"language":"en","follow_up_enabled":false}' WHERE key='order_whatsapp';
  claimed:=public.owa_claim_due(10);
  IF jsonb_array_length(claimed->'messages')<>0
      OR (SELECT status||':'||reason FROM public.order_whatsapp_messages WHERE order_id=c AND kind='follow_up')<>'skipped:disabled' THEN
    RAISE EXCEPTION 'A switched-off follow-up was not skipped: %',claimed; END IF;
  UPDATE public.site_settings SET value=value||'{"follow_up_enabled":true}' WHERE key='order_whatsapp';
  UPDATE public.orders SET delivered_at=clock_timestamp()-interval '3 days 1 minute' WHERE id=e;
  claimed:=public.owa_claim_due(10);
  IF jsonb_array_length(claimed->'messages')<>1 OR claimed->'messages'->0->>'kind'<>'follow_up'
      OR claimed->'messages'->0->>'language'<>'en'
      OR (SELECT status FROM public.order_whatsapp_messages WHERE order_id=e AND kind='follow_up')<>'sending' THEN
    RAISE EXCEPTION 'Unexpected follow-up claim: %',claimed; END IF;

  -- A send left in 'sending' is never retried, and a message more than a day past due expires.
  UPDATE public.order_whatsapp_messages SET updated_at=clock_timestamp()-interval '11 minutes' WHERE status='sending';
  UPDATE public.order_whatsapp_messages SET status='pending',created_at=clock_timestamp()-interval '25 hours' WHERE order_id=b;
  claimed:=public.owa_claim_due(10);
  IF jsonb_array_length(claimed->'messages')<>0
      OR EXISTS (SELECT 1 FROM public.order_whatsapp_messages WHERE status='sending')
      OR (SELECT status FROM public.order_whatsapp_messages WHERE order_id=b)<>'expired'
      OR (SELECT count(*) FROM public.order_whatsapp_messages WHERE status='uncertain' AND reason='send_uncertain')<>3 THEN
    RAISE EXCEPTION 'Stale sends or overdue messages were not closed: %',claimed; END IF;

  -- Customers cannot read the log; the browser roles cannot run the worker functions.
  PERFORM set_config('request.jwt.claim.sub','8a000000-0000-4000-8000-000000000002',true);
  PERFORM set_config('request.jwt.claims','{"sub":"8a000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.order_whatsapp_messages)<>0 THEN RAISE EXCEPTION 'A customer can read the message log'; END IF;
  RESET ROLE;
  IF has_function_privilege('authenticated','public.owa_claim_due(integer)','EXECUTE')
      OR has_function_privilege('anon','public.owa_enqueue_confirmation(uuid)','EXECUTE')
      OR has_function_privilege('authenticated','public.owa_finish(uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'A browser role can execute a worker function'; END IF;
  IF has_table_privilege('authenticated','public.order_whatsapp_messages','INSERT') THEN
    RAISE EXCEPTION 'authenticated can write the message log'; END IF;
END
$proof$;
ROLLBACK;
