BEGIN;
SELECT pg_advisory_xact_lock(20261105,2);
INSERT INTO public.evolution_connections(instance_identity) VALUES('curemed') ON CONFLICT DO NOTHING;
ALTER TABLE public.whatsapp_chats ALTER COLUMN normalized_phone DROP NOT NULL;
DO $identity$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.whatsapp_chats'::regclass AND conname='whatsapp_chat_identity_required') THEN
    ALTER TABLE public.whatsapp_chats ADD CONSTRAINT whatsapp_chat_identity_required
      CHECK (normalized_phone IS NOT NULL OR (remote_jid IS NOT NULL AND remote_jid ~ '^[0-9]{5,30}@(s\.whatsapp\.net|lid)$'));
  END IF;
END
$identity$;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_chat_remote_identity ON public.whatsapp_chats(instance_identity,remote_jid);
ALTER TABLE public.whatsapp_contacts ALTER COLUMN normalized_phone DROP NOT NULL;
ALTER TABLE public.whatsapp_contacts ADD COLUMN IF NOT EXISTS remote_jid text;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_contact_remote_identity ON public.whatsapp_contacts(remote_jid);
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS provider_media jsonb;
ALTER TABLE public.whatsapp_sync_runs ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.whatsapp_sync_runs ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
CREATE OR REPLACE FUNCTION public.wa_claim_inbox_sync(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE run public.whatsapp_sync_runs;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  PERFORM pg_advisory_xact_lock(20261105,21);
  SELECT * INTO run FROM public.whatsapp_sync_runs WHERE instance_identity='curemed'
    AND state IN ('pending','running','partial') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND run.lease_expires_at>clock_timestamp() THEN RAISE EXCEPTION 'sync_busy'; END IF;
  IF run.id IS NULL THEN
    INSERT INTO public.whatsapp_sync_runs(instance_identity,session_generation,created_by,cursor_json)
      VALUES('curemed',0,p_actor_id,'{"stage":"contacts","page":1}') RETURNING * INTO run;
  END IF;
  UPDATE public.whatsapp_sync_runs SET state='running',lease_token=(gen_random_uuid()),
    lease_expires_at=clock_timestamp()+interval '45 seconds',updated_at=clock_timestamp()
    WHERE id=run.id RETURNING * INTO run;
  RETURN to_jsonb(run);
END
$fn$;
REVOKE ALL ON FUNCTION public.wa_claim_inbox_sync(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_claim_inbox_sync(uuid) TO service_role;
CREATE TABLE IF NOT EXISTS private.wa_chat_aliases (
  instance_identity text NOT NULL, remote_jid text NOT NULL,
  chat_id uuid NOT NULL REFERENCES public.whatsapp_chats(id),
  PRIMARY KEY(instance_identity,remote_jid)
);
ALTER TABLE private.wa_chat_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.wa_chat_aliases FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS private.wa_inbox_sends (
  request_id uuid PRIMARY KEY, chat_id uuid NOT NULL REFERENCES public.whatsapp_chats(id),
  actor_id uuid NOT NULL, content_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.wa_inbox_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.wa_inbox_sends FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.wa_reserve_inbox_send(p_request_id uuid,p_chat_id uuid,p_actor_id uuid,p_content_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE inserted uuid;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  IF p_content_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_content_hash'; END IF;
  PERFORM pg_advisory_xact_lock(20261105,20);
  PERFORM 1 FROM public.whatsapp_chats WHERE id=p_chat_id FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO private.wa_inbox_sends(request_id,chat_id,actor_id,content_hash) VALUES(p_request_id,p_chat_id,p_actor_id,p_content_hash)
    ON CONFLICT DO NOTHING RETURNING request_id INTO inserted;
  IF inserted IS NULL AND EXISTS(SELECT 1 FROM private.wa_inbox_sends WHERE request_id=p_request_id AND content_hash IS DISTINCT FROM p_content_hash) THEN
    RAISE EXCEPTION 'request_content_mismatch';
  END IF;
  RETURN inserted IS NOT NULL;
END
$fn$;
REVOKE ALL ON FUNCTION public.wa_reserve_inbox_send(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_reserve_inbox_send(uuid,uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.wa_ingest_messages(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE skipped integer:=0; alt text; pending public.whatsapp_pending_acks; entry jsonb; jid text; phone text; chat uuid; other_chat uuid; inserted uuid; inserted_count integer:=0; stamp timestamptz;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>200 THEN
    RAISE EXCEPTION 'invalid_inbox_batch'; END IF;
  -- Serializes aliases, merges and read counters, including concurrent sync/webhook batches.
  PERFORM pg_advisory_xact_lock(20261105,20);
  FOR entry IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
    jid:=entry->>'remote_jid'; phone:=entry->>'normalized_phone'; chat:=NULL; other_chat:=NULL;
    IF jid IS NULL OR jid !~ '^[0-9]{5,30}@(s\.whatsapp\.net|lid)$' THEN RAISE EXCEPTION 'invalid_chat_identity'; END IF;
    IF phone IS NOT NULL AND phone !~ '^[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'invalid_chat_phone'; END IF;
    alt:=coalesce(entry->>'remoteJidAlt',entry->>'senderPn');
    IF alt IS NOT NULL AND alt !~ '^[0-9]{5,30}@(s\.whatsapp\.net|lid)$' THEN
      RAISE EXCEPTION 'invalid_chat_identity';
    END IF;
    phone:=coalesce(phone,CASE WHEN jid LIKE '%@s.whatsapp.net' THEN split_part(jid,'@',1)
      WHEN alt LIKE '%@s.whatsapp.net' THEN split_part(alt,'@',1) END);
    IF entry->>'contact_only'='true' THEN
      IF phone IS NOT NULL THEN
        INSERT INTO public.whatsapp_contacts(normalized_phone,display_name) VALUES(phone,left(coalesce(entry->>'display_name',''),200))
          ON CONFLICT(normalized_phone) DO UPDATE SET display_name=CASE WHEN excluded.display_name<>'' THEN excluded.display_name ELSE whatsapp_contacts.display_name END;
      ELSE
        INSERT INTO public.whatsapp_contacts(remote_jid,display_name) VALUES(jid,left(coalesce(entry->>'display_name',''),200))
          ON CONFLICT(remote_jid) DO UPDATE SET display_name=CASE WHEN excluded.display_name<>'' THEN excluded.display_name ELSE whatsapp_contacts.display_name END;
      END IF;
      CONTINUE;
    END IF;
    entry:=jsonb_set(entry,'{display_name}',to_jsonb(coalesce(nullif(entry->>'display_name',''),
      (SELECT display_name FROM public.whatsapp_contacts WHERE (phone IS NOT NULL AND normalized_phone=phone) OR remote_jid=jid ORDER BY normalized_phone NULLS LAST LIMIT 1),'')));
    SELECT chat_id INTO chat FROM private.wa_chat_aliases WHERE instance_identity='curemed' AND remote_jid=jid;
    IF chat IS NULL THEN SELECT chat_id INTO chat FROM private.wa_chat_aliases WHERE instance_identity='curemed' AND remote_jid=alt; END IF;
    IF chat IS NULL THEN SELECT id INTO chat FROM public.whatsapp_chats WHERE instance_identity='curemed' AND remote_jid=alt; END IF;
    IF chat IS NULL THEN SELECT id INTO chat FROM public.whatsapp_chats WHERE instance_identity='curemed' AND remote_jid=jid; END IF;
    IF phone IS NOT NULL THEN SELECT id INTO other_chat FROM public.whatsapp_chats WHERE instance_identity='curemed' AND normalized_phone=phone; END IF;
    IF chat IS NULL THEN chat:=other_chat; END IF;
    IF chat IS NULL THEN
      INSERT INTO public.whatsapp_chats(instance_identity,remote_jid,normalized_phone,display_name)
        VALUES('curemed',jid,phone,left(coalesce(entry->>'display_name',''),200)) RETURNING id INTO chat;
    ELSIF other_chat IS NOT NULL AND chat<>other_chat THEN
      PERFORM id FROM public.whatsapp_chats WHERE id IN (chat,other_chat) ORDER BY id FOR UPDATE;
      INSERT INTO private.wa_chat_aliases SELECT instance_identity,remote_jid,other_chat FROM public.whatsapp_chats WHERE id=chat AND remote_jid IS NOT NULL
        ON CONFLICT(instance_identity,remote_jid) DO UPDATE SET chat_id=excluded.chat_id;
      UPDATE public.whatsapp_messages SET chat_id=other_chat WHERE chat_id=chat;
      UPDATE private.wa_inbox_sends SET chat_id=other_chat WHERE chat_id=chat;
      UPDATE private.wa_chat_aliases SET chat_id=other_chat WHERE chat_id=chat;
      UPDATE public.whatsapp_chats target SET unread_count=target.unread_count+source.unread_count,
        last_read_message_id=CASE WHEN source.last_read_at>target.last_read_at OR target.last_read_at IS NULL THEN source.last_read_message_id ELSE target.last_read_message_id END,
        last_read_at=greatest(target.last_read_at,source.last_read_at),
        last_message_at=greatest(target.last_message_at,source.last_message_at),
        last_message_id=CASE WHEN source.last_message_at>target.last_message_at OR target.last_message_at IS NULL
          THEN source.last_message_id ELSE target.last_message_id END
        FROM public.whatsapp_chats source WHERE target.id=other_chat AND source.id=chat;
      DELETE FROM public.whatsapp_chats WHERE id=chat;
      chat:=other_chat;
    END IF;
    INSERT INTO private.wa_chat_aliases VALUES('curemed',jid,chat) ON CONFLICT(instance_identity,remote_jid) DO UPDATE SET chat_id=excluded.chat_id;
    IF alt IS NOT NULL THEN
      INSERT INTO private.wa_chat_aliases VALUES('curemed',alt,chat) ON CONFLICT(instance_identity,remote_jid) DO UPDATE SET chat_id=excluded.chat_id;
    END IF;
    UPDATE public.whatsapp_chats SET normalized_phone=coalesce(normalized_phone,phone),
      display_name=CASE WHEN display_name='' THEN left(coalesce(entry->>'display_name',''),200) ELSE display_name END,
      updated_at=clock_timestamp() WHERE id=chat;
    IF phone IS NOT NULL THEN
      INSERT INTO public.whatsapp_contacts(normalized_phone,display_name) VALUES(phone,left(coalesce(entry->>'display_name',''),200))
        ON CONFLICT(normalized_phone) DO UPDATE SET display_name=CASE WHEN whatsapp_contacts.display_name=''
          THEN excluded.display_name ELSE whatsapp_contacts.display_name END;
    ELSE
      INSERT INTO public.whatsapp_contacts(remote_jid,display_name) VALUES(jid,left(coalesce(entry->>'display_name',''),200))
        ON CONFLICT(remote_jid) DO UPDATE SET display_name=CASE WHEN whatsapp_contacts.display_name=''
          THEN excluded.display_name ELSE whatsapp_contacts.display_name END;
    END IF;
    -- Chat-list sync rows carry no message; the chat upsert above is the whole effect.
    IF nullif(entry->>'provider_message_id','') IS NULL THEN CONTINUE; END IF;
    stamp:=(entry->>'sent_at')::timestamptz;
    INSERT INTO public.whatsapp_messages(chat_id,instance_identity,provider_message_id,session_generation,direction,message_type,body,sent_at,historical,provider_media)
      VALUES(chat,'curemed',entry->>'provider_message_id',0,entry->>'direction',entry->>'message_type',
        coalesce(entry->>'body',''),stamp,NOT coalesce((entry->>'count_unread')::boolean,false),entry->'provider_media')
      ON CONFLICT(instance_identity,provider_message_id) DO NOTHING RETURNING id INTO inserted;
    SELECT * INTO pending FROM public.whatsapp_pending_acks WHERE instance_identity='curemed' AND provider_message_id=entry->>'provider_message_id';
    IF FOUND THEN
      PERFORM public.wa_update_ack(pending.provider_message_id,pending.ack_state);
      DELETE FROM public.whatsapp_pending_acks WHERE instance_identity='curemed' AND provider_message_id=pending.provider_message_id;
    END IF;
    IF inserted IS NOT NULL THEN
      inserted_count:=inserted_count+1;
      UPDATE public.whatsapp_chats SET
        last_message_id=CASE WHEN last_message_at IS NULL OR stamp>=last_message_at THEN entry->>'provider_message_id' ELSE last_message_id END,
        last_message_at=greatest(last_message_at,stamp),
        unread_count=unread_count+CASE WHEN entry->>'direction'='inbound' AND entry->>'count_unread'='true' THEN 1 ELSE 0 END
        WHERE id=chat;
    END IF;
    EXCEPTION WHEN data_exception OR integrity_constraint_violation OR raise_exception THEN
      skipped:=skipped+1;
    END;
  END LOOP;
  RETURN jsonb_build_object('inserted',inserted_count,'skipped',skipped);
END
$fn$;

DROP FUNCTION IF EXISTS public.wa_mark_chat_read(uuid,text,uuid);
CREATE OR REPLACE FUNCTION public.wa_mark_chat_read(p_chat_id uuid,p_seen_message_id text,p_actor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  PERFORM pg_advisory_xact_lock(20261105,20);
  UPDATE public.whatsapp_chats SET unread_count=0,last_read_message_id=p_seen_message_id,last_read_at=clock_timestamp()
    -- Equal timestamps use provider_message_id in C collation as the deterministic tie-break.
    WHERE id=p_chat_id AND unread_count>0 AND p_seen_message_id=(
      SELECT provider_message_id FROM public.whatsapp_messages WHERE chat_id=p_chat_id
      ORDER BY sent_at DESC,provider_message_id COLLATE "C" DESC LIMIT 1);
  RETURN FOUND;
END
$fn$;

CREATE OR REPLACE FUNCTION public.wa_update_ack(p_message_id text,p_state text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  IF p_state NOT IN ('accepted','delivered','read','rejected') THEN RAISE EXCEPTION 'invalid_ack'; END IF;
  PERFORM pg_advisory_xact_lock(20261105,20);
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_messages WHERE instance_identity='curemed' AND provider_message_id=p_message_id) THEN
    IF p_state<>'accepted' THEN
      INSERT INTO public.whatsapp_pending_acks(instance_identity,provider_message_id,ack_state,occurred_at)
        VALUES('curemed',p_message_id,p_state,clock_timestamp())
        ON CONFLICT(instance_identity,provider_message_id) DO UPDATE SET ack_state=excluded.ack_state,occurred_at=excluded.occurred_at
        WHERE whatsapp_pending_acks.ack_state<>'read' AND excluded.ack_state='read';
    END IF;
    RETURN;
  END IF;
  UPDATE public.whatsapp_messages SET ack_state=p_state,
    delivered_at=CASE WHEN p_state='delivered' THEN clock_timestamp() ELSE delivered_at END,
    read_at=CASE WHEN p_state='read' THEN clock_timestamp() ELSE read_at END,
    rejected_at=CASE WHEN p_state='rejected' THEN clock_timestamp() ELSE rejected_at END
    WHERE instance_identity='curemed' AND provider_message_id=p_message_id
      AND ((ack_state='accepted') OR (ack_state='delivered' AND p_state='read'));
END
$fn$;
REVOKE ALL ON FUNCTION public.wa_ingest_messages(jsonb),public.wa_mark_chat_read(uuid,text,uuid),public.wa_update_ack(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_ingest_messages(jsonb),public.wa_mark_chat_read(uuid,text,uuid),public.wa_update_ack(text,text) TO service_role;
GRANT INSERT,UPDATE ON public.whatsapp_sync_runs,public.whatsapp_media_objects TO service_role;
GRANT UPDATE ON public.evolution_connections,public.whatsapp_messages TO service_role;
DO $publication$
DECLARE name text;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    FOREACH name IN ARRAY ARRAY['whatsapp_chats','whatsapp_messages'] LOOP
      IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=name) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',name);
      END IF;
    END LOOP;
  END IF;
END
$publication$;
COMMIT;
