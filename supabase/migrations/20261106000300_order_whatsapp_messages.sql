BEGIN;
SELECT pg_advisory_xact_lock(20261105,3);

-- Order WhatsApp messages: an order confirmation when an order is paid, a delivery confirmation when it is
-- first marked delivered, and a follow-up some days after delivery. Settings live in
-- site_settings.order_whatsapp; the order-whatsapp-dispatch worker sends due messages through Evolution.

-- The language the customer checked out in. Orders placed before this column existed have none.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
DO $constraint$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orders_language_check' AND conrelid='public.orders'::regclass) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_language_check CHECK (language IS NULL OR language IN ('ar','en'));
  END IF;
END $constraint$;

-- One row per order and kind, used both as the send queue and as the log the admin page shows.
-- pending -> sending -> sent | uncertain; pending -> skipped | expired. A send is attempted at most once:
-- WhatsApp cannot tell us whether a timed-out request was delivered, so nothing is ever retried.
CREATE TABLE IF NOT EXISTS public.order_whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('confirmation','delivery','follow_up')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','uncertain','skipped','expired')),
  recipient text CHECK (recipient IS NULL OR recipient ~ '^[1-9][0-9]{7,14}$'),
  language text CHECK (language IS NULL OR language IN ('ar','en')),
  body text NOT NULL DEFAULT '',
  reason text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (order_id, kind)
);
CREATE INDEX IF NOT EXISTS order_whatsapp_messages_pending_idx ON public.order_whatsapp_messages (created_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS order_whatsapp_messages_updated_idx ON public.order_whatsapp_messages (updated_at DESC);
ALTER TABLE public.order_whatsapp_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_whatsapp_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_whatsapp_messages TO authenticated;
DROP POLICY IF EXISTS "Admins can view order WhatsApp messages" ON public.order_whatsapp_messages;
CREATE POLICY "Admins can view order WhatsApp messages" ON public.order_whatsapp_messages
  FOR SELECT USING (public.has_role(auth.uid(),'admin'::public.app_role));

-- The customer's number in the form WhatsApp addresses, or NULL when the order's number is unusable.
CREATE OR REPLACE FUNCTION private.owa_recipient(p_phone text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private,pg_temp AS $fn$
BEGIN
  RETURN private.wa_normalize_phone(p_phone);
EXCEPTION WHEN invalid_parameter_value THEN RETURN NULL;
END
$fn$;

-- A message whose number is unusable is logged as skipped at once instead of waiting in the queue.
CREATE OR REPLACE FUNCTION private.owa_enqueue(p_order_id uuid,p_kind text,p_phone text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE recipient text:=private.owa_recipient(p_phone);
BEGIN
  INSERT INTO public.order_whatsapp_messages(order_id,kind,recipient,status,reason)
    VALUES (p_order_id,p_kind,recipient,CASE WHEN recipient IS NULL THEN 'skipped' ELSE 'pending' END,
      CASE WHEN recipient IS NULL THEN 'invalid_phone' END)
    ON CONFLICT (order_id,kind) DO NOTHING;
END
$fn$;

CREATE OR REPLACE FUNCTION private.owa_settings() RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $fn$
  SELECT coalesce((SELECT CASE WHEN jsonb_typeof(value)='object' THEN value END
    FROM public.site_settings WHERE key='order_whatsapp'),'{}'::jsonb)
$fn$;

-- Absent per-message switches default to on; the master switch defaults to off.
CREATE OR REPLACE FUNCTION private.owa_kind_enabled(p_settings jsonb,p_kind text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT p_settings->'enabled' IS NOT DISTINCT FROM 'true'::jsonb
    AND coalesce(p_settings->(p_kind||'_enabled'),'true'::jsonb)='true'::jsonb
$fn$;

CREATE OR REPLACE FUNCTION private.owa_follow_up_days(p_settings jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT CASE WHEN jsonb_typeof(p_settings->'follow_up_days')='number'
    THEN least(greatest(floor((p_settings->>'follow_up_days')::numeric)::integer,1),60) ELSE 3 END
$fn$;

CREATE OR REPLACE FUNCTION private.owa_due_at(p_kind text,p_created_at timestamptz,p_delivered_at timestamptz,p_days integer)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT CASE p_kind WHEN 'confirmation' THEN p_created_at WHEN 'delivery' THEN p_delivered_at
    ELSE p_delivered_at+make_interval(days=>p_days) END
$fn$;

-- The first time an order is marked delivered: stamp it and queue its delivery and follow-up messages.
-- This runs inside the administrator's own order update, so it reads no settings and cannot refuse the
-- update; whether and when each message goes out is decided when the worker claims it.
CREATE OR REPLACE FUNCTION private.owa_order_delivered() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  IF NEW.order_status='delivered' AND OLD.order_status IS DISTINCT FROM 'delivered' AND OLD.delivered_at IS NULL THEN
    NEW.delivered_at:=coalesce(NEW.delivered_at,clock_timestamp());
    PERFORM private.owa_enqueue(NEW.id,'delivery',NEW.customer_phone);
    PERFORM private.owa_enqueue(NEW.id,'follow_up',NEW.customer_phone);
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION private.owa_order_delivered() FROM PUBLIC;
DROP TRIGGER IF EXISTS orders_queue_whatsapp_on_delivery ON public.orders;
CREATE TRIGGER orders_queue_whatsapp_on_delivery BEFORE UPDATE OF order_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.owa_order_delivered();

-- Called once per paid order. Returns whether the tab is enabled, so the caller knows to skip the
-- legacy Postora customer message, and whether a confirmation was queued.
CREATE OR REPLACE FUNCTION public.owa_enqueue_confirmation(p_order_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE settings jsonb:=private.owa_settings(); phone text;
BEGIN
  IF settings->'enabled' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('enabled',false,'queued',false); END IF;
  IF NOT private.owa_kind_enabled(settings,'confirmation') THEN RETURN jsonb_build_object('enabled',true,'queued',false); END IF;
  SELECT customer_phone INTO phone FROM public.orders WHERE id=p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('enabled',true,'queued',false); END IF;
  PERFORM private.owa_enqueue(p_order_id,'confirmation',phone);
  RETURN jsonb_build_object('enabled',true,'queued',true);
END
$fn$;

-- Claims up to p_limit due messages for sending. Before claiming it:
--   * marks sends left in 'sending' for over 10 minutes as uncertain (the worker died mid-send);
--   * expires pending messages more than 24 hours past due, so a long disconnection never ends in a
--     burst of stale messages;
--   * skips messages whose kind is switched off, and delivery messages for orders no longer delivered.
-- The follow-up's due time follows the current follow_up_days, so a changed setting applies to queued ones.
CREATE OR REPLACE FUNCTION public.owa_claim_due(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE
  settings jsonb:=private.owa_settings();
  days integer:=private.owa_follow_up_days(settings);
  storefront text:=rtrim(coalesce((SELECT value->>'storefront_url' FROM public.site_settings WHERE key='order_email'),''),'/');
  item record; lang text; claimed jsonb:='[]'::jsonb;
BEGIN
  UPDATE public.order_whatsapp_messages SET status='uncertain',reason='send_uncertain',updated_at=clock_timestamp()
    WHERE status='sending' AND updated_at<clock_timestamp()-interval '10 minutes';
  UPDATE public.order_whatsapp_messages m SET status='expired',updated_at=clock_timestamp() FROM public.orders o
    WHERE o.id=m.order_id AND m.status='pending'
      AND private.owa_due_at(m.kind,m.created_at,o.delivered_at,days)<clock_timestamp()-interval '24 hours';
  FOR item IN
    SELECT m.id,m.kind,m.recipient,o.order_status::text AS order_status,o.language AS order_language,o.order_number,
      o.customer_name,o.total,o.payment_currency
    FROM public.order_whatsapp_messages m JOIN public.orders o ON o.id=m.order_id
    WHERE m.status='pending' AND private.owa_due_at(m.kind,m.created_at,o.delivered_at,days)<=clock_timestamp()
    ORDER BY private.owa_due_at(m.kind,m.created_at,o.delivered_at,days)
    LIMIT least(greatest(coalesce(p_limit,1),1),20)
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    IF NOT private.owa_kind_enabled(settings,item.kind) THEN
      UPDATE public.order_whatsapp_messages SET status='skipped',reason='disabled',updated_at=clock_timestamp() WHERE id=item.id;
    ELSIF item.kind<>'confirmation' AND item.order_status<>'delivered' THEN
      UPDATE public.order_whatsapp_messages SET status='skipped',reason='not_delivered',updated_at=clock_timestamp() WHERE id=item.id;
    ELSE
      lang:=CASE WHEN settings->>'language' IN ('ar','en') THEN settings->>'language' ELSE coalesce(item.order_language,'ar') END;
      UPDATE public.order_whatsapp_messages SET status='sending',language=lang,updated_at=clock_timestamp() WHERE id=item.id;
      claimed:=claimed||jsonb_build_object('id',item.id,'kind',item.kind,'language',lang,'recipient',item.recipient,
        'tokens',jsonb_build_object('customer_name',item.customer_name,'order_number',item.order_number,
          'total',to_char(item.total,'FM999999990.000'),'currency',item.payment_currency,
          'order_url',CASE WHEN storefront='' THEN '' ELSE storefront||'/order/'||item.order_number END));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('messages',claimed,'templates',
    CASE WHEN jsonb_typeof(settings->'templates')='object' THEN settings->'templates' ELSE '{}'::jsonb END);
END
$fn$;

-- Records the outcome of a claimed send. Only a message still in 'sending' changes.
CREATE OR REPLACE FUNCTION public.owa_finish(p_message_id uuid,p_status text,p_body text,p_provider_message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
  IF p_status NOT IN ('sent','uncertain') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_message_status'; END IF;
  UPDATE public.order_whatsapp_messages SET status=p_status,body=left(coalesce(p_body,''),4096),
      reason=CASE WHEN p_status='uncertain' THEN 'send_uncertain' END,provider_message_id=p_provider_message_id,
      updated_at=clock_timestamp()
    WHERE id=p_message_id AND status='sending';
  RETURN FOUND;
END
$fn$;

REVOKE ALL ON FUNCTION private.owa_recipient(text),private.owa_enqueue(uuid,text,text),private.owa_settings(),
  private.owa_kind_enabled(jsonb,text),private.owa_follow_up_days(jsonb),
  private.owa_due_at(text,timestamptz,timestamptz,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owa_enqueue_confirmation(uuid),public.owa_claim_due(integer),
  public.owa_finish(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owa_enqueue_confirmation(uuid),public.owa_claim_due(integer),
  public.owa_finish(uuid,text,text,text) TO service_role;
COMMIT;
