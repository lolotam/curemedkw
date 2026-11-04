BEGIN;
DO $proof$
DECLARE relation record; privileges text; private_visible boolean;
BEGIN
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = 'postgres') THEN
    RAISE EXCEPTION 'Fixture runner must not be superuser';
  END IF;
  IF pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.site_settings'::regclass)) <> 'postgres' THEN
    RAISE EXCEPTION 'site_settings owner mismatch';
  END IF;
  FOR relation IN
    SELECT n.nspname, c.relname, c.oid, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND ((n.nspname = 'public' AND c.relname = ANY(ARRAY[
      'whatsapp_settings','evolution_connections','whatsapp_contacts','whatsapp_contact_orders',
      'whatsapp_chats','whatsapp_media_objects','whatsapp_messages','whatsapp_notification_events',
      'whatsapp_delivery_jobs','whatsapp_delivery_attempts','whatsapp_account_dispatch',
      'whatsapp_pending_acks','whatsapp_tombstones','whatsapp_sync_runs']))
       OR (n.nspname = 'private' AND c.relname LIKE 'wa_%'))
  LOOP
    IF NOT relation.relrowsecurity THEN RAISE EXCEPTION 'Missing RLS: %', relation.relname; END IF;
    IF has_table_privilege('anon', relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'Anonymous table privilege: %', relation.relname;
    END IF;
    IF has_table_privilege('authenticated', relation.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'Browser writer privilege: %', relation.relname;
    END IF;
    IF relation.nspname = 'private' AND has_table_privilege('authenticated', relation.oid, 'SELECT') THEN
      RAISE EXCEPTION 'Private table visible to browser: %', relation.relname;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.site_settings'::regclass AND tgname LIKE 'wa_%') THEN
    RAISE EXCEPTION 'Compatibility guard must remain dormant in schema phase';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = child.relnamespace
    WHERE c.contype = 'f' AND c.confrelid IN ('public.orders'::regclass, 'public.payment_attempts'::regclass, 'auth.users'::regclass)
      AND (child.relname LIKE 'whatsapp_%' OR (n.nspname = 'private' AND child.relname LIKE 'wa_%'))
  ) THEN
    RAISE EXCEPTION 'Existing-table retention triggers must wait for approved app activation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'whatsapp-media' AND public = false AND file_size_limit = 10485760) THEN
    RAISE EXCEPTION 'Private media bucket contract failed';
  END IF;
END
$proof$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
DO $buyer$
BEGIN
  IF EXISTS (SELECT 1 FROM public.whatsapp_settings) THEN
    RAISE EXCEPTION 'Non-admin can read settings';
  END IF;
END
$buyer$;
RESET ROLE;
INSERT INTO auth.users(id, email) VALUES ('10000000-0000-4000-8000-000000000002', 'fixture-admin@example.test');
INSERT INTO public.user_roles(user_id, role) VALUES ('10000000-0000-4000-8000-000000000002', 'admin');
INSERT INTO storage.objects(bucket_id, name) VALUES ('whatsapp-media', 'fixture-only/private.pdf');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
DO $admin$
BEGIN
  IF (SELECT count(*) FROM public.whatsapp_settings) <> 1 THEN
    RAISE EXCEPTION 'Real admin cannot read safe settings';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'whatsapp-media') THEN
    RAISE EXCEPTION 'Browser admin can bypass private media endpoint';
  END IF;
END
$admin$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anonymous_storage$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'whatsapp-media') THEN
    RAISE EXCEPTION 'Anonymous private-media leak';
  END IF;
END
$anonymous_storage$;
RESET ROLE;
ROLLBACK;
SELECT 'Core privilege and non-admin RLS proofs passed';
