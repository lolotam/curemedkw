BEGIN;
INSERT INTO auth.users(id,email) VALUES('87000000-0000-4000-8000-000000000092','inbox@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('87000000-0000-4000-8000-000000000092','admin');
SET LOCAL ROLE service_role;
SELECT public.wa_ingest_messages('[{"remote_jid":"123456789012345@lid","display_name":"Test LID","provider_message_id":"lid-1","direction":"inbound","message_type":"text","body":"Hello","sent_at":"2026-11-05T10:00:00Z","count_unread":true}]');
SELECT public.wa_ingest_messages('[{"remote_jid":"123456789012345@lid","provider_message_id":"lid-1","direction":"inbound","message_type":"text","body":"Hello","sent_at":"2026-11-05T10:00:00Z","count_unread":true}]');
DO $dedup$
BEGIN
  IF (SELECT count(*) FROM public.whatsapp_messages WHERE provider_message_id='lid-1')<>1
    OR (SELECT unread_count FROM public.whatsapp_chats WHERE remote_jid='123456789012345@lid')<>1 THEN
    RAISE EXCEPTION 'Webhook replay duplicated message or unread count'; END IF;
END
$dedup$;
SELECT public.wa_ingest_messages('[{"remote_jid":"96550000092@s.whatsapp.net","normalized_phone":"96550000092","provider_message_id":"phone-2","direction":"inbound","message_type":"text","body":"New","sent_at":"2026-11-05T10:01:00Z","count_unread":true}]');
SELECT public.wa_ingest_messages('[{"remote_jid":"123456789012345@lid","normalized_phone":"96550000092","provider_message_id":"lid-1","direction":"inbound","message_type":"text","body":"Hello","sent_at":"2026-11-05T10:00:00Z","count_unread":false}]');
DO $merge_and_read$
DECLARE chat uuid; request uuid:=gen_random_uuid(); actor uuid:='87000000-0000-4000-8000-000000000092';
BEGIN
  SELECT id INTO chat FROM public.whatsapp_chats WHERE normalized_phone='96550000092';
  IF (SELECT count(*) FROM public.whatsapp_messages WHERE chat_id=chat)<>2 OR
    (SELECT unread_count FROM public.whatsapp_chats WHERE id=chat)<>2 THEN RAISE EXCEPTION 'LID merge lost messages'; END IF;
  PERFORM public.wa_mark_chat_read(chat,'lid-1',actor);
  IF (SELECT unread_count FROM public.whatsapp_chats WHERE id=chat)<>2 THEN RAISE EXCEPTION 'Read cleared a newer message'; END IF;
  PERFORM public.wa_mark_chat_read(chat,'phone-2',actor);
  IF (SELECT unread_count FROM public.whatsapp_chats WHERE id=chat)<>0 THEN RAISE EXCEPTION 'Read did not clear seen messages'; END IF;
  IF NOT public.wa_reserve_inbox_send(request,chat,actor,repeat('a',64))
    OR public.wa_reserve_inbox_send(request,chat,actor,repeat('a',64)) THEN RAISE EXCEPTION 'Repeated send was authorized'; END IF;
  PERFORM public.wa_update_ack('phone-2','read');
  PERFORM public.wa_update_ack('phone-2','delivered');
  IF (SELECT ack_state FROM public.whatsapp_messages WHERE provider_message_id='phone-2')<>'read' THEN RAISE EXCEPTION 'ACK regressed'; END IF;
END
$merge_and_read$;
SET LOCAL ROLE authenticated;
DO $permissions$
BEGIN
  IF EXISTS(SELECT 1 FROM public.whatsapp_messages) THEN RAISE EXCEPTION 'Non-admin can read inbox'; END IF;
  BEGIN
    PERFORM public.wa_ingest_messages('[]');
    RAISE EXCEPTION 'Browser can ingest';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$permissions$;
ROLLBACK;
