-- Schema phase is inert: no trigger or index on an existing table is installed.
-- Arm separately during the reviewed application cutover, before payment writers.
BEGIN;
SELECT pg_advisory_xact_lock(20261103,27);

CREATE OR REPLACE FUNCTION private.integration_guard_invoice_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  IF TG_OP='TRUNCATE' THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='payment_invoice_identity_retained';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.provider='myfatoorah' AND OLD.invoice_id IS NOT NULL THEN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='payment_invoice_identity_retained';
    END IF;
    IF ROW(NEW.id,NEW.order_id,NEW.provider,NEW.invoice_id,NEW.amount,NEW.currency,NEW.idempotency_key)
      IS DISTINCT FROM
      ROW(OLD.id,OLD.order_id,OLD.provider,OLD.invoice_id,OLD.amount,OLD.currency,OLD.idempotency_key) THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='payment_invoice_identity_immutable';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.provider='myfatoorah' AND NEW.invoice_id IS NOT NULL AND (
    NEW.order_id IS NULL OR length(NEW.invoice_id) NOT BETWEEN 1 AND 200
    OR NEW.invoice_id<>btrim(NEW.invoice_id) OR NEW.amount<=0 OR NEW.amount='NaN'::numeric
    OR NEW.currency<>'KWD') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment_invoice_identity_invalid';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.integration_activate_invoice_guard(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE table_owner name; index_oid oid; trigger_oid oid; truncate_oid oid; already_enabled boolean;
BEGIN
  -- The endpoint must authenticate this actor; a supplied UUID is not identity.
  PERFORM private.wa_require_admin(p_actor_id);
  PERFORM pg_advisory_xact_lock(20261103,2);
  PERFORM 1 FROM public.whatsapp_settings WHERE singleton FOR UPDATE;
  PERFORM 1 FROM public.integrations WHERE provider='shipa' FOR UPDATE;
  SELECT pg_get_userbyid(relowner) INTO table_owner FROM pg_class WHERE oid='public.payment_attempts'::regclass;
  IF table_owner IS DISTINCT FROM current_user THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='payment_invoice_guard_owner_mismatch';
  END IF;
  -- Blocks both concurrent legacy DML and index/trigger replacement until commit.
  -- The caller must quiesce old writers; no HTTP belongs in this transaction.
  LOCK TABLE public.payment_attempts IN ACCESS EXCLUSIVE MODE;
  index_oid:=to_regclass('public.integration_myfatoorah_invoice_unique');
  SELECT oid INTO trigger_oid FROM pg_trigger
    WHERE tgrelid='public.payment_attempts'::regclass AND tgname='integration_invoice_identity_guard';
  SELECT oid INTO truncate_oid FROM pg_trigger
    WHERE tgrelid='public.payment_attempts'::regclass AND tgname='integration_invoice_truncate_guard';
  already_enabled:=index_oid IS NOT NULL AND trigger_oid IS NOT NULL AND truncate_oid IS NOT NULL;
  IF index_oid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_index WHERE indexrelid=index_oid AND indisunique AND indisvalid AND indisready
      AND indrelid='public.payment_attempts'::regclass
      AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX integration_myfatoorah_invoice_unique ON public.payment_attempts USING btree (invoice_id) WHERE ((provider = ''myfatoorah''::text) AND (invoice_id IS NOT NULL))'
  ) THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='payment_invoice_guard_definition_mismatch'; END IF;
  IF trigger_oid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE oid=trigger_oid AND NOT tgisinternal AND tgtype=31 AND tgenabled='O'
      AND tgfoid='private.integration_guard_invoice_identity()'::regprocedure
      AND tgnargs=0 AND tgqual IS NULL AND tgattr=''::int2vector
  ) THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='payment_invoice_guard_definition_mismatch'; END IF;
  IF truncate_oid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE oid=truncate_oid AND NOT tgisinternal AND tgtype=34 AND tgenabled='O'
      AND tgfoid='private.integration_guard_invoice_identity()'::regprocedure
      AND tgnargs=0 AND tgqual IS NULL AND tgattr=''::int2vector
  ) THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='payment_invoice_guard_definition_mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM public.payment_attempts WHERE provider='myfatoorah' AND invoice_id IS NOT NULL
    AND (order_id IS NULL OR length(invoice_id) NOT BETWEEN 1 AND 200 OR invoice_id<>btrim(invoice_id)
      OR amount<=0 OR amount='NaN'::numeric OR currency<>'KWD')) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='payment_invoice_guard_requires_valid_bindings';
  END IF;
  IF EXISTS(SELECT 1 FROM public.payment_attempts WHERE provider='myfatoorah' AND invoice_id IS NOT NULL
    GROUP BY invoice_id HAVING count(*)>1) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='payment_invoice_guard_requires_unique_bindings';
  END IF;
  IF index_oid IS NULL THEN
    CREATE UNIQUE INDEX integration_myfatoorah_invoice_unique ON public.payment_attempts(invoice_id)
      WHERE provider='myfatoorah' AND invoice_id IS NOT NULL;
  END IF;
  IF trigger_oid IS NULL THEN
    CREATE TRIGGER integration_invoice_identity_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payment_attempts
      FOR EACH ROW EXECUTE FUNCTION private.integration_guard_invoice_identity();
  END IF;
  IF truncate_oid IS NULL THEN
    CREATE TRIGGER integration_invoice_truncate_guard BEFORE TRUNCATE ON public.payment_attempts
      FOR EACH STATEMENT EXECUTE FUNCTION private.integration_guard_invoice_identity();
  END IF;
  RETURN jsonb_build_object('invoice_guard_ready',true,'changed',NOT already_enabled);
END
$fn$;

REVOKE ALL ON FUNCTION private.integration_guard_invoice_identity(),
  public.integration_activate_invoice_guard(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.integration_activate_invoice_guard(uuid) TO service_role;
COMMIT;
