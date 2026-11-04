-- The same renderer serves admin preview and immutable queued message content.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,19);

CREATE OR REPLACE FUNCTION private.wa_trim_space(p_body text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$
  SELECT btrim(translate(p_body,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(160)||chr(5760)||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||
    chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279),repeat(' ',24)))
$fn$;

CREATE OR REPLACE FUNCTION private.wa_blank(p_body text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
  SELECT p_body IS NULL OR private.wa_trim_space(p_body)=''
$fn$;

CREATE OR REPLACE FUNCTION private.wa_validate_template(p_body text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE matched text[]; remaining text;
BEGIN
  IF private.wa_blank(p_body) OR char_length(p_body)>4096 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_template_body';
  END IF;
  remaining:=regexp_replace(p_body,'\{\{[^{}]*\}\}','','g');
  IF remaining ~ '[{}]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='malformed_template_token'; END IF;
  FOR matched IN SELECT regexp_matches(p_body,'\{\{([^{}]*)\}\}','g') LOOP
    IF NOT private.wa_trim_space(matched[1])=ANY(ARRAY['order_number','customer_name','customer_phone','total','currency','items_summary','invoice_url','order_url']) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported_template_token';
    END IF;
  END LOOP;
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_render_tokens(p_body text,p_facts jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE rest text:=p_body; rendered text:=''; opening integer; closing integer; token_name text;
BEGIN
  PERFORM private.wa_validate_template(p_body);
  LOOP
    opening:=strpos(rest,'{{'); EXIT WHEN opening=0; closing:=strpos(rest,'}}');
    token_name:=private.wa_trim_space(substr(rest,opening+2,closing-opening-2));
    rendered:=rendered||substr(rest,1,opening-1)||coalesce(p_facts->>token_name,'');
    rest:=substr(rest,closing+2);
  END LOOP;
  RETURN rendered||rest;
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_remaining_items(p_count integer,p_language text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT '+'||p_count::text||CASE WHEN p_language='ar' THEN CASE WHEN p_count=1 THEN ' عنصر آخر' ELSE ' عناصر أخرى' END
    ELSE CASE WHEN p_count=1 THEN ' more item' ELSE ' more items' END END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_item_summary(p_items jsonb,p_budget integer,p_language text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE item jsonb; total integer; position integer:=0; added integer:=0; summary text:=''; line text; quantity text;
  tail text; separator text; available integer; title text;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR p_budget<0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_render_facts';
  END IF;
  total:=jsonb_array_length(p_items);
  IF total=0 THEN RETURN jsonb_build_object('text','','remaining',0,'shortened',false); END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    position:=position+1;
    IF jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number'
      OR item->>'quantity' !~ '^[1-9][0-9]{0,9}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_render_facts';
    END IF;
    IF (item->>'quantity')::numeric>2147483647 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_render_facts';
    END IF;
    title:=regexp_replace(item->>'name','[[:cntrl:]]+',' ','g'); quantity:=' ×'||(item->>'quantity'); line:=title||quantity;
    separator:=CASE WHEN summary='' THEN '' ELSE chr(10) END;
    tail:=CASE WHEN position<total THEN chr(10)||private.wa_remaining_items(total-position,p_language) ELSE '' END;
    available:=p_budget-char_length(summary)-char_length(separator)-char_length(tail);
    IF available>=char_length(line) THEN summary:=summary||separator||line; added:=position; CONTINUE; END IF;
    IF summary='' AND available>=char_length(quantity)+1 THEN
      line:=left(title,available-char_length(quantity)-1)||'…'||quantity;
      RETURN jsonb_build_object('text',line||tail,'remaining',total-position,'shortened',true);
    END IF;
    tail:=private.wa_remaining_items(total-added,p_language);
    IF char_length(summary)+char_length(separator)+char_length(tail)>p_budget THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='items_summary_budget_exceeded';
    END IF;
    RETURN jsonb_build_object('text',summary||separator||tail,'remaining',total-added,'shortened',false);
  END LOOP;
  RETURN jsonb_build_object('text',summary,'remaining',0,'shortened',false);
END
$fn$;

CREATE OR REPLACE FUNCTION private.wa_render_paid_template(p_body text,p_language text,p_facts jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE facts jsonb; base text; rendered text; occurrences integer; budget integer; summary jsonb; amount numeric;
BEGIN
  PERFORM private.wa_validate_template(p_body);
  IF p_language IS NULL OR p_language NOT IN ('ar','en') OR jsonb_typeof(p_facts) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_facts->'amount') IS DISTINCT FROM 'number' OR p_facts->>'currency' IS DISTINCT FROM 'KWD' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_render_facts';
  END IF;
  amount:=(p_facts->>'amount')::numeric;
  IF amount<0 OR amount>999999999999.999 OR amount='NaN'::numeric THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_render_facts';
  END IF;
  facts:=jsonb_build_object('order_number',coalesce(p_facts->>'order_number',''),'customer_name',coalesce(p_facts->>'customer_name',''),
    'customer_phone',coalesce(p_facts->>'customer_phone',''),'currency','KWD','total',to_char(amount,'FM999999999990.000'),
    'invoice_url',coalesce(p_facts->>'invoice_url',''),'order_url',coalesce(p_facts->>'invoice_url',''),'items_summary','');
  base:=private.wa_render_tokens(p_body,facts);
  IF char_length(base)>4096 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rendered_content_too_long'; END IF;
  SELECT count(*) INTO occurrences FROM regexp_matches(p_body,'\{\{([^{}]*)\}\}','g') parts
    WHERE private.wa_trim_space(parts[1])='items_summary';
  summary:=jsonb_build_object('text','','remaining',0,'shortened',false);
  IF occurrences>0 THEN
    budget:=(4096-char_length(base))/occurrences;
    summary:=private.wa_item_summary(p_facts->'items',budget,p_language);
    facts:=jsonb_set(facts,'{items_summary}',summary->'text');
  END IF;
  rendered:=private.wa_render_tokens(p_body,facts);
  IF char_length(rendered)>4096 OR private.wa_blank(rendered) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_rendered_content';
  END IF;
  RETURN jsonb_build_object('body',rendered,'codepoints',char_length(rendered),'remaining_items',summary->'remaining',
    'truncated',(summary->>'remaining')::integer>0 OR (summary->>'shortened')::boolean);
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_preview_template(p_validated_draft jsonb,p_sample_or_order_identity jsonb,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE facts jsonb; rendered jsonb; unsupported jsonb; code text; correlation text:=gen_random_uuid()::text;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  PERFORM private.wa_check_keys(p_validated_draft,ARRAY['audience','language','body']);
  IF NOT (p_validated_draft ?& ARRAY['audience','language','body']) OR coalesce(p_validated_draft->>'audience','') NOT IN ('buyer','admins','custom')
    OR coalesce(p_validated_draft->>'language','') NOT IN ('ar','en') OR jsonb_typeof(p_validated_draft->'body') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_preview_draft';
  END IF;
  IF p_sample_or_order_identity='{"sample":true}'::jsonb THEN
    facts:='{"order_number":"SAMPLE","customer_name":"Sample buyer","customer_phone":"+96550000001","amount":14.005,"currency":"KWD",
      "invoice_url":"https://example.invalid/order/SAMPLE","items":[{"name":"Sample item","quantity":2}]}'::jsonb;
  ELSE
    PERFORM private.wa_check_keys(p_sample_or_order_identity,ARRAY['order_id']);
    IF jsonb_typeof(p_sample_or_order_identity->'order_id') IS DISTINCT FROM 'string' OR p_sample_or_order_identity->>'order_id' !~*
      '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_preview_identity';
    END IF;
    SELECT input_snapshot->'facts' INTO facts FROM private.wa_payment_outcomes
      WHERE order_id=(p_sample_or_order_identity->>'order_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='preview_payment_snapshot_missing'; END IF;
  END IF;
  BEGIN
    rendered:=private.wa_render_paid_template(p_validated_draft->>'body',p_validated_draft->>'language',facts);
  EXCEPTION WHEN invalid_parameter_value THEN
    code:=SQLERRM;
    IF code NOT IN ('invalid_template_body','malformed_template_token','unsupported_template_token','invalid_render_facts',
      'items_summary_budget_exceeded','rendered_content_too_long','invalid_rendered_content') THEN RAISE; END IF;
    SELECT coalesce(jsonb_agg(name ORDER BY name),'[]') INTO unsupported FROM (
      SELECT DISTINCT private.wa_trim_space(parts[1]) name FROM regexp_matches(p_validated_draft->>'body','\{\{([^{}]*)\}\}','g') parts
      WHERE NOT private.wa_trim_space(parts[1])=ANY(ARRAY['order_number','customer_name','customer_phone','total','currency','items_summary','invoice_url','order_url'])
        AND private.wa_trim_space(parts[1]) ~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$') names;
    RETURN jsonb_build_object('status',CASE WHEN code='invalid_render_facts' THEN 'error' ELSE 'invalid' END,
      'rendered',NULL,'codepoints',NULL,'truncated',false,'remainingItems',NULL,'unsupportedTokens',unsupported,
      'errors',jsonb_build_array(jsonb_build_object('code',code,'message','Template cannot be rendered.','correlationId',correlation)));
  END;
  RETURN jsonb_build_object('status','ok','rendered',rendered->'body','codepoints',rendered->'codepoints',
    'truncated',rendered->'truncated','remainingItems',rendered->'remaining_items','unsupportedTokens','[]'::jsonb,'errors','[]'::jsonb);
END
$fn$;

REVOKE ALL ON FUNCTION private.wa_trim_space(text),private.wa_blank(text),private.wa_validate_template(text),private.wa_render_tokens(text,jsonb),private.wa_remaining_items(integer,text),
  private.wa_item_summary(jsonb,integer,text),private.wa_render_paid_template(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.wa_preview_template(jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_preview_template(jsonb,jsonb,uuid) TO service_role;
COMMIT;
