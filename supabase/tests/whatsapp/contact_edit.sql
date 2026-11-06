BEGIN;
INSERT INTO auth.users(id,email) VALUES('89000000-0000-4000-8000-000000000091','contacts@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('89000000-0000-4000-8000-000000000091','admin');
SET LOCAL ROLE service_role;
-- An @lid chat without a number, a chat that already has the number 96550000077, and a phone-keyed chat.
SELECT public.wa_ingest_messages('[
  {"remote_jid":"623456789012345@lid","provider_message_id":"contact-lid","direction":"inbound","message_type":"text","body":"Hi","sent_at":"2026-11-06T10:00:00Z","display_name":"Pushname"},
  {"remote_jid":"96550000077@s.whatsapp.net","provider_message_id":"contact-taken","direction":"inbound","message_type":"text","body":"Hi","sent_at":"2026-11-06T10:01:00Z"},
  {"remote_jid":"96550000066@s.whatsapp.net","provider_message_id":"contact-phone","direction":"inbound","message_type":"text","body":"Hi","sent_at":"2026-11-06T10:02:00Z"}
]');
DO $contacts$
DECLARE
  actor uuid:='89000000-0000-4000-8000-000000000091';
  lid uuid; phoned uuid; receipt jsonb; chats_before bigint;
BEGIN
  SELECT id INTO lid FROM public.whatsapp_contacts WHERE remote_jid='623456789012345@lid';
  SELECT id INTO phoned FROM public.whatsapp_contacts WHERE normalized_phone='96550000066';

  -- Profile fields are always editable, and the edited name replaces the chat's push name.
  receipt:=public.wa_update_inbox_contact(lid,'{"display_name":"Sara Ali","business_name":"Pharmacy","email":"sara@example.test","notes":"VIP"}',actor);
  IF NOT (receipt->>'ok')::boolean OR receipt->'contact'->>'business_name'<>'Pharmacy' THEN RAISE EXCEPTION 'Profile edit refused: %',receipt; END IF;
  IF (SELECT display_name FROM public.whatsapp_chats WHERE remote_jid='623456789012345@lid')<>'Sara Ali' THEN
    RAISE EXCEPTION 'Chat kept the push name'; END IF;
  -- A later message with a push name must not overwrite the edited chat name.
  PERFORM public.wa_ingest_messages('[{"remote_jid":"623456789012345@lid","provider_message_id":"contact-lid-2","direction":"inbound","message_type":"text","body":"Again","sent_at":"2026-11-06T10:03:00Z","display_name":"Pushname"}]');
  IF (SELECT display_name FROM public.whatsapp_chats WHERE remote_jid='623456789012345@lid')<>'Sara Ali' THEN
    RAISE EXCEPTION 'Ingestion overwrote the edited chat name'; END IF;
  -- A Sync of the phone's address book must not overwrite the edited contact name either.
  PERFORM public.wa_ingest_messages('[{"remote_jid":"623456789012345@lid","display_name":"Address book","contact_only":true}]');
  IF (SELECT display_name FROM public.whatsapp_contacts WHERE id=lid)<>'Sara Ali' THEN
    RAISE EXCEPTION 'Sync overwrote the edited contact name'; END IF;
  -- An unedited contact still takes the address-book name.
  PERFORM public.wa_ingest_messages('[{"remote_jid":"96550000066@s.whatsapp.net","display_name":"Address book","contact_only":true}]');
  IF (SELECT display_name FROM public.whatsapp_contacts WHERE id=phoned)<>'Address book' THEN
    RAISE EXCEPTION 'Sync no longer names unedited contacts'; END IF;

  -- A number that another chat holds is refused and nothing changes.
  receipt:=public.wa_update_inbox_contact(lid,'{"phone":"96550000077"}',actor);
  IF receipt->>'code' IS DISTINCT FROM 'phone_in_use' THEN RAISE EXCEPTION 'Taken number accepted: %',receipt; END IF;
  IF (SELECT normalized_phone FROM public.whatsapp_contacts WHERE id=lid) IS NOT NULL THEN RAISE EXCEPTION 'Refused attach changed the contact'; END IF;
  IF public.wa_update_inbox_contact(lid,'{"phone":"0123"}',actor)->>'code' IS DISTINCT FROM 'invalid_phone' THEN
    RAISE EXCEPTION 'Malformed number accepted'; END IF;

  -- A free number is attached to the @lid contact and its chat, without merging anything.
  SELECT count(*) INTO chats_before FROM public.whatsapp_chats;
  receipt:=public.wa_update_inbox_contact(lid,'{"phone":"96550000088"}',actor);
  IF receipt->'contact'->>'normalized_phone' IS DISTINCT FROM '96550000088' THEN RAISE EXCEPTION 'Free number refused: %',receipt; END IF;
  IF (SELECT normalized_phone FROM public.whatsapp_chats WHERE remote_jid='623456789012345@lid') IS DISTINCT FROM '96550000088' THEN
    RAISE EXCEPTION 'Chat did not get the attached number'; END IF;
  IF (SELECT count(*) FROM public.whatsapp_chats) <> chats_before THEN RAISE EXCEPTION 'Attaching changed the chat set'; END IF;

  -- Once a contact has a number it is locked, including contacts that always had one.
  IF public.wa_update_inbox_contact(lid,'{"phone":"96550000099"}',actor)->>'code' IS DISTINCT FROM 'phone_locked' THEN
    RAISE EXCEPTION 'Attached number was replaced'; END IF;
  IF public.wa_update_inbox_contact(phoned,'{"phone":"96550000099"}',actor)->>'code' IS DISTINCT FROM 'phone_locked' THEN
    RAISE EXCEPTION 'A phone contact got a new number'; END IF;
  IF NOT (public.wa_update_inbox_contact(phoned,'{"phone":"96550000066","notes":"same number"}',actor)->>'ok')::boolean THEN
    RAISE EXCEPTION 'Resending the current number with an edit was refused'; END IF;

  IF public.wa_update_inbox_contact(lid,'{"user_id":"x"}',actor)->>'code' IS DISTINCT FROM 'invalid_contact_patch' THEN
    RAISE EXCEPTION 'Unknown field accepted'; END IF;
  IF public.wa_update_inbox_contact(lid,'{"notes":null}',actor)->>'code' IS DISTINCT FROM 'invalid_contact_patch' THEN
    RAISE EXCEPTION 'Non-string value accepted'; END IF;
  IF public.wa_update_inbox_contact(gen_random_uuid(),'{"notes":"x"}',actor)->>'code' IS DISTINCT FROM 'contact_not_found' THEN
    RAISE EXCEPTION 'Unknown contact accepted'; END IF;
  BEGIN
    PERFORM public.wa_update_inbox_contact(lid,'{"notes":"x"}',gen_random_uuid());
    RAISE EXCEPTION 'A non-admin edited a contact';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$contacts$;
RESET ROLE;
DO $grants$
BEGIN
  IF has_function_privilege('authenticated','public.wa_update_inbox_contact(uuid,jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can edit contacts directly'; END IF;
END
$grants$;
ROLLBACK;
