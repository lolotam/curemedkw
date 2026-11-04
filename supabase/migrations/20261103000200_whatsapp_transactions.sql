-- Service-only transaction boundary. Activation functions remain dormant until approved.
BEGIN;
SELECT pg_advisory_xact_lock(20261103, 2);

CREATE OR REPLACE FUNCTION private.wa_require_admin(p_actor_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
BEGIN
  IF p_actor_id IS NULL OR NOT public.has_role(p_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_required';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_require_retention()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM private.wa_release_state WHERE singleton AND retention_ready) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'upgrade_pending';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_fingerprint(p_document jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(p_document::text, 'UTF8')), 'hex');
$fn$;

CREATE OR REPLACE FUNCTION private.wa_check_keys(p_document jsonb, p_allowed text[])
RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog AS $fn$
BEGIN
  IF p_document IS NULL OR jsonb_typeof(p_document) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_document) k WHERE NOT k = ANY(p_allowed)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payload_fields';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_normalize_phone(p_phone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog AS $fn$
DECLARE v_phone text; v_explicit boolean := false;
BEGIN
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN RETURN NULL; END IF;
  v_phone := translate(p_phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  IF v_phone ~ '[^0-9+()[:space:]‐-―-]' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_recipient_characters';
  END IF;
  v_phone := regexp_replace(v_phone, '[()[:space:]‐-―-]', '', 'g');
  IF left(v_phone, 1) = '+' THEN
    v_explicit := true; v_phone := substr(v_phone, 2);
  ELSIF left(v_phone, 2) = '00' THEN
    v_explicit := true; v_phone := substr(v_phone, 3);
  END IF;
  IF v_phone !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_recipient_prefix';
  END IF;
  IF NOT v_explicit AND length(v_phone) = 8 THEN v_phone := '965' || v_phone; END IF;
  IF length(v_phone) NOT BETWEEN 8 AND 15 OR (left(v_phone, 3) = '965' AND substr(v_phone, 4, 1) = '0') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_recipient_length';
  END IF;
  RETURN v_phone;
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_validate_template(p_body text)
RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog AS $fn$
DECLARE v_match text[]; v_remaining text;
BEGIN
  IF p_body IS NULL OR btrim(p_body) = '' OR char_length(p_body) > 4096 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_template_body';
  END IF;
  v_remaining := regexp_replace(p_body, '\{\{[^{}]*\}\}', '', 'g');
  IF v_remaining ~ '[{}]' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'malformed_template_token';
  END IF;
  FOR v_match IN SELECT regexp_matches(p_body, '\{\{([^{}]*)\}\}', 'g') LOOP
    IF NOT btrim(v_match[1]) = ANY(ARRAY['order_number','customer_name','customer_phone',
        'total','currency','items_summary','invoice_url','order_url']) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_template_token';
    END IF;
  END LOOP;
END
$fn$;

-- One-pass substitution never interprets token-looking text inside buyer/item facts.
CREATE OR REPLACE FUNCTION private.wa_render_tokens(p_body text, p_facts jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_rest text := p_body; v_rendered text := ''; v_open integer; v_close integer; v_token text;
BEGIN
  PERFORM private.wa_validate_template(p_body);
  LOOP
    v_open := strpos(v_rest, '{{');
    EXIT WHEN v_open = 0;
    v_close := strpos(v_rest, '}}');
    v_token := btrim(substr(v_rest, v_open + 2, v_close - v_open - 2));
    v_rendered := v_rendered || substr(v_rest, 1, v_open - 1) || coalesce(p_facts ->> v_token, '');
    v_rest := substr(v_rest, v_close + 2);
  END LOOP;
  RETURN v_rendered || v_rest;
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_activate_retention_constraints(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_link record; v_name text; v_existing record; v_count integer := 0;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  PERFORM pg_advisory_xact_lock(20261103, 2);
  PERFORM 1 FROM public.whatsapp_settings WHERE singleton FOR UPDATE;
  IF EXISTS (SELECT 1 FROM private.wa_release_state WHERE singleton AND retention_ready) THEN
    RETURN jsonb_build_object('retention_ready', true, 'changed', false);
  END IF;
  IF EXISTS (SELECT 1 FROM private.wa_payment_outcomes) OR EXISTS (SELECT 1 FROM public.whatsapp_delivery_jobs) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'retention_activation_requires_quiescent_new_writers';
  END IF;
  LOCK TABLE auth.users, public.orders, public.payment_attempts IN SHARE ROW EXCLUSIVE MODE;
  FOR v_link IN SELECT * FROM private.wa_retention_links ORDER BY child_schema, child_table, child_column LOOP
    v_name := 'wa_retention_' || v_link.child_column;
    SELECT c.confrelid, c.confdeltype INTO v_existing FROM pg_constraint c
      WHERE c.conrelid = format('%I.%I', v_link.child_schema, v_link.child_table)::regclass
        AND c.conname = v_name;
    IF FOUND THEN
      IF v_existing.confrelid <> format('%I.%I', v_link.parent_schema, v_link.parent_table)::regclass
         OR v_existing.confdeltype <> (CASE v_link.delete_action WHEN 'RESTRICT' THEN 'r'::"char" ELSE 'n'::"char" END) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'retention_definition_mismatch';
      END IF;
    ELSE
      EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(id) ON DELETE %s',
        v_link.child_schema, v_link.child_table, v_name, v_link.child_column,
        v_link.parent_schema, v_link.parent_table, v_link.delete_action);
    END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count <> 19 THEN RAISE EXCEPTION 'retention_inventory_mismatch'; END IF;
  UPDATE private.wa_release_state SET retention_ready = true, updated_at = now() WHERE singleton;
  RETURN jsonb_build_object('retention_ready', true, 'changed', true, 'links', v_count);
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_default_templates()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $fn$
SELECT jsonb_build_object(
  'buyer', jsonb_build_object(
    'ar', 'مرحباً {{customer_name}} 🌿' || chr(10) || 'شكراً لطلبك من Curemed.' || chr(10) || 'رقم الطلب: {{order_number}}' || chr(10) || 'المجموع: {{total}} د.ك' || chr(10) || 'يمكنك متابعة طلبك: {{invoice_url}}',
    'en', 'Hi {{customer_name}} 🌿' || chr(10) || 'Thanks for your Curemed order.' || chr(10) || 'Order #: {{order_number}}' || chr(10) || 'Total: KD {{total}}' || chr(10) || 'Track here: {{invoice_url}}'),
  'admins', jsonb_build_object(
    'ar', '🛎️ طلب جديد {{order_number}}' || chr(10) || 'العميل: {{customer_name}}' || chr(10) || 'هاتف: {{customer_phone}}' || chr(10) || 'المجموع: {{total}} د.ك' || chr(10) || '{{items_summary}}',
    'en', '🛎️ New order {{order_number}}' || chr(10) || 'Customer: {{customer_name}}' || chr(10) || 'Phone: {{customer_phone}}' || chr(10) || 'Total: KD {{total}}' || chr(10) || '{{items_summary}}'),
  'custom', jsonb_build_object(
    'ar', 'طلب {{order_number}}: {{total}} د.ك' || chr(10) || '{{items_summary}}',
    'en', 'Order {{order_number}}: KD {{total}}' || chr(10) || '{{items_summary}}')
);
$fn$;

CREATE OR REPLACE FUNCTION private.wa_validate_config(p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_audience text; v_lang text; v_entry jsonb; v_numbers jsonb;
  v_number text; v_result jsonb := p_patch; v_all text[] := '{}'; v_list text[];
BEGIN
  PERFORM private.wa_check_keys(p_patch, ARRAY['integration_enabled','automation_enabled',
    'default_country','audiences','recipients','expected_legacy_fingerprint']);
  IF octet_length(p_patch::text) > 65536 OR p_patch ->> 'default_country' IS DISTINCT FROM 'KW'
     OR jsonb_typeof(p_patch -> 'integration_enabled') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_patch -> 'automation_enabled') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_settings';
  END IF;
  PERFORM private.wa_check_keys(p_patch -> 'audiences', ARRAY['buyer','admins','custom']);
  FOREACH v_audience IN ARRAY ARRAY['buyer','admins','custom'] LOOP
    v_entry := p_patch -> 'audiences' -> v_audience;
    PERFORM private.wa_check_keys(v_entry, ARRAY['enabled','language','templates']);
    IF jsonb_typeof(v_entry -> 'enabled') IS DISTINCT FROM 'boolean'
       OR coalesce(v_entry ->> 'language','') NOT IN ('ar','en') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_audience';
    END IF;
    PERFORM private.wa_check_keys(v_entry -> 'templates', ARRAY['ar','en']);
    FOREACH v_lang IN ARRAY ARRAY['ar','en'] LOOP
      IF jsonb_typeof(v_entry -> 'templates' -> v_lang) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_template_body';
      END IF;
      IF btrim(v_entry -> 'templates' ->> v_lang) <> '' OR (v_entry ->> 'enabled')::boolean THEN
        PERFORM private.wa_validate_template(v_entry -> 'templates' ->> v_lang);
      END IF;
    END LOOP;
  END LOOP;
  PERFORM private.wa_check_keys(p_patch -> 'recipients', ARRAY['admins','custom']);
  FOREACH v_audience IN ARRAY ARRAY['admins','custom'] LOOP
    v_numbers := p_patch -> 'recipients' -> v_audience;
    IF jsonb_typeof(v_numbers) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_recipients';
    END IF;
    v_list := '{}';
    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_numbers) LOOP
      IF jsonb_typeof(v_entry) <> 'string' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_recipient';
      END IF;
      v_number := private.wa_normalize_phone(v_entry #>> '{}');
      IF v_number IS NULL THEN RAISE EXCEPTION 'empty_recipient'; END IF;
      IF NOT v_number = ANY(v_list) THEN v_list := array_append(v_list, v_number); END IF;
      IF NOT v_number = ANY(v_all) THEN v_all := array_append(v_all, v_number); END IF;
    END LOOP;
    v_result := jsonb_set(v_result, ARRAY['recipients',v_audience], to_jsonb(v_list));
  END LOOP;
  IF cardinality(v_all) > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'recipient_limit_exceeded';
  END IF;
  RETURN v_result - 'expected_legacy_fingerprint';
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_legacy_config(p_legacy jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_audiences jsonb := '{}'; v_audience text; v_event text; v_language text;
  v_lang text; v_pair jsonb; v_body text; v_defaults jsonb := private.wa_default_templates();
  v_enabled boolean; v_candidate jsonb; v_admins jsonb;
BEGIN
  IF p_legacy IS NULL OR jsonb_typeof(p_legacy)='null' THEN p_legacy := '{}'; END IF;
  IF jsonb_typeof(p_legacy) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='legacy_settings_invalid';
  END IF;
  v_language := CASE WHEN p_legacy ->> 'language' = 'en' THEN 'en' ELSE 'ar' END;
  FOREACH v_audience IN ARRAY ARRAY['buyer','admins','custom'] LOOP
    v_event := CASE v_audience WHEN 'buyer' THEN 'order_paid' ELSE 'admin_new_order' END;
    v_enabled := v_audience <> 'custom' AND (p_legacy -> 'events' -> v_event IS DISTINCT FROM 'false'::jsonb);
    v_pair := '{}';
    FOREACH v_lang IN ARRAY ARRAY['ar','en'] LOOP
      v_body := coalesce(p_legacy -> 'templates' ->> (v_event || '_' || v_lang),
                         p_legacy -> 'templates' -> v_event ->> v_lang);
      IF coalesce(v_body,'') = '' THEN v_body := v_defaults -> v_audience ->> v_lang; END IF;
      v_pair := v_pair || jsonb_build_object(v_lang, v_body);
    END LOOP;
    v_audiences := v_audiences || jsonb_build_object(v_audience,
      jsonb_build_object('enabled',v_enabled,'language',v_language,'templates',v_pair));
  END LOOP;
  v_admins := CASE WHEN jsonb_typeof(p_legacy -> 'admin_numbers') = 'array' THEN p_legacy -> 'admin_numbers' ELSE '[]'::jsonb END;
  v_candidate := jsonb_build_object('integration_enabled', p_legacy -> 'enabled' IS DISTINCT FROM 'false'::jsonb,
    'automation_enabled',false,'default_country','KW','audiences',v_audiences,
    'recipients',jsonb_build_object('admins',v_admins,'custom','[]'::jsonb));
  RETURN private.wa_validate_config(v_candidate);
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_guard_legacy_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_applies boolean;
BEGIN
  v_applies := CASE TG_OP
    WHEN 'INSERT' THEN NEW.key = 'whatsapp_integration'
    WHEN 'DELETE' THEN OLD.key = 'whatsapp_integration'
    ELSE OLD.key = 'whatsapp_integration' OR NEW.key = 'whatsapp_integration' END;
  IF v_applies AND (coalesce(current_setting('curemed.wa_legacy_mirror',true),'') <> 'on'
      OR current_setting('role',true) IN ('anon','authenticated')) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'whatsapp_settings_upgrade_required';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_set_compatibility_guard(p_armed boolean, p_expected_revision bigint, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_revision bigint;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  IF p_armed IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='guard_remains_readonly_in_compatibility_release'; END IF;
  LOCK TABLE public.site_settings IN SHARE ROW EXCLUSIVE MODE;
  SELECT settings_revision INTO v_revision FROM public.whatsapp_settings WHERE singleton FOR UPDATE;
  IF v_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='settings_revision_conflict'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.wa_release_state WHERE singleton AND state <> 'unmigrated') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='credential_migration_required';
  END IF;
  IF (SELECT relowner FROM pg_class WHERE oid='public.site_settings'::regclass)
     <> (SELECT proowner FROM pg_proc WHERE oid='private.wa_guard_legacy_settings()'::regprocedure) THEN
    RAISE EXCEPTION 'compatibility_guard_owner_mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.site_settings'::regclass AND tgname='wa_legacy_settings_write_guard') THEN
    CREATE TRIGGER wa_legacy_settings_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.site_settings
      FOR EACH ROW EXECUTE FUNCTION private.wa_guard_legacy_settings();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.site_settings'::regclass
    AND tgname='wa_legacy_settings_write_guard' AND tgfoid='private.wa_guard_legacy_settings()'::regprocedure
    AND tgtype=31 AND tgenabled='O' AND NOT tgisinternal AND tgnargs=0 AND tgqual IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='compatibility_guard_definition_mismatch';
  END IF;
  UPDATE private.wa_release_state SET compatibility_guard_armed=true,updated_at=now() WHERE singleton;
  RETURN jsonb_build_object('guard_armed',true);
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_validate_credential(p_change jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_nonce bytea; v_cipher bytea;
BEGIN
  PERFORM private.wa_check_keys(p_change, ARRAY['provider','account_identity','purpose',
    'generation','credential_revision','key_version','ciphertext','nonce']);
  IF coalesce(p_change ->> 'provider','') NOT IN ('postora','evolution')
     OR coalesce(p_change ->> 'purpose','') <> 'provider_api'
     OR jsonb_typeof(p_change -> 'account_identity') IS DISTINCT FROM 'string'
     OR length(btrim(p_change ->> 'account_identity')) NOT BETWEEN 1 AND 200
     OR coalesce(p_change ->> 'generation','') <> '0'
     OR coalesce(p_change ->> 'credential_revision','') !~ '^[1-9][0-9]{0,14}$'
     OR coalesce(p_change ->> 'key_version','') !~ '^[1-9][0-9]{0,8}$'
     OR jsonb_typeof(p_change -> 'ciphertext') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_change -> 'nonce') IS DISTINCT FROM 'string'
     OR length(p_change ->> 'ciphertext') NOT BETWEEN 24 AND 65536
     OR length(p_change ->> 'nonce') <> 16
     OR p_change ->> 'ciphertext' !~ '^[A-Za-z0-9+/]+={0,2}$'
     OR p_change ->> 'nonce' !~ '^[A-Za-z0-9+/]+$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_encrypted_credential';
  END IF;
  BEGIN
    v_nonce := decode(p_change ->> 'nonce','base64');
    v_cipher := decode(p_change ->> 'ciphertext','base64');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_encrypted_credential';
  END;
  IF octet_length(v_nonce) <> 12 OR octet_length(v_cipher) < 17
     OR replace(encode(v_cipher,'base64'),chr(10),'') <> p_change ->> 'ciphertext' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_encrypted_credential';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_credential_document(p_credential private.wa_credentials)
RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog AS $fn$
SELECT jsonb_build_object('provider',p_credential.provider,'account_identity',p_credential.account_identity,
  'purpose',p_credential.purpose,'generation',p_credential.generation,
  'credential_revision',p_credential.credential_revision,'key_version',p_credential.key_version,
  'ciphertext',p_credential.ciphertext,'nonce',p_credential.nonce);
$fn$;

CREATE OR REPLACE FUNCTION public.wa_read_credentials(p_provider text, p_account_identity text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_credential private.wa_credentials;
BEGIN
  IF coalesce(p_provider,'') NOT IN ('postora','evolution')
     OR coalesce(length(p_account_identity),0) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_credential_binding';
  END IF;
  SELECT * INTO v_credential FROM private.wa_credentials WHERE provider=p_provider
    AND account_identity=p_account_identity AND purpose='provider_api' AND generation=0;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('credential',private.wa_credential_document(v_credential),
    'credential_id',v_credential.id,'rotated_at',v_credential.rotated_at);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_store_credential(p_expected_revision bigint, p_encrypted_credential jsonb, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_revision bigint; v_prior private.wa_credentials; v_stored private.wa_credentials;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  PERFORM private.wa_require_retention();
  PERFORM private.wa_validate_credential(p_encrypted_credential);
  SELECT settings_revision INTO v_revision FROM public.whatsapp_settings WHERE singleton FOR UPDATE;
  IF v_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='settings_revision_conflict';
  END IF;
  -- Serialize with account claims before modifying any credential row.
  PERFORM 1 FROM public.whatsapp_account_dispatch ORDER BY provider,account_identity FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.whatsapp_account_dispatch WHERE active_job_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='active_delivery_must_finish_or_expire';
  END IF;
  SELECT * INTO v_prior FROM private.wa_credentials
    WHERE provider=p_encrypted_credential ->> 'provider'
      AND account_identity=p_encrypted_credential ->> 'account_identity'
      AND purpose='provider_api' AND generation=0 FOR UPDATE;
  IF (p_encrypted_credential ->> 'credential_revision')::bigint <> coalesce(v_prior.credential_revision,0)+1 THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='credential_revision_conflict';
  END IF;
  INSERT INTO private.wa_credentials(provider,account_identity,purpose,generation,credential_revision,key_version,ciphertext,nonce)
  VALUES (p_encrypted_credential ->> 'provider',p_encrypted_credential ->> 'account_identity','provider_api',0,
    (p_encrypted_credential ->> 'credential_revision')::bigint,(p_encrypted_credential ->> 'key_version')::integer,
    p_encrypted_credential ->> 'ciphertext',p_encrypted_credential ->> 'nonce')
  ON CONFLICT(provider,account_identity,purpose,generation) DO UPDATE SET
    credential_revision=excluded.credential_revision,key_version=excluded.key_version,
    ciphertext=excluded.ciphertext,nonce=excluded.nonce,rotated_at=now()
  RETURNING * INTO v_stored;
  DELETE FROM private.wa_provider_readiness WHERE provider=v_stored.provider AND credential_binding=v_stored.account_identity;
  UPDATE public.whatsapp_settings SET settings_revision=settings_revision+1,updated_at=now(),updated_by=p_actor_id WHERE singleton;
  RETURN jsonb_build_object('settings_revision',v_revision+1,'credential_revision',v_stored.credential_revision,
    'present',true,'rotated_at',v_stored.rotated_at);
END
$fn$;

-- Only server code that has performed the real provider diagnostic calls this RPC.
-- No route may forward a browser-supplied account, fallback flag or generation here.
CREATE OR REPLACE FUNCTION public.wa_record_provider_readiness(p_expected_revision bigint,
  p_provider text, p_credential_binding text, p_account_identity text,
  p_session_generation bigint, p_baseline_fallback_verified boolean,
  p_expected_legacy_fingerprint text, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_settings public.whatsapp_settings; v_credential private.wa_credentials;
  v_state private.wa_release_state; v_proof private.wa_provider_readiness; v_legacy jsonb;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  PERFORM private.wa_require_retention();
  IF coalesce(p_provider,'') NOT IN ('postora','evolution')
     OR coalesce(length(p_credential_binding),0) NOT BETWEEN 1 AND 200
     OR coalesce(length(btrim(p_account_identity)),0) NOT BETWEEN 1 AND 200
     OR p_baseline_fallback_verified IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_readiness_observation';
  END IF;
  SELECT * INTO v_settings FROM public.whatsapp_settings WHERE singleton FOR UPDATE;
  IF v_settings.settings_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='settings_revision_conflict';
  END IF;
  SELECT * INTO v_state FROM private.wa_release_state WHERE singleton;
  SELECT * INTO v_credential FROM private.wa_credentials WHERE provider=p_provider
    AND account_identity=p_credential_binding AND purpose='provider_api' AND generation=0 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='credential_required'; END IF;
  IF p_provider='evolution' THEN
    IF p_account_identity !~ '^[1-9][0-9]{7,14}$' OR p_session_generation IS NULL
       OR p_baseline_fallback_verified
       OR NOT EXISTS (SELECT 1 FROM public.evolution_connections WHERE instance_identity=p_credential_binding
         AND account_identity=p_account_identity AND session_generation=p_session_generation AND state='connected'
         AND updated_at >= now()-interval '5 minutes') THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='observed_connection_required';
    END IF;
  ELSIF p_session_generation IS NOT NULL OR p_account_identity !~ '^postora:[A-Za-z0-9._@+-]{1,192}$'
        OR p_credential_binding <> p_account_identity THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='postora_account_identity_required';
  END IF;
  SELECT coalesce(value,'{}'::jsonb) INTO v_legacy FROM public.site_settings WHERE key='whatsapp_integration';
  v_legacy := coalesce(v_legacy,'{}'::jsonb);
  IF p_baseline_fallback_verified AND (p_provider <> 'postora'
     OR p_expected_legacy_fingerprint IS DISTINCT FROM private.wa_fingerprint(v_legacy)) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='legacy_settings_conflict';
  END IF;
  INSERT INTO private.wa_provider_readiness(provider,credential_binding,credential_fingerprint,
    account_identity,session_generation,baseline_fallback_verified,legacy_fingerprint,consumed_at)
  VALUES (p_provider,p_credential_binding,private.wa_fingerprint(private.wa_credential_document(v_credential)),
    p_account_identity,p_session_generation,p_baseline_fallback_verified,
    CASE WHEN p_baseline_fallback_verified THEN private.wa_fingerprint(v_legacy) END,
    CASE WHEN v_settings.provider=p_provider AND v_settings.account_identity=p_account_identity
      AND v_state.active_credential_binding=p_credential_binding AND v_state.state='active' THEN now() END)
  ON CONFLICT(provider,credential_binding) DO UPDATE SET proof_token=DEFAULT,
    credential_fingerprint=excluded.credential_fingerprint,account_identity=excluded.account_identity,
    session_generation=excluded.session_generation,baseline_fallback_verified=excluded.baseline_fallback_verified,
    legacy_fingerprint=excluded.legacy_fingerprint,observed_at=now(),expires_at=now()+interval '5 minutes',
    consumed_at=excluded.consumed_at
  RETURNING * INTO v_proof;
  RETURN jsonb_build_object('readiness_proof',v_proof.proof_token,'expires_at',v_proof.expires_at,
    'provider',p_provider,'account_identity',p_account_identity,'credential_revision',v_credential.credential_revision);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_read_provider_readiness(p_provider text, p_credential_binding text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
SELECT jsonb_build_object('verified',r.expires_at > now() AND r.credential_fingerprint=private.wa_fingerprint(private.wa_credential_document(c))
  AND (r.provider='postora' OR EXISTS (SELECT 1 FROM public.evolution_connections e
    WHERE e.instance_identity=r.credential_binding AND e.account_identity=r.account_identity
      AND e.session_generation=r.session_generation AND e.state='connected')),
  'account_identity',r.account_identity,'observed_at',r.observed_at,'expires_at',r.expires_at,
  'baseline_fallback_verified',r.baseline_fallback_verified,'consumed',r.consumed_at IS NOT NULL)
FROM private.wa_provider_readiness r JOIN private.wa_credentials c ON c.provider=r.provider
  AND c.account_identity=r.credential_binding AND c.purpose='provider_api' AND c.generation=0
WHERE r.provider=p_provider AND r.credential_binding=p_credential_binding;
$fn$;

-- Baseline handlers have fewer fact fields and a stricter token spelling.
-- If a canonical template cannot be projected safely, baseline rollback stays disabled.
CREATE OR REPLACE FUNCTION private.wa_legacy_projection(p_config jsonb, p_legacy jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_templates jsonb := coalesce(p_legacy -> 'templates','{}'::jsonb);
  v_events jsonb := coalesce(p_legacy -> 'events','{}'::jsonb); v_audience text;
  v_event text; v_body text; v_match text[]; v_safe boolean := true; v_allowed text[];
BEGIN
  IF jsonb_typeof(v_templates) <> 'object' THEN v_templates := '{}'; END IF;
  IF jsonb_typeof(v_events) <> 'object' THEN v_events := '{}'; END IF;
  FOREACH v_audience IN ARRAY ARRAY['buyer','admins'] LOOP
    v_event := CASE v_audience WHEN 'buyer' THEN 'order_paid' ELSE 'admin_new_order' END;
    v_body := p_config -> 'audiences' -> v_audience -> 'templates' ->>
      (p_config -> 'audiences' -> v_audience ->> 'language');
    v_allowed := CASE v_audience WHEN 'buyer' THEN ARRAY['customer_name','order_number','total','invoice_url']
      ELSE ARRAY['customer_name','customer_phone','order_number','total','items_summary'] END;
    v_body := regexp_replace(v_body,'\{\{[[:space:]]*currency[[:space:]]*\}\}','KWD','g');
    IF v_audience='buyer' THEN
      v_body := regexp_replace(v_body,'\{\{[[:space:]]*order_url[[:space:]]*\}\}','{{invoice_url}}','g');
    END IF;
    v_body := regexp_replace(v_body,'\{\{[[:space:]]*([a-z_]+)[[:space:]]*\}\}','{{\1}}','g');
    FOR v_match IN SELECT regexp_matches(v_body,'\{\{([^{}]*)\}\}','g') LOOP
      IF NOT v_match[1]=ANY(v_allowed) THEN v_safe := false; END IF;
    END LOOP;
    v_templates := v_templates || jsonb_build_object(v_event || '_ar',v_body,v_event || '_en',v_body);
    v_events := v_events || jsonb_build_object(v_event,(p_config -> 'audiences' -> v_audience ->> 'enabled')::boolean);
  END LOOP;
  RETURN jsonb_build_object('enabled',(p_config ->> 'integration_enabled')::boolean AND v_safe,
    'language',CASE WHEN p_legacy ->> 'language'='en' THEN 'en' ELSE 'ar' END,
    'templates',v_templates,'events',v_events,'admin_numbers',p_config -> 'recipients' -> 'admins');
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_write_legacy_mirror(p_projection jsonb, p_clear_key boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_legacy jsonb; v_previous text := current_setting('curemed.wa_legacy_mirror',true);
BEGIN
  SELECT value INTO v_legacy FROM public.site_settings WHERE key='whatsapp_integration';
  IF v_legacy IS NULL OR jsonb_typeof(v_legacy)='null' THEN v_legacy := '{}'; END IF;
  IF jsonb_typeof(v_legacy) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='legacy_settings_invalid';
  END IF;
  v_legacy := v_legacy || p_projection;
  IF p_clear_key THEN v_legacy := jsonb_set(v_legacy,'{api_key}','""'::jsonb); END IF;
  PERFORM set_config('curemed.wa_legacy_mirror','on',true);
  INSERT INTO public.site_settings(key,value) VALUES ('whatsapp_integration',v_legacy)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now();
  PERFORM set_config('curemed.wa_legacy_mirror',coalesce(v_previous,''),true);
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_unmigrated_projection(p_config jsonb, p_legacy jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_ar jsonb; v_en jsonb; v_config jsonb;
BEGIN
  IF p_config -> 'audiences' -> 'buyer' ->> 'language' IS DISTINCT FROM
     p_config -> 'audiences' -> 'admins' ->> 'language' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='independent_languages_require_migration';
  END IF;
  v_config := jsonb_set(jsonb_set(p_config,'{audiences,buyer,language}','"ar"'),'{audiences,admins,language}','"ar"');
  v_ar := private.wa_legacy_projection(v_config,p_legacy);
  v_config := jsonb_set(jsonb_set(p_config,'{audiences,buyer,language}','"en"'),'{audiences,admins,language}','"en"');
  v_en := private.wa_legacy_projection(v_config,p_legacy);
  RETURN v_en || jsonb_build_object('language',p_config -> 'audiences' -> 'buyer' ->> 'language',
    'enabled',(v_ar ->> 'enabled')::boolean AND (v_en ->> 'enabled')::boolean,
    'templates',(v_en -> 'templates') || jsonb_build_object('order_paid_ar',v_ar -> 'templates' ->> 'order_paid_ar',
      'admin_new_order_ar',v_ar -> 'templates' ->> 'admin_new_order_ar'));
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_read_settings(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_settings public.whatsapp_settings; v_state private.wa_release_state; v_legacy jsonb;
  v_config jsonb; v_credential private.wa_credentials; v_readiness jsonb;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  SELECT * INTO v_settings FROM public.whatsapp_settings WHERE singleton;
  SELECT * INTO v_state FROM private.wa_release_state WHERE singleton;
  IF v_state.state='unmigrated' THEN
    SELECT value INTO v_legacy FROM public.site_settings WHERE key='whatsapp_integration';
    v_legacy := coalesce(v_legacy,'{}'::jsonb);
    v_config := private.wa_legacy_config(v_legacy);
  ELSE
    v_config := jsonb_build_object('integration_enabled',v_settings.integration_enabled,
      'automation_enabled',v_settings.automation_enabled,'default_country',v_settings.default_country,
      'audiences',v_settings.audiences,'recipients',v_settings.recipients);
  END IF;
  SELECT * INTO v_credential FROM private.wa_credentials WHERE provider=v_settings.provider
    AND account_identity=v_state.active_credential_binding AND purpose='provider_api' AND generation=0;
  v_readiness := public.wa_read_provider_readiness(v_settings.provider,v_state.active_credential_binding);
  RETURN v_config || jsonb_build_object('settings_revision',v_settings.settings_revision,
    'credential_revision',coalesce(v_credential.credential_revision,0),'provider',v_settings.provider,
    'account_identity',v_settings.account_identity,'cutover_version',v_settings.cutover_version,
    'credential',jsonb_build_object('present',v_credential.id IS NOT NULL OR
      (v_state.state='unmigrated' AND jsonb_typeof(v_legacy -> 'api_key')='string'
        AND coalesce(btrim(v_legacy ->> 'api_key'),'')<>''),'rotated_at',v_credential.rotated_at),
    'readiness',CASE WHEN v_readiness ->> 'verified'='true' THEN 'verified'
       WHEN v_credential.id IS NOT NULL OR (v_state.state='unmigrated' AND jsonb_typeof(v_legacy -> 'api_key')='string'
         AND coalesce(btrim(v_legacy ->> 'api_key'),'')<>'')
         THEN 'unverified' ELSE 'unconfigured' END,
    'scheduler_heartbeat_at',v_settings.scheduler_heartbeat_at,'first_activated_at',v_settings.first_activated_at,
    'legacy_fingerprint',CASE WHEN v_state.state='unmigrated' THEN private.wa_fingerprint(v_legacy) END);
END
$fn$;

-- This service-only, admin-checked result is SECRET-BEARING and cannot be a browser action.
CREATE OR REPLACE FUNCTION public.wa_read_legacy_migration_source(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_legacy jsonb; v_revision bigint;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  IF NOT EXISTS (SELECT 1 FROM private.wa_release_state WHERE singleton AND state='unmigrated') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='already_migrated';
  END IF;
  SELECT value INTO v_legacy FROM public.site_settings WHERE key='whatsapp_integration';
  v_legacy := coalesce(v_legacy,'{}'::jsonb);
  SELECT settings_revision INTO v_revision FROM public.whatsapp_settings WHERE singleton;
  RETURN jsonb_build_object('settings_revision',v_revision,'legacy_fingerprint',private.wa_fingerprint(v_legacy),
    'api_key',CASE WHEN jsonb_typeof(v_legacy -> 'api_key')='string' THEN v_legacy ->> 'api_key' ELSE '' END,
    'endpoint',CASE WHEN jsonb_typeof(v_legacy -> 'endpoint')='string' THEN v_legacy ->> 'endpoint' ELSE '' END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_save_settings(p_expected_revision bigint, p_safe_patch jsonb,
  p_encrypted_credential_change jsonb, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_settings public.whatsapp_settings; v_state private.wa_release_state;
  v_config jsonb; v_legacy jsonb; v_enable boolean; v_proof private.wa_provider_readiness; v_projection jsonb;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  PERFORM private.wa_require_retention();
  IF p_encrypted_credential_change IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='use_separate_credential_action';
  END IF;
  v_config := private.wa_validate_config(p_safe_patch);
  -- Every path touching the legacy mirror takes this table lock before settings rows.
  LOCK TABLE public.site_settings IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_settings FROM public.whatsapp_settings WHERE singleton FOR UPDATE;
  SELECT * INTO v_state FROM private.wa_release_state WHERE singleton;
  IF v_settings.settings_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='settings_revision_conflict';
  END IF;
  SELECT value INTO v_legacy FROM public.site_settings WHERE key='whatsapp_integration';
  v_legacy := coalesce(v_legacy,'{}'::jsonb);
  IF v_state.state='unmigrated' THEN
    IF p_safe_patch ->> 'expected_legacy_fingerprint' IS DISTINCT FROM private.wa_fingerprint(v_legacy) THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='legacy_settings_conflict';
    END IF;
    IF (v_config ->> 'automation_enabled')::boolean
       OR (v_config -> 'audiences' -> 'custom' ->> 'enabled')::boolean
       OR jsonb_array_length(v_config -> 'recipients' -> 'custom') <> 0 THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='credential_migration_required';
    END IF;
    v_projection := private.wa_unmigrated_projection(v_config,v_legacy);
    IF (v_config ->> 'integration_enabled')::boolean AND NOT (v_projection ->> 'enabled')::boolean THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='legacy_template_projection_unsupported';
    END IF;
  ELSE
    v_projection := private.wa_legacy_projection(v_config,v_legacy);
    IF v_settings.provider <> 'postora' THEN
      v_projection := jsonb_set(v_projection,'{enabled}','false');
    END IF;
    v_enable := (v_config ->> 'automation_enabled')::boolean AND
      (NOT v_settings.automation_enabled OR v_settings.cutover_version=0 OR
       ((v_config ->> 'integration_enabled')::boolean AND NOT v_settings.integration_enabled));
    IF v_enable OR ((v_config ->> 'integration_enabled')::boolean AND NOT v_settings.integration_enabled) THEN
      SELECT r.* INTO v_proof FROM private.wa_provider_readiness r JOIN private.wa_credentials c
        ON c.provider=r.provider AND c.account_identity=r.credential_binding AND c.purpose='provider_api' AND c.generation=0
        WHERE r.provider=v_settings.provider AND r.credential_binding=v_state.active_credential_binding
          AND r.account_identity=v_settings.account_identity AND r.consumed_at IS NOT NULL
          AND r.credential_fingerprint=private.wa_fingerprint(private.wa_credential_document(c))
          AND r.expires_at>now();
      IF v_state.state <> 'active' OR NOT FOUND OR NOT (v_config ->> 'integration_enabled')::boolean THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='provider_activation_required';
      END IF;
      IF (v_config ->> 'automation_enabled')::boolean AND
         (v_settings.scheduler_heartbeat_at IS NULL OR v_settings.scheduler_heartbeat_at < now()-interval '180 seconds'
         OR v_settings.scheduler_heartbeat_at>now()+interval '5 seconds') THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='fresh_scheduler_heartbeat_required';
      END IF;
      IF v_settings.provider='evolution' AND NOT EXISTS (SELECT 1 FROM public.evolution_connections
        WHERE instance_identity=v_state.active_credential_binding AND account_identity=v_settings.account_identity
          AND session_generation=v_proof.session_generation AND state='connected') THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='observed_connection_required';
      END IF;
    END IF;
  END IF;
  UPDATE public.whatsapp_settings SET settings_revision=settings_revision+1,
    integration_enabled=(v_config ->> 'integration_enabled')::boolean,
    automation_enabled=(v_config ->> 'automation_enabled')::boolean,
    cutover_version=CASE WHEN v_enable THEN 1 ELSE cutover_version END,
    audiences=v_config -> 'audiences',recipients=v_config -> 'recipients',updated_at=now(),updated_by=p_actor_id
    WHERE singleton;
  PERFORM private.wa_write_legacy_mirror(v_projection,v_state.state<>'unmigrated');
  RETURN public.wa_read_settings(p_actor_id);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_migrate_postora_credential(p_expected_revision bigint,
  p_encrypted_credential_change jsonb, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_settings public.whatsapp_settings; v_legacy jsonb; v_config jsonb;
  v_proof private.wa_provider_readiness; v_credential private.wa_credentials; v_mode text;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  PERFORM private.wa_require_retention();
  PERFORM private.wa_check_keys(p_encrypted_credential_change,ARRAY['mode','credential','readiness_proof',
    'expected_legacy_fingerprint','baseline_fallback_empty','fallback_verified']);
  v_mode := coalesce(p_encrypted_credential_change ->> 'mode','configured');
  IF v_mode NOT IN ('configured','unconfigured','disabled') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_migration_mode';
  END IF;
  IF v_mode<>'unconfigured' THEN PERFORM private.wa_validate_credential(p_encrypted_credential_change -> 'credential'); END IF;
  LOCK TABLE public.site_settings IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_settings FROM public.whatsapp_settings WHERE singleton FOR UPDATE;
  IF v_settings.settings_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='settings_revision_conflict';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.wa_release_state WHERE singleton AND state='unmigrated') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='already_migrated';
  END IF;
  PERFORM 1 FROM public.whatsapp_account_dispatch ORDER BY provider,account_identity FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.whatsapp_account_dispatch WHERE active_job_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='active_delivery_must_finish_or_expire';
  END IF;
  SELECT value INTO v_legacy FROM public.site_settings WHERE key='whatsapp_integration';
  v_legacy := coalesce(v_legacy,'{}'::jsonb);
  IF private.wa_fingerprint(v_legacy) IS DISTINCT FROM p_encrypted_credential_change ->> 'expected_legacy_fingerprint' THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='legacy_settings_conflict';
  END IF;
  v_config := private.wa_legacy_config(v_legacy);
  IF v_mode='configured' THEN
    SELECT * INTO v_proof FROM private.wa_provider_readiness
    WHERE proof_token::text=p_encrypted_credential_change ->> 'readiness_proof' AND provider='postora'
      AND expires_at>now() AND baseline_fallback_verified AND consumed_at IS NULL
      AND legacy_fingerprint=private.wa_fingerprint(v_legacy) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='verified_baseline_fallback_required'; END IF;
    SELECT * INTO v_credential FROM private.wa_credentials WHERE provider='postora'
    AND account_identity=v_proof.credential_binding AND purpose='provider_api' AND generation=0 FOR SHARE;
    IF NOT FOUND OR v_proof.credential_fingerprint IS DISTINCT FROM private.wa_fingerprint(private.wa_credential_document(v_credential))
     OR private.wa_credential_document(v_credential) IS DISTINCT FROM p_encrypted_credential_change -> 'credential' THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='credential_revision_conflict';
    END IF;
  ELSIF v_mode='disabled' THEN
    IF (v_config ->> 'integration_enabled')::boolean
       OR p_encrypted_credential_change -> 'fallback_verified' IS DISTINCT FROM 'true'::jsonb
       OR p_encrypted_credential_change -> 'credential' ->> 'provider' IS DISTINCT FROM 'postora'
       OR p_encrypted_credential_change -> 'credential' ->> 'account_identity' IS DISTINCT FROM 'postora:legacy-unverified'
       OR p_encrypted_credential_change ->> 'readiness_proof' IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='disabled_legacy_and_verified_fallback_required';
    END IF;
    SELECT * INTO v_credential FROM private.wa_credentials WHERE provider='postora'
      AND account_identity='postora:legacy-unverified' AND purpose='provider_api' AND generation=0 FOR SHARE;
    IF NOT FOUND OR private.wa_credential_document(v_credential) IS DISTINCT FROM p_encrypted_credential_change -> 'credential' THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='credential_revision_conflict';
    END IF;
  ELSE
    -- Server orchestration attests that its env fallback is absent; SQL rechecks the database key.
    IF p_encrypted_credential_change -> 'baseline_fallback_empty' IS DISTINCT FROM 'true'::jsonb
       OR (jsonb_typeof(v_legacy -> 'api_key')='string' AND coalesce(btrim(v_legacy ->> 'api_key'),'')<>'')
       OR p_encrypted_credential_change ->> 'readiness_proof' IS NOT NULL
       OR p_encrypted_credential_change ->> 'credential' IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='unconfigured_legacy_and_absent_fallback_required';
    END IF;
    v_config := jsonb_set(v_config,'{integration_enabled}','false');
  END IF;
  UPDATE public.whatsapp_settings SET settings_revision=settings_revision+1,provider='postora',
    account_identity=v_proof.account_identity,integration_enabled=(v_config ->> 'integration_enabled')::boolean,
    automation_enabled=false,cutover_version=0,audiences=v_config -> 'audiences',recipients=v_config -> 'recipients',
    legacy_events=coalesce(v_legacy -> 'events','{}'::jsonb),legacy_templates=coalesce(v_legacy -> 'templates','{}'::jsonb),
    legacy_language=CASE WHEN v_legacy ->> 'language'='en' THEN 'en' ELSE 'ar' END,
    updated_at=now(),updated_by=p_actor_id WHERE singleton;
  UPDATE private.wa_release_state SET state='migrated',active_credential_binding=v_credential.account_identity,
    migrated_at=now(),baseline_fallback_verified_at=now(),legacy_fingerprint=private.wa_fingerprint(v_legacy),updated_at=now()
    WHERE singleton;
  PERFORM public.wa_set_compatibility_guard(true,p_expected_revision+1,p_actor_id);
  PERFORM private.wa_write_legacy_mirror(private.wa_legacy_projection(v_config,v_legacy),true);
  UPDATE private.wa_provider_readiness SET consumed_at=now() WHERE proof_token IN (v_proof.proof_token);
  RETURN public.wa_read_settings(p_actor_id);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_activate_provider(p_expected_revision bigint, p_provider text,
  p_readiness_proof text, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public, pg_temp AS $fn$
DECLARE v_settings public.whatsapp_settings; v_state private.wa_release_state;
  v_proof private.wa_provider_readiness; v_credential private.wa_credentials;
  v_legacy jsonb; v_config jsonb; v_projection jsonb;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  PERFORM private.wa_require_retention();
  IF coalesce(p_provider,'') NOT IN ('postora','evolution')
     OR coalesce(p_readiness_proof,'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_provider_activation';
  END IF;
  LOCK TABLE public.site_settings IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_settings FROM public.whatsapp_settings WHERE singleton FOR UPDATE;
  IF v_settings.settings_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='settings_revision_conflict';
  END IF;
  SELECT * INTO v_state FROM private.wa_release_state WHERE singleton;
  IF v_state.state='unmigrated' OR NOT v_state.compatibility_guard_armed THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='credential_migration_required';
  END IF;
  -- Expiry of an in-flight send requires its explicit uncertain-outcome transition first.
  PERFORM 1 FROM public.whatsapp_account_dispatch ORDER BY provider,account_identity FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.whatsapp_account_dispatch WHERE active_job_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='active_delivery_must_finish_or_expire';
  END IF;
  SELECT * INTO v_proof FROM private.wa_provider_readiness
    WHERE provider=p_provider AND proof_token::text=p_readiness_proof AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='current_provider_proof_required'; END IF;
  SELECT * INTO v_credential FROM private.wa_credentials WHERE provider=p_provider
    AND account_identity=v_proof.credential_binding AND purpose='provider_api' AND generation=0 FOR SHARE;
  IF NOT FOUND OR v_proof.credential_fingerprint IS DISTINCT FROM private.wa_fingerprint(private.wa_credential_document(v_credential)) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='credential_revision_conflict';
  END IF;
  IF v_proof.consumed_at IS NOT NULL AND
     (v_settings.provider IS DISTINCT FROM p_provider OR v_settings.account_identity IS DISTINCT FROM v_proof.account_identity
      OR v_state.active_credential_binding IS DISTINCT FROM v_proof.credential_binding) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='current_provider_proof_required';
  END IF;
  IF p_provider='evolution' AND NOT EXISTS (SELECT 1 FROM public.evolution_connections
    WHERE instance_identity=v_proof.credential_binding AND account_identity=v_proof.account_identity
      AND session_generation=v_proof.session_generation AND state='connected') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='observed_connection_required';
  END IF;
  UPDATE public.whatsapp_delivery_jobs SET parked_reason=CASE WHEN provider<>p_provider
      THEN 'provider_changed' ELSE 'account_changed' END,updated_at=now()
    WHERE state='queued' AND attempt_count=0
      AND (provider<>p_provider OR account_identity<>v_proof.account_identity);
  INSERT INTO public.whatsapp_account_dispatch(provider,account_identity)
    VALUES (p_provider,v_proof.account_identity) ON CONFLICT DO NOTHING;
  UPDATE public.whatsapp_settings SET provider=p_provider,account_identity=v_proof.account_identity,
    settings_revision=settings_revision+1,first_activated_at=coalesce(first_activated_at,now()),
    updated_at=now(),updated_by=p_actor_id WHERE singleton;
  UPDATE private.wa_release_state SET state='active',active_credential_binding=v_proof.credential_binding,updated_at=now()
    WHERE singleton;
  UPDATE private.wa_provider_readiness SET consumed_at=now() WHERE proof_token IN (v_proof.proof_token);
  SELECT value INTO v_legacy FROM public.site_settings WHERE key='whatsapp_integration';
  v_config := jsonb_build_object('integration_enabled',v_settings.integration_enabled,
    'audiences',v_settings.audiences,'recipients',v_settings.recipients);
  v_projection := private.wa_legacy_projection(v_config,coalesce(v_legacy,'{}'::jsonb));
  IF p_provider<>'postora' THEN v_projection := jsonb_set(v_projection,'{enabled}','false'); END IF;
  PERFORM private.wa_write_legacy_mirror(v_projection,true);
  -- Keep the existing safe document shape; the operator can inspect parked jobs separately.
  RETURN public.wa_read_settings(p_actor_id);
END
$fn$;

-- The exact list is extended alongside each new function, never a schema-wide default change.
DO $wa_function_privileges$
DECLARE v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'private.wa_require_admin(uuid)', 'private.wa_require_retention()',
    'private.wa_fingerprint(jsonb)', 'private.wa_check_keys(jsonb,text[])',
    'private.wa_normalize_phone(text)', 'private.wa_validate_template(text)',
    'private.wa_render_tokens(text,jsonb)', 'public.wa_activate_retention_constraints(uuid)',
    'private.wa_default_templates()', 'private.wa_validate_config(jsonb)',
    'private.wa_legacy_config(jsonb)', 'private.wa_guard_legacy_settings()',
    'public.wa_set_compatibility_guard(boolean,bigint,uuid)',
    'private.wa_validate_credential(jsonb)',
    'private.wa_credential_document(private.wa_credentials)',
    'public.wa_read_credentials(text,text)',
    'public.wa_store_credential(bigint,jsonb,uuid)',
    'public.wa_record_provider_readiness(bigint,text,text,text,bigint,boolean,text,uuid)',
    'public.wa_read_provider_readiness(text,text)',
    'private.wa_legacy_projection(jsonb,jsonb)','private.wa_write_legacy_mirror(jsonb,boolean)',
    'private.wa_unmigrated_projection(jsonb,jsonb)',
    'public.wa_read_settings(uuid)','public.wa_read_legacy_migration_source(uuid)',
    'public.wa_save_settings(bigint,jsonb,jsonb,uuid)',
    'public.wa_migrate_postora_credential(bigint,jsonb,uuid)',
    'public.wa_activate_provider(bigint,text,text,uuid)'
  ] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || v_signature || ' FROM PUBLIC, anon, authenticated, service_role';
  END LOOP;
  GRANT EXECUTE ON FUNCTION public.wa_activate_retention_constraints(uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.wa_set_compatibility_guard(boolean,bigint,uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.wa_read_credentials(text,text) TO service_role;
  GRANT EXECUTE ON FUNCTION public.wa_store_credential(bigint,jsonb,uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.wa_record_provider_readiness(bigint,text,text,text,bigint,boolean,text,uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.wa_read_provider_readiness(text,text) TO service_role;
  GRANT EXECUTE ON FUNCTION public.wa_read_settings(uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.wa_read_legacy_migration_source(uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.wa_save_settings(bigint,jsonb,jsonb,uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.wa_migrate_postora_credential(bigint,jsonb,uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.wa_activate_provider(bigint,text,text,uuid) TO service_role;
END
$wa_function_privileges$;
COMMIT;
