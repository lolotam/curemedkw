BEGIN;
SELECT pg_advisory_xact_lock(20261105,2);

-- A name typed by an administrator outranks the address-book and push names that Sync and incoming
-- messages write: once name_edited_at is set, only an update that also changes it can change display_name.
ALTER TABLE public.whatsapp_contacts ADD COLUMN IF NOT EXISTS name_edited_at timestamptz;
CREATE OR REPLACE FUNCTION private.wa_keep_edited_contact_name() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
  IF OLD.name_edited_at IS NOT NULL AND NEW.name_edited_at IS NOT DISTINCT FROM OLD.name_edited_at THEN
    NEW.display_name:=OLD.display_name;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION private.wa_keep_edited_contact_name() FROM PUBLIC;
DROP TRIGGER IF EXISTS whatsapp_contact_keep_edited_name ON public.whatsapp_contacts;
CREATE TRIGGER whatsapp_contact_keep_edited_name BEFORE UPDATE OF display_name ON public.whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION private.wa_keep_edited_contact_name();

-- Administrator edits of a WhatsApp contact. Name, business name, email and notes are always editable.
-- A phone number may only be attached to a contact that has none (an @lid contact), and never one that
-- another contact or chat already holds: the inbox does not merge chats or move numbers between them.
-- Refusals are returned as {ok:false, code} so the caller can name them; only unexpected errors raise.
CREATE OR REPLACE FUNCTION public.wa_update_inbox_contact(p_contact_id uuid,p_patch jsonb,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $fn$
DECLARE
  contact public.whatsapp_contacts;
  chat public.whatsapp_chats;
  phone text;
BEGIN
  PERFORM private.wa_require_admin(p_actor_id);
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) field
      WHERE field.key NOT IN ('display_name','business_name','email','notes','phone') OR jsonb_typeof(field.value)<>'string') THEN
    RETURN jsonb_build_object('ok',false,'code','invalid_contact_patch');
  END IF;
  SELECT * INTO contact FROM public.whatsapp_contacts WHERE id=p_contact_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','contact_not_found'); END IF;
  -- The contact's chat: by @lid address (directly or through a merge alias), otherwise by number.
  SELECT c.* INTO chat FROM public.whatsapp_chats c
    WHERE c.instance_identity='curemed' AND contact.remote_jid IS NOT NULL AND c.id=coalesce(
      (SELECT a.chat_id FROM private.wa_chat_aliases a WHERE a.instance_identity='curemed' AND a.remote_jid=contact.remote_jid),
      (SELECT x.id FROM public.whatsapp_chats x WHERE x.instance_identity='curemed' AND x.remote_jid=contact.remote_jid));
  IF chat.id IS NULL AND contact.normalized_phone IS NOT NULL THEN
    SELECT c.* INTO chat FROM public.whatsapp_chats c WHERE c.instance_identity='curemed' AND c.normalized_phone=contact.normalized_phone;
  END IF;
  phone:=p_patch->>'phone';
  IF p_patch ? 'phone' AND phone IS DISTINCT FROM contact.normalized_phone THEN
    IF contact.normalized_phone IS NOT NULL OR contact.remote_jid IS NULL THEN
      RETURN jsonb_build_object('ok',false,'code','phone_locked');
    END IF;
    IF phone !~ '^[1-9][0-9]{7,14}$' THEN RETURN jsonb_build_object('ok',false,'code','invalid_phone'); END IF;
    IF chat.normalized_phone IS NOT NULL AND chat.normalized_phone<>phone THEN
      RETURN jsonb_build_object('ok',false,'code','phone_locked');
    END IF;
    IF EXISTS (SELECT 1 FROM public.whatsapp_contacts WHERE normalized_phone=phone)
        OR EXISTS (SELECT 1 FROM public.whatsapp_chats WHERE instance_identity='curemed' AND normalized_phone=phone
          AND id IS DISTINCT FROM chat.id) THEN
      RETURN jsonb_build_object('ok',false,'code','phone_in_use');
    END IF;
    UPDATE public.whatsapp_chats SET normalized_phone=phone,updated_at=clock_timestamp()
      WHERE id=chat.id AND normalized_phone IS NULL;
    contact.normalized_phone:=phone;
  END IF;
  UPDATE public.whatsapp_contacts SET normalized_phone=contact.normalized_phone,
    display_name=coalesce(p_patch->>'display_name',display_name),
    name_edited_at=CASE WHEN p_patch ? 'display_name' THEN clock_timestamp() ELSE name_edited_at END,
    business_name=coalesce(p_patch->>'business_name',business_name),
    email=coalesce(p_patch->>'email',email),
    notes=coalesce(p_patch->>'notes',notes),
    updated_at=clock_timestamp()
    WHERE id=p_contact_id RETURNING * INTO contact;
  -- Ingestion only fills an empty chat name, so the edited name stays on the chat.
  IF p_patch ? 'display_name' AND chat.id IS NOT NULL THEN
    UPDATE public.whatsapp_chats SET display_name=contact.display_name,updated_at=clock_timestamp() WHERE id=chat.id;
  END IF;
  RETURN jsonb_build_object('ok',true,'contact',to_jsonb(contact));
EXCEPTION
  -- A concurrent ingest claimed the number between the check and the write.
  WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'code','phone_in_use');
END
$fn$;
REVOKE ALL ON FUNCTION public.wa_update_inbox_contact(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_update_inbox_contact(uuid,jsonb,uuid) TO service_role;
COMMIT;
