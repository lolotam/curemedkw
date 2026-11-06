BEGIN;
SELECT pg_advisory_xact_lock(20261105,2);

-- Profile pictures are cached as bytes in the private whatsapp-media bucket (path in the existing
-- avatar_object_path column); avatar_checked_at throttles provider lookups, including "no picture".
ALTER TABLE public.whatsapp_chats ADD COLUMN IF NOT EXISTS avatar_checked_at timestamptz;
-- Summary of the message last_message_id points at, so the chat list needs no second query.
ALTER TABLE public.whatsapp_chats ADD COLUMN IF NOT EXISTS last_message_preview jsonb;
GRANT UPDATE(avatar_object_path,avatar_checked_at) ON public.whatsapp_chats TO service_role;

CREATE OR REPLACE FUNCTION private.wa_message_preview(m public.whatsapp_messages)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $fn$
  SELECT jsonb_build_object(
    'body', CASE WHEN m.remote_deleted_at IS NULL AND m.locally_deleted_at IS NULL THEN left(m.body,160) ELSE '' END,
    'message_type', m.message_type, 'direction', m.direction, 'ack_state', m.ack_state,
    'deleted', m.remote_deleted_at IS NOT NULL OR m.locally_deleted_at IS NOT NULL);
$fn$;

-- Every path that moves last_message_id (ingest, send echo, LID merge) refreshes the summary here.
CREATE OR REPLACE FUNCTION private.wa_chat_preview_from_last()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  IF TG_OP='UPDATE' AND NEW.last_message_id IS NOT DISTINCT FROM OLD.last_message_id AND NEW.last_message_preview IS NOT NULL THEN
    RETURN NEW;
  END IF;
  NEW.last_message_preview:=(SELECT private.wa_message_preview(m) FROM public.whatsapp_messages m
    WHERE m.instance_identity=NEW.instance_identity AND m.provider_message_id=NEW.last_message_id);
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS wa_chat_preview ON public.whatsapp_chats;
CREATE TRIGGER wa_chat_preview BEFORE INSERT OR UPDATE OF last_message_id ON public.whatsapp_chats
  FOR EACH ROW EXECUTE FUNCTION private.wa_chat_preview_from_last();

-- Acks and deletions change the last message without moving last_message_id.
CREATE OR REPLACE FUNCTION private.wa_message_preview_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  UPDATE public.whatsapp_chats SET last_message_preview=private.wa_message_preview(NEW)
    WHERE id=NEW.chat_id AND last_message_id=NEW.provider_message_id
      AND last_message_preview IS DISTINCT FROM private.wa_message_preview(NEW);
  RETURN NULL;
END
$fn$;
DROP TRIGGER IF EXISTS wa_message_preview ON public.whatsapp_messages;
CREATE TRIGGER wa_message_preview AFTER UPDATE OF ack_state,body,locally_deleted_at,remote_deleted_at ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION private.wa_message_preview_sync();
REVOKE ALL ON FUNCTION private.wa_message_preview(public.whatsapp_messages),private.wa_chat_preview_from_last(),
  private.wa_message_preview_sync() FROM PUBLIC,anon,authenticated;

-- Backfill: re-assigning last_message_id fires the summary trigger for every chat that has one.
UPDATE public.whatsapp_chats SET last_message_id=last_message_id
  WHERE last_message_id IS NOT NULL AND last_message_preview IS NULL;

-- Admin delete. 'local' hides the message in this inbox only; 'everyone' records a revoke the edge
-- function has already sent to WhatsApp, so it is limited to outbound messages.
CREATE OR REPLACE FUNCTION public.wa_delete_inbox_message(p_message_id uuid,p_scope text,p_actor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  IF p_scope='local' THEN
    UPDATE public.whatsapp_messages SET locally_deleted_at=coalesce(locally_deleted_at,clock_timestamp())
      WHERE id=p_message_id AND instance_identity='curemed';
  ELSIF p_scope='everyone' THEN
    UPDATE public.whatsapp_messages SET remote_deleted_at=coalesce(remote_deleted_at,clock_timestamp()),
      body='',provider_media=NULL,media_object_id=NULL
      WHERE id=p_message_id AND instance_identity='curemed' AND direction='outbound';
  ELSE
    RAISE EXCEPTION 'invalid_delete_scope';
  END IF;
  RETURN FOUND;
END
$fn$;

-- A "delete for everyone" made on a phone. Unknown ids are ignored: the revoke may precede ingestion.
CREATE OR REPLACE FUNCTION public.wa_apply_remote_revoke(p_provider_message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
BEGIN
  UPDATE public.whatsapp_messages SET remote_deleted_at=coalesce(remote_deleted_at,clock_timestamp()),
    body='',provider_media=NULL,media_object_id=NULL
    WHERE instance_identity='curemed' AND provider_message_id=p_provider_message_id;
  RETURN FOUND;
END
$fn$;
REVOKE ALL ON FUNCTION public.wa_delete_inbox_message(uuid,text,uuid),public.wa_apply_remote_revoke(text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_delete_inbox_message(uuid,text,uuid),public.wa_apply_remote_revoke(text) TO service_role;
COMMIT;
