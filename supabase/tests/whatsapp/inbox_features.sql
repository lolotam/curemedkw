BEGIN;
INSERT INTO auth.users(id,email) VALUES('88000000-0000-4000-8000-000000000091','features@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('88000000-0000-4000-8000-000000000091','admin');
SET LOCAL ROLE service_role;
SELECT public.wa_ingest_messages('[{"remote_jid":"523456789012345@lid","provider_message_id":"feat-in","direction":"inbound","message_type":"text","body":"Customer question","sent_at":"2026-11-06T10:00:00Z","count_unread":true}]');
DO $preview$
DECLARE preview jsonb;
BEGIN
  SELECT last_message_preview INTO preview FROM public.whatsapp_chats WHERE remote_jid='523456789012345@lid';
  IF preview IS DISTINCT FROM '{"body":"Customer question","message_type":"text","direction":"inbound","ack_state":"accepted","deleted":false}'::jsonb THEN
    RAISE EXCEPTION 'Ingest did not summarize the last message: %',preview; END IF;
  PERFORM public.wa_ingest_messages('[{"remote_jid":"523456789012345@lid","provider_message_id":"feat-out","direction":"outbound","message_type":"text","body":"Our reply","sent_at":"2026-11-06T10:05:00Z"}]');
  -- An older message arriving late (history sync) must not replace the summary of the newest one.
  PERFORM public.wa_ingest_messages('[{"remote_jid":"523456789012345@lid","provider_message_id":"feat-old","direction":"inbound","message_type":"text","body":"Old history","sent_at":"2026-11-01T10:00:00Z","count_unread":false}]');
  PERFORM public.wa_update_ack('feat-out','read');
  SELECT last_message_preview INTO preview FROM public.whatsapp_chats WHERE remote_jid='523456789012345@lid';
  IF preview->>'body'<>'Our reply' OR preview->>'direction'<>'outbound' OR preview->>'ack_state'<>'read' THEN
    RAISE EXCEPTION 'Summary did not follow the newest message and its ack: %',preview; END IF;
END
$preview$;
RESET ROLE;
DO $deletes$
DECLARE actor uuid:='88000000-0000-4000-8000-000000000091'; inbound uuid; outbound uuid; preview jsonb;
BEGIN
  SELECT id INTO inbound FROM public.whatsapp_messages WHERE provider_message_id='feat-in';
  SELECT id INTO outbound FROM public.whatsapp_messages WHERE provider_message_id='feat-out';
  IF public.wa_delete_inbox_message(inbound,'everyone',actor) THEN RAISE EXCEPTION 'A customer message was revoked'; END IF;
  IF (SELECT body FROM public.whatsapp_messages WHERE id=inbound)<>'Customer question' THEN RAISE EXCEPTION 'Refused revoke changed the message'; END IF;
  IF NOT public.wa_delete_inbox_message(outbound,'everyone',actor) THEN RAISE EXCEPTION 'Own message revoke reported false'; END IF;
  IF NOT public.wa_delete_inbox_message(outbound,'everyone',actor) THEN RAISE EXCEPTION 'Repeated revoke reported false'; END IF;
  IF (SELECT remote_deleted_at IS NULL OR body<>'' FROM public.whatsapp_messages WHERE id=outbound) THEN RAISE EXCEPTION 'Revoke kept the content'; END IF;
  SELECT last_message_preview INTO preview FROM public.whatsapp_chats WHERE remote_jid='523456789012345@lid';
  IF preview->>'body'<>'' OR NOT (preview->>'deleted')::boolean THEN RAISE EXCEPTION 'Summary still shows revoked text: %',preview; END IF;
  IF NOT public.wa_delete_inbox_message(inbound,'local',actor) THEN RAISE EXCEPTION 'Local delete reported false'; END IF;
  IF (SELECT locally_deleted_at IS NULL OR body<>'Customer question' FROM public.whatsapp_messages WHERE id=inbound) THEN
    RAISE EXCEPTION 'Local delete must hide, not erase'; END IF;
  IF public.wa_delete_inbox_message(gen_random_uuid(),'local',actor) THEN RAISE EXCEPTION 'Unknown message reported deleted'; END IF;
  BEGIN
    PERFORM public.wa_delete_inbox_message(inbound,'all',actor);
    RAISE EXCEPTION 'Unknown scope accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'invalid_delete_scope' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.wa_delete_inbox_message(inbound,'local','88000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'Non-admin deleted a message';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$deletes$;
SET LOCAL ROLE service_role;
DO $phone_revoke$
BEGIN
  IF public.wa_apply_remote_revoke('not-ingested-yet') THEN RAISE EXCEPTION 'Unknown revoke reported applied'; END IF;
  IF NOT public.wa_apply_remote_revoke('feat-old') THEN RAISE EXCEPTION 'Phone revoke reported false'; END IF;
  IF (SELECT remote_deleted_at IS NULL OR body<>'' FROM public.whatsapp_messages WHERE provider_message_id='feat-old') THEN
    RAISE EXCEPTION 'Phone revoke kept the content'; END IF;
  UPDATE public.whatsapp_chats SET avatar_object_path='curemed/avatars/proof',avatar_checked_at=clock_timestamp()
    WHERE remote_jid='523456789012345@lid';
  IF NOT FOUND THEN RAISE EXCEPTION 'Edge function cannot record a profile picture'; END IF;
  BEGIN
    UPDATE public.whatsapp_chats SET last_message_preview='{}' WHERE remote_jid='523456789012345@lid';
    RAISE EXCEPTION 'Edge function can overwrite the trigger-owned summary';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$phone_revoke$;
RESET ROLE;
DO $backfill$
DECLARE preview jsonb;
BEGIN
  -- The migration backfill re-assigns last_message_id to itself; that must rebuild a missing summary.
  UPDATE public.whatsapp_chats SET last_message_preview=NULL WHERE remote_jid='523456789012345@lid';
  UPDATE public.whatsapp_chats SET last_message_id=last_message_id WHERE remote_jid='523456789012345@lid';
  SELECT last_message_preview INTO preview FROM public.whatsapp_chats WHERE remote_jid='523456789012345@lid';
  IF preview IS NULL OR NOT (preview->>'deleted')::boolean THEN RAISE EXCEPTION 'Backfill did not rebuild the summary'; END IF;
END
$backfill$;
SET LOCAL ROLE authenticated;
DO $permissions$
BEGIN
  BEGIN
    PERFORM public.wa_delete_inbox_message(gen_random_uuid(),'local','88000000-0000-4000-8000-000000000091');
    RAISE EXCEPTION 'Browser can call the delete RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.wa_apply_remote_revoke('feat-in');
    RAISE EXCEPTION 'Browser can revoke messages';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$permissions$;
ROLLBACK;
