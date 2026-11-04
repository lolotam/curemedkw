-- Inert-schema and actual-role activation proof; synthetic transaction rolls back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('92000000-0000-4000-8000-000000000001','invoice-guard@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES ('92000000-0000-4000-8000-000000000001','admin');
INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,subtotal,total,payment_method)
  VALUES ('92000000-0000-4000-8000-000000000002','Synthetic','invoice@example.test','50000001',20,20,'pay_by_link');
INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id) VALUES
  ('92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002',20,'guard-a','guard-invoice'),
  ('92000000-0000-4000-8000-000000000004','92000000-0000-4000-8000-000000000002',20,'guard-b','guard-invoice');
INSERT INTO public.order_items(order_id,product_name_snapshot,quantity,unit_price,line_total)
  VALUES ('92000000-0000-4000-8000-000000000002','Synthetic retained item',1,20,20);
DO $inert$
BEGIN
  IF to_regclass('public.integration_myfatoorah_invoice_unique') IS NOT NULL OR EXISTS(
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.payment_attempts'::regclass
      AND tgname IN ('integration_invoice_identity_guard','integration_invoice_truncate_guard')) THEN
    RAISE EXCEPTION 'Schema armed an existing payment table';
  END IF;
  IF has_function_privilege('anon','public.integration_activate_invoice_guard(uuid)','EXECUTE') OR
    has_function_privilege('authenticated','public.integration_activate_invoice_guard(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Browser acquired activation authority';
  END IF;
END
$inert$;
SET LOCAL ROLE anon;
DO $browser$
BEGIN
  BEGIN
    PERFORM public.integration_activate_invoice_guard('92000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Browser executed activation';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$browser$;
RESET ROLE;
CREATE INDEX integration_myfatoorah_invoice_unique ON public.payment_attempts(payment_id);
SET LOCAL ROLE service_role;
DO $drift$
BEGIN
  BEGIN
    PERFORM public.integration_activate_invoice_guard('92000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Wrong index definition was accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'payment_invoice_guard_definition_mismatch' THEN RAISE; END IF;
  END;
END
$drift$;
RESET ROLE;
DROP INDEX public.integration_myfatoorah_invoice_unique;
SET LOCAL ROLE service_role;
DO $duplicate_gate$
BEGIN
  BEGIN
    PERFORM public.integration_activate_invoice_guard('92000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'Unknown actor activated invoice protection';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.integration_activate_invoice_guard('92000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Duplicate bindings were silently accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'payment_invoice_guard_requires_unique_bindings' THEN RAISE; END IF;
  END;
END
$duplicate_gate$;
-- This deletion demonstrates unchanged baseline behavior before activation.
DELETE FROM public.payment_attempts WHERE id='92000000-0000-4000-8000-000000000004';
INSERT INTO public.payment_attempts(order_id,amount,idempotency_key,invoice_id)
  VALUES ('92000000-0000-4000-8000-000000000002',0,'guard-invalid-existing','guard-invalid-existing');
DO $invalid_history$
BEGIN
  BEGIN
    PERFORM public.integration_activate_invoice_guard('92000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Invalid existing bindings were silently accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM<>'payment_invoice_guard_requires_valid_bindings' THEN RAISE; END IF;
  END;
END
$invalid_history$;
DELETE FROM public.payment_attempts WHERE idempotency_key='guard-invalid-existing';
DO $activation$
DECLARE first_result jsonb; replay jsonb; field text;
BEGIN
  first_result:=public.integration_activate_invoice_guard('92000000-0000-4000-8000-000000000001');
  replay:=public.integration_activate_invoice_guard('92000000-0000-4000-8000-000000000001');
  IF first_result<>'{"invoice_guard_ready":true,"changed":true}'::jsonb OR
    replay<>'{"invoice_guard_ready":true,"changed":false}'::jsonb THEN
    RAISE EXCEPTION 'Activation was not explicit and idempotent';
  END IF;
  UPDATE public.payment_attempts SET status='pending',payment_id='synthetic-payment',
    payment_url='https://example.test/synthetic' WHERE id='92000000-0000-4000-8000-000000000003';
  FOREACH field IN ARRAY ARRAY['amount','currency','order_id','invoice_id','provider','id','idempotency_key'] LOOP
    BEGIN
      EXECUTE CASE field
        WHEN 'amount' THEN 'UPDATE public.payment_attempts SET amount=21'
        WHEN 'currency' THEN 'UPDATE public.payment_attempts SET currency=''USD'''
        WHEN 'order_id' THEN 'UPDATE public.payment_attempts SET order_id=NULL'
        WHEN 'invoice_id' THEN 'UPDATE public.payment_attempts SET invoice_id=NULL'
        WHEN 'provider' THEN 'UPDATE public.payment_attempts SET provider=''other'''
        WHEN 'id' THEN 'UPDATE public.payment_attempts SET id=''92000000-0000-4000-8000-000000000099'''
        ELSE 'UPDATE public.payment_attempts SET idempotency_key=''changed-key'''
      END || ' WHERE id=''92000000-0000-4000-8000-000000000003''';
      RAISE EXCEPTION 'Mutable invoice identity field: %',field;
    EXCEPTION WHEN serialization_failure THEN
      IF SQLERRM<>'payment_invoice_identity_immutable' THEN RAISE; END IF;
    END;
  END LOOP;
  BEGIN
    DELETE FROM public.payment_attempts WHERE id='92000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'Assigned invoice could be deleted and reassigned';
  EXCEPTION WHEN serialization_failure THEN
    IF SQLERRM<>'payment_invoice_identity_retained' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.orders WHERE id='92000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'Cascading deletion removed an assigned invoice';
  EXCEPTION WHEN serialization_failure THEN
    IF SQLERRM<>'payment_invoice_identity_retained' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.order_items WHERE order_id='92000000-0000-4000-8000-000000000002')<>1
    OR NOT EXISTS(SELECT 1 FROM public.orders WHERE id='92000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'Rejected deletion lost the order or its retained line items';
  END IF;
  BEGIN
    TRUNCATE public.payment_attempts;
    RAISE EXCEPTION 'Table truncate bypassed invoice identity retention';
  EXCEPTION WHEN serialization_failure THEN
    IF SQLERRM<>'payment_invoice_identity_retained' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.payment_attempts(order_id,amount,idempotency_key,invoice_id)
      VALUES ('92000000-0000-4000-8000-000000000002',20,'guard-duplicate','guard-invoice');
    RAISE EXCEPTION 'Duplicate provider invoice inserted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key)
    VALUES ('92000000-0000-4000-8000-000000000005','92000000-0000-4000-8000-000000000002',20,'guard-unassigned');
  UPDATE public.payment_attempts SET invoice_id='guard-first-assignment'
    WHERE id='92000000-0000-4000-8000-000000000005';
  BEGIN
    INSERT INTO public.payment_attempts(order_id,amount,idempotency_key,invoice_id)
      VALUES ('92000000-0000-4000-8000-000000000002',20,'guard-invalid',' untrimmed ');
    RAISE EXCEPTION 'Invalid invoice identity inserted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  INSERT INTO public.payment_attempts(order_id,provider,amount,idempotency_key,invoice_id)
    VALUES ('92000000-0000-4000-8000-000000000002','other',20,'guard-other-provider','guard-invoice');
  DELETE FROM public.payment_attempts WHERE idempotency_key='guard-other-provider';
END
$activation$;
ROLLBACK;
