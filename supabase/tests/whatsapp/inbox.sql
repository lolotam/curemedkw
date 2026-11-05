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
SELECT public.wa_ingest_messages('[{"remote_jid":"96550000092@s.whatsapp.net","normalized_phone":"96550000092","provider_message_id":"phone-2","direction":"inbound","message_type":"text","body":"New","sent_at":"2026-11-05T10:00:00Z","count_unread":true}]');
SELECT public.wa_reserve_inbox_send('87000000-0000-4000-8000-000000000093',(SELECT id FROM public.whatsapp_chats WHERE remote_jid='123456789012345@lid'),'87000000-0000-4000-8000-000000000092',repeat('b',64));
RESET ROLE;
UPDATE public.whatsapp_chats SET last_read_at='2026-11-05',last_read_message_id='saved-read' WHERE remote_jid='123456789012345@lid';
SET LOCAL ROLE service_role;
SELECT public.wa_ingest_messages('[{"remote_jid":"123456789012345@lid","normalized_phone":"96550000092","provider_message_id":"lid-1","direction":"inbound","message_type":"text","body":"Hello","sent_at":"2026-11-05T10:00:00Z","count_unread":false}]');
DO $merge_and_read$
DECLARE chat uuid; request uuid:=gen_random_uuid(); actor uuid:='87000000-0000-4000-8000-000000000092';
BEGIN
  SELECT id INTO chat FROM public.whatsapp_chats WHERE normalized_phone='96550000092';
  IF (SELECT count(*) FROM public.whatsapp_messages WHERE chat_id=chat)<>2 OR
    (SELECT unread_count FROM public.whatsapp_chats WHERE id=chat)<>2 THEN RAISE EXCEPTION 'LID merge lost messages'; END IF;
  IF (SELECT last_read_message_id FROM public.whatsapp_chats WHERE id=chat) IS DISTINCT FROM 'saved-read'
    OR (SELECT last_read_at FROM public.whatsapp_chats WHERE id=chat) IS DISTINCT FROM '2026-11-05'::timestamptz THEN RAISE EXCEPTION 'Merge lost read watermark'; END IF;
  IF public.wa_mark_chat_read(chat,'lid-1',actor) THEN RAISE EXCEPTION 'False read receipt'; END IF;
  IF (SELECT unread_count FROM public.whatsapp_chats WHERE id=chat)<>2 THEN RAISE EXCEPTION 'Read cleared a newer message'; END IF;
  IF NOT public.wa_mark_chat_read(chat,'phone-2',actor) THEN RAISE EXCEPTION 'Read of latest message reported false'; END IF;
  IF NOT public.wa_mark_chat_read(chat,'phone-2',actor) THEN RAISE EXCEPTION 'Repeated read of an already-read chat reported false'; END IF;
  IF (SELECT unread_count FROM public.whatsapp_chats WHERE id=chat)<>0 THEN RAISE EXCEPTION 'Read did not clear seen messages'; END IF;
  IF NOT public.wa_reserve_inbox_send(request,chat,actor,repeat('a',64))
    OR public.wa_reserve_inbox_send(request,chat,actor,repeat('a',64)) THEN RAISE EXCEPTION 'Repeated send was authorized'; END IF;
  BEGIN
    PERFORM public.wa_reserve_inbox_send(request,chat,actor,repeat('b',64));
    RAISE EXCEPTION 'Mismatch accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'request_content_mismatch' THEN RAISE; END IF;
  END;
  PERFORM public.wa_update_ack('phone-2','read');
  PERFORM public.wa_update_ack('phone-2','delivered');
  IF (SELECT ack_state FROM public.whatsapp_messages WHERE provider_message_id='phone-2')<>'read' THEN RAISE EXCEPTION 'ACK regressed'; END IF;
END
$merge_and_read$;
RESET ROLE;
DO $hardening$
DECLARE result jsonb; survivor uuid;
BEGIN
  SELECT id INTO survivor FROM public.whatsapp_chats WHERE normalized_phone='96550000092';
  IF (SELECT chat_id FROM private.wa_inbox_sends WHERE request_id='87000000-0000-4000-8000-000000000093')<>survivor THEN RAISE EXCEPTION 'Reservation not merged'; END IF;
  -- The subsequent explicit mark-read advances the retained merge watermark.
  IF (SELECT last_read_at FROM public.whatsapp_chats WHERE id=survivor) IS NULL THEN RAISE EXCEPTION 'Read watermark lost'; END IF;
  PERFORM public.wa_update_ack('early-ack','read');
  PERFORM public.wa_update_ack('early-ack','delivered');
  result:=public.wa_ingest_messages('[{"remote_jid":"12345@sXwhatsappXnet"},{"remote_jid":"323456789012345@lid","display_name":"Chat only"},{"remote_jid":"123456789012345@lid","remoteJidAlt":"96550000092@s.whatsapp.net","provider_message_id":"early-ack","direction":"outbound","message_type":"text","sent_at":"2026-11-05T12:00:00Z"}]');
  IF result<> '{"inserted":1,"skipped":1}'::jsonb THEN RAISE EXCEPTION 'Mixed batch failed: %',result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_chats WHERE remote_jid='323456789012345@lid') THEN RAISE EXCEPTION 'Chat-only sync row was dropped'; END IF;
  IF (SELECT ack_state FROM public.whatsapp_messages WHERE provider_message_id='early-ack')<>'read' OR EXISTS(SELECT 1 FROM public.whatsapp_pending_acks WHERE provider_message_id='early-ack') THEN RAISE EXCEPTION 'Pending ACK failed'; END IF;
  PERFORM public.wa_ingest_messages('[{"remote_jid":"223456789012345@lid","senderPn":"96550000092@s.whatsapp.net","provider_message_id":"alias-new","direction":"inbound","message_type":"text","sent_at":"2026-11-05T12:01:00Z"}]');
  IF (SELECT chat_id FROM public.whatsapp_messages WHERE provider_message_id='alias-new')<>survivor THEN RAISE EXCEPTION 'Alias duplicated chat'; END IF;
  -- A short phone jid is a valid address but not an E.164 number: the chat is kept with an unknown phone.
  PERFORM public.wa_ingest_messages('[{"remote_jid":"12345@s.whatsapp.net","provider_message_id":"short-phone","direction":"inbound","message_type":"text","sent_at":"2026-11-05T12:30:00Z"}]');
  IF (SELECT normalized_phone FROM public.whatsapp_chats WHERE remote_jid='12345@s.whatsapp.net') IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM public.whatsapp_messages WHERE provider_message_id='short-phone') THEN RAISE EXCEPTION 'Short phone jid was dropped'; END IF;
  -- Equal sent_at: the later-ingested message has the smaller id, so all three functions must agree on tie-b.
  PERFORM public.wa_ingest_messages('[{"remote_jid":"423456789012345@lid","provider_message_id":"tie-b","direction":"inbound","message_type":"text","sent_at":"2026-11-05T13:00:00Z","count_unread":true}]');
  PERFORM public.wa_ingest_messages('[{"remote_jid":"423456789012345@lid","provider_message_id":"tie-a","direction":"inbound","message_type":"text","sent_at":"2026-11-05T13:00:00Z","count_unread":true}]');
  IF (SELECT last_message_id FROM public.whatsapp_chats WHERE remote_jid='423456789012345@lid')<>'tie-b' THEN RAISE EXCEPTION 'Tie order differs from mark-read'; END IF;
  IF NOT public.wa_mark_chat_read((SELECT id FROM public.whatsapp_chats WHERE remote_jid='423456789012345@lid'),'tie-b','87000000-0000-4000-8000-000000000092') THEN
    RAISE EXCEPTION 'Mark-read of the latest tied message reported false'; END IF;
END
$hardening$;
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
