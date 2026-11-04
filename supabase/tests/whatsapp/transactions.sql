BEGIN;
DO $foundation$
DECLARE v_signature text; v_pair record; v_phone text;
BEGIN
  IF (SELECT retention_ready FROM private.wa_release_state WHERE singleton) THEN
    RAISE EXCEPTION 'Schema phase accidentally activated retention';
  END IF;
  FOREACH v_signature IN ARRAY ARRAY[
    'private.wa_require_admin(uuid)', 'private.wa_require_retention()',
    'private.wa_fingerprint(jsonb)', 'private.wa_check_keys(jsonb,text[])',
    'private.wa_normalize_phone(text)', 'private.wa_validate_template(text)',
    'private.wa_render_tokens(text,jsonb)', 'public.wa_activate_retention_constraints(uuid)'
    ,'private.wa_default_templates()', 'private.wa_validate_config(jsonb)',
    'private.wa_legacy_config(jsonb)', 'private.wa_guard_legacy_settings()',
    'public.wa_set_compatibility_guard(boolean,bigint,uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Browser can execute protected function: %', v_signature;
    END IF;
  END LOOP;
  FOR v_pair IN SELECT * FROM (VALUES
    ('12345678','96512345678'), ('+12345678','12345678'), ('0012345678','12345678'),
    ('٩٦٥١٢٣٤٥٦٧٨','96512345678'), ('۹۶۵۱۲۳۴۵۶۷۸','96512345678'),
    ('+965 (5000) 1234','96550001234')
  ) AS numbers(raw, expected) LOOP
    IF private.wa_normalize_phone(v_pair.raw) <> v_pair.expected THEN
      RAISE EXCEPTION 'Phone normalization parity failed';
    END IF;
  END LOOP;
  FOREACH v_phone IN ARRAY ARRAY['96512345678 ext 5','++96512345678','965+12345678','01234567','1234567890123456'] LOOP
    BEGIN
      PERFORM private.wa_normalize_phone(v_phone);
      RAISE EXCEPTION 'Invalid phone accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
  FOREACH v_phone IN ARRAY ARRAY['{{{customer_name}}}','{{customer_name}}}','{customer_name}','{{unknown}}'] LOOP
    BEGIN
      PERFORM private.wa_validate_template(v_phone);
      RAISE EXCEPTION 'Invalid template accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
  IF private.wa_render_tokens('Hi {{customer_name}} {{total}}',
      '{"customer_name":"{{total}}","total":"2.000"}'::jsonb) <> 'Hi {{total}} 2.000' THEN
    RAISE EXCEPTION 'Facts were reinterpreted as template code';
  END IF;
END
$foundation$;

INSERT INTO auth.users(id, email) VALUES ('10000000-0000-4000-8000-000000000002', 'fixture-admin@example.test');
INSERT INTO public.user_roles(user_id, role) VALUES ('10000000-0000-4000-8000-000000000002', 'admin');
SET LOCAL ROLE service_role;
DO $unauthorized_actor$
BEGIN
  BEGIN
    PERFORM public.wa_activate_retention_constraints('10000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Non-admin actor activated retention';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$unauthorized_actor$;
SELECT public.wa_activate_retention_constraints('10000000-0000-4000-8000-000000000002');
SELECT public.wa_activate_retention_constraints('10000000-0000-4000-8000-000000000002');
RESET ROLE;
DO $retention$
BEGIN
  IF (SELECT count(*) FROM pg_constraint c JOIN private.wa_retention_links l
        ON c.conrelid = format('%I.%I',l.child_schema,l.child_table)::regclass
       AND c.conname = 'wa_retention_' || l.child_column) <> 19 THEN
    RAISE EXCEPTION 'Retention activation omitted a reviewed link';
  END IF;
END
$retention$;
ROLLBACK;
SELECT 'Transaction foundation, service privileges and activation proofs passed';
