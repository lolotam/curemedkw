-- Phase 1 is additive and inert beside the existing application.
-- Do not attach a trigger to, change grants on, or rewrite existing application tables.
BEGIN;
SELECT pg_advisory_xact_lock(20261103, 1);

CREATE SCHEMA IF NOT EXISTS private AUTHORIZATION postgres;

CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  settings_revision bigint NOT NULL DEFAULT 0 CHECK (settings_revision >= 0),
  provider text NOT NULL DEFAULT 'postora' CHECK (provider IN ('postora','evolution')),
  account_identity text CHECK (length(account_identity) BETWEEN 1 AND 200),
  integration_enabled boolean NOT NULL DEFAULT false,
  automation_enabled boolean NOT NULL DEFAULT false,
  cutover_version smallint NOT NULL DEFAULT 0 CHECK (cutover_version IN (0,1)),
  default_country text NOT NULL DEFAULT 'KW' CHECK (default_country = 'KW'),
  audiences jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(audiences) = 'object'),
  recipients jsonb NOT NULL DEFAULT '{"admins":[],"custom":[]}'::jsonb CHECK (jsonb_typeof(recipients) = 'object'),
  legacy_events jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(legacy_events) = 'object'),
  legacy_templates jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(legacy_templates) = 'object'),
  legacy_language text NOT NULL DEFAULT 'ar' CHECK (legacy_language IN ('ar','en')),
  scheduler_heartbeat_at timestamptz,
  first_activated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.whatsapp_settings(singleton) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS private.wa_release_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  state text NOT NULL DEFAULT 'unmigrated' CHECK (state IN ('unmigrated','migrated','active','rollback_readonly')),
  compatibility_guard_armed boolean NOT NULL DEFAULT false,
  retention_ready boolean NOT NULL DEFAULT false,
  migrated_at timestamptz,
  baseline_fallback_verified_at timestamptz,
  active_credential_binding text CHECK (length(active_credential_binding) BETWEEN 1 AND 200),
  legacy_fingerprint text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.wa_release_state(singleton) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS private.wa_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('postora','evolution')),
  account_identity text NOT NULL CHECK (length(account_identity) BETWEEN 1 AND 200),
  purpose text NOT NULL CHECK (purpose IN ('provider_api','webhook_generation')),
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
  credential_revision bigint NOT NULL CHECK (credential_revision > 0),
  key_version integer NOT NULL CHECK (key_version > 0),
  ciphertext text NOT NULL CHECK (length(ciphertext) BETWEEN 16 AND 65536),
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 12 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, account_identity, purpose, generation)
);

-- Readiness is an expiring server observation bound to the exact stored secret.
-- The browser's opaque proof token is never accepted without this record.
CREATE TABLE IF NOT EXISTS private.wa_provider_readiness (
  provider text NOT NULL CHECK (provider IN ('postora','evolution')),
  credential_binding text NOT NULL CHECK (length(credential_binding) BETWEEN 1 AND 200),
  proof_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  credential_fingerprint text NOT NULL CHECK (credential_fingerprint ~ '^[a-f0-9]{64}$'),
  account_identity text NOT NULL CHECK (length(account_identity) BETWEEN 1 AND 200),
  session_generation bigint CHECK (session_generation > 0),
  baseline_fallback_verified boolean NOT NULL DEFAULT false,
  legacy_fingerprint text CHECK (legacy_fingerprint ~ '^[a-f0-9]{64}$'),
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  consumed_at timestamptz,
  PRIMARY KEY(provider, credential_binding),
  CHECK (expires_at > observed_at AND expires_at <= observed_at + interval '5 minutes'),
  CHECK ((provider = 'evolution') = (session_generation IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS private.wa_payment_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE ,
  attempt_id uuid NOT NULL ,
  invoice_id text NOT NULL CHECK (length(invoice_id) BETWEEN 1 AND 200),
  transaction_payment_id text NOT NULL CHECK (length(transaction_payment_id) BETWEEN 1 AND 200),
  source text NOT NULL CHECK (source IN ('signed_webhook','verified_callback')),
  owner text NOT NULL CHECK (owner IN ('legacy','durable')),
  provider text NOT NULL CHECK (provider IN ('postora','evolution')),
  account_identity text,
  settings_revision bigint NOT NULL CHECK (settings_revision >= 0),
  integration_enabled boolean NOT NULL,
  automation_enabled boolean NOT NULL,
  input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot) = 'object'),
  legacy_expansion_state text NOT NULL DEFAULT 'pending' CHECK (legacy_expansion_state IN ('pending','expanded','enqueue_failed','skipped')),
  safe_reason text CHECK (length(safe_reason) <= 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private.wa_pending_payment_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid ,
  attempt_id uuid ,
  outcome_id uuid REFERENCES private.wa_payment_outcomes(id) ON DELETE RESTRICT,
  invoice_id text NOT NULL CHECK (length(invoice_id) BETWEEN 1 AND 200),
  transaction_payment_id text NOT NULL CHECK (length(transaction_payment_id) BETWEEN 1 AND 200),
  signed_external_identifier text NOT NULL CHECK (length(signed_external_identifier) BETWEEN 1 AND 200),
  signed_status text NOT NULL CHECK (length(signed_status) BETWEEN 1 AND 100),
  state text NOT NULL DEFAULT 'unresolved' CHECK (state IN ('unresolved','resolved','evidence_mismatch','superseded','needs_review')),
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_attempt timestamptz,
  next_attempt timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 6),
  lease_token uuid,
  lease_expires_at timestamptz,
  safe_reason text CHECK (length(safe_reason) <= 100),
  UNIQUE(invoice_id, transaction_payment_id),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))
);
CREATE INDEX IF NOT EXISTS wa_pending_payment_due ON private.wa_pending_payment_verifications(next_attempt, id) WHERE state = 'unresolved';

CREATE TABLE IF NOT EXISTS private.wa_payment_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_id uuid NOT NULL UNIQUE REFERENCES private.wa_payment_outcomes(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE ,
  attempt_id uuid NOT NULL ,
  invoice_id text NOT NULL,
  transaction_payment_id text NOT NULL,
  amount numeric(12,3) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL CHECK (currency = 'KWD'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('signed_webhook','verified_callback','payment_sweep','admin_verification')),
  UNIQUE(invoice_id, transaction_payment_id)
);

CREATE TABLE IF NOT EXISTS public.evolution_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_identity text NOT NULL UNIQUE CHECK (length(instance_identity) BETWEEN 1 AND 200),
  account_identity text CHECK (length(account_identity) BETWEEN 1 AND 200),
  session_generation bigint NOT NULL DEFAULT 0 CHECK (session_generation >= 0),
  state text NOT NULL DEFAULT 'disconnected' CHECK (state IN ('disconnected','connecting','qr_ready','connected','failed')),
  connected_at timestamptz,
  disconnected_at timestamptz,
  safe_reason text CHECK (length(safe_reason) <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_phone text NOT NULL UNIQUE CHECK (normalized_phone ~ '^[1-9][0-9]{7,14}$'),
  display_name text NOT NULL DEFAULT '' CHECK (length(display_name) <= 200),
  business_name text NOT NULL DEFAULT '' CHECK (length(business_name) <= 200),
  email text NOT NULL DEFAULT '' CHECK (length(email) <= 320),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  user_id uuid ,
  linked_by uuid ,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.whatsapp_contact_orders (
  contact_id uuid NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
  order_id uuid NOT NULL ,
  confirmed_by uuid ,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(contact_id, order_id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_identity text NOT NULL REFERENCES public.evolution_connections(instance_identity) ON DELETE RESTRICT,
  normalized_phone text NOT NULL CHECK (normalized_phone ~ '^[1-9][0-9]{7,14}$'),
  display_name text NOT NULL DEFAULT '' CHECK (length(display_name) <= 200),
  remote_jid text CHECK (length(remote_jid) <= 250),
  avatar_object_path text CHECK (length(avatar_object_path) <= 500),
  last_message_at timestamptz,
  last_message_id text,
  last_read_at timestamptz,
  last_read_message_id text,
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  locally_deleted_through timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(instance_identity, normalized_phone)
);
CREATE INDEX IF NOT EXISTS whatsapp_chat_activity ON public.whatsapp_chats(last_message_at DESC NULLS LAST, id);

CREATE TABLE IF NOT EXISTS public.whatsapp_media_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_identity text NOT NULL,
  object_path text NOT NULL UNIQUE CHECK (length(object_path) BETWEEN 1 AND 500 AND object_path !~ '(^/|\.\.|://)'),
  mime_type text NOT NULL CHECK (length(mime_type) <= 150),
  file_name text NOT NULL CHECK (length(file_name) <= 200),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('pending','ready','failed','deleted')),
  created_by uuid ,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.whatsapp_chats(id) ON DELETE RESTRICT,
  instance_identity text NOT NULL,
  provider_message_id text NOT NULL CHECK (length(provider_message_id) BETWEEN 1 AND 250),
  session_generation bigint NOT NULL CHECK (session_generation >= 0),
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type text NOT NULL CHECK (message_type IN ('text','image','video','audio','document','unsupported')),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4096),
  media_object_id uuid REFERENCES public.whatsapp_media_objects(id) ON DELETE RESTRICT,
  sent_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  ack_state text NOT NULL DEFAULT 'accepted' CHECK (ack_state IN ('accepted','delivered','read','rejected')),
  delivered_at timestamptz,
  read_at timestamptz,
  rejected_at timestamptz,
  safe_reason text CHECK (length(safe_reason) <= 100),
  historical boolean NOT NULL DEFAULT false,
  locally_deleted_at timestamptz,
  remote_deleted_at timestamptz,
  UNIQUE(instance_identity, provider_message_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_message_page ON public.whatsapp_messages(chat_id, sent_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL ,
  outcome_id uuid NOT NULL REFERENCES private.wa_payment_outcomes(id) ON DELETE RESTRICT,
  evidence_id uuid NOT NULL REFERENCES private.wa_payment_evidence(id) ON DELETE RESTRICT,
  event_kind text NOT NULL DEFAULT 'order.paid' CHECK (event_kind = 'order.paid'),
  provider text NOT NULL CHECK (provider IN ('postora','evolution')),
  account_identity text,
  input_revision integer NOT NULL DEFAULT 1 CHECK (input_revision > 0),
  settings_revision bigint NOT NULL CHECK (settings_revision >= 0),
  expansion_state text NOT NULL DEFAULT 'enqueue_failed' CHECK (expansion_state IN ('expanded','enqueue_failed','skipped')),
  safe_reason text CHECK (length(safe_reason) <= 100),
  repair_attempt_count integer NOT NULL DEFAULT 0 CHECK (repair_attempt_count BETWEEN 0 AND 3),
  next_repair_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, event_kind),
  UNIQUE(outcome_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_event_repair_due ON public.whatsapp_notification_events(next_repair_at, id) WHERE expansion_state = 'enqueue_failed';
CREATE TABLE IF NOT EXISTS private.wa_event_input_revisions (
  event_id uuid NOT NULL REFERENCES public.whatsapp_notification_events(id) ON DELETE RESTRICT,
  input_revision integer NOT NULL CHECK (input_revision > 0),
  settings_revision bigint NOT NULL CHECK (settings_revision >= 0),
  input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot) = 'object'),
  reason text CHECK (length(reason) <= 200),
  created_by uuid ,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id, input_revision)
);
CREATE TABLE IF NOT EXISTS private.wa_send_requests (
  id uuid PRIMARY KEY,
  actor_id uuid ,
  job_class text NOT NULL CHECK (job_class IN ('legacy_event','manual','test')),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_class text NOT NULL CHECK (job_class IN ('automation','legacy_event','manual','test')),
  event_id uuid REFERENCES public.whatsapp_notification_events(id) ON DELETE RESTRICT,
  outcome_id uuid REFERENCES private.wa_payment_outcomes(id) ON DELETE RESTRICT,
  request_id uuid REFERENCES private.wa_send_requests(id) ON DELETE RESTRICT,
  order_id uuid ,
  normalized_recipient text NOT NULL CHECK (normalized_recipient ~ '^[1-9][0-9]{7,14}$'),
  audience text NOT NULL CHECK (audience IN ('buyer','admins','custom','manual','test')),
  audience_labels text[] NOT NULL DEFAULT '{}',
  rendered_body text NOT NULL CHECK (char_length(rendered_body) <= 4096),
  rendered_content_hash text NOT NULL CHECK (rendered_content_hash ~ '^[a-f0-9]{64}$'),
  media_object_id uuid REFERENCES public.whatsapp_media_objects(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('postora','evolution')),
  account_identity text NOT NULL CHECK (length(account_identity) BETWEEN 1 AND 200),
  settings_revision bigint NOT NULL CHECK (settings_revision >= 0),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sending','accepted','delivered','read','failed','needs_review','skipped','cancelled')),
  parked_reason text CHECK (parked_reason IN ('provider_changed','account_changed','automation_paused','rollback')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  due_at timestamptz NOT NULL DEFAULT now(),
  attempt_token uuid,
  lease_expires_at timestamptz,
  provider_message_id text CHECK (length(provider_message_id) <= 250),
  safe_reason text CHECK (length(safe_reason) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((job_class = 'automation' AND event_id IS NOT NULL AND outcome_id IS NOT NULL)
      OR (job_class = 'legacy_event' AND (outcome_id IS NOT NULL OR request_id IS NOT NULL))
      OR (job_class IN ('manual','test') AND request_id IS NOT NULL AND event_id IS NULL)),
  CHECK (char_length(rendered_body) > 0 OR media_object_id IS NOT NULL),
  CHECK ((attempt_token IS NULL) = (lease_expires_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_event_recipient_identity ON public.whatsapp_delivery_jobs(event_id, normalized_recipient, rendered_content_hash) WHERE job_class = 'automation';
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_legacy_recipient_identity ON public.whatsapp_delivery_jobs(outcome_id, audience, normalized_recipient, rendered_content_hash) WHERE job_class = 'legacy_event' AND outcome_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_request_recipient_identity ON public.whatsapp_delivery_jobs(request_id, normalized_recipient, rendered_content_hash) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_job_provider_identity ON public.whatsapp_delivery_jobs(provider, account_identity, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_delivery_due ON public.whatsapp_delivery_jobs(due_at, id) WHERE state = 'queued' AND parked_reason IS NULL;
CREATE INDEX IF NOT EXISTS whatsapp_delivery_order ON public.whatsapp_delivery_jobs(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.whatsapp_delivery_jobs(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  attempt_token uuid NOT NULL UNIQUE,
  outcome text CHECK (outcome IN ('accepted','not_accepted','uncertain')),
  retryable boolean,
  provider_message_id text CHECK (length(provider_message_id) <= 250),
  safe_reason text CHECK (length(safe_reason) <= 100),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  actor_id uuid ,
  reason text CHECK (length(reason) <= 200),
  UNIQUE(job_id, attempt_number)
);
CREATE TABLE IF NOT EXISTS public.whatsapp_account_dispatch (
  provider text NOT NULL CHECK (provider IN ('postora','evolution')),
  account_identity text NOT NULL,
  next_slot_at timestamptz NOT NULL DEFAULT now(),
  active_job_id uuid REFERENCES public.whatsapp_delivery_jobs(id) ON DELETE RESTRICT,
  lease_expires_at timestamptz,
  PRIMARY KEY(provider, account_identity)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_pending_acks (
  instance_identity text NOT NULL,
  provider_message_id text NOT NULL CHECK (length(provider_message_id) BETWEEN 1 AND 250),
  ack_state text NOT NULL CHECK (ack_state IN ('delivered','read','rejected')),
  occurred_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  safe_reason text CHECK (length(safe_reason) <= 100),
  PRIMARY KEY(instance_identity, provider_message_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_pending_ack_expiry ON public.whatsapp_pending_acks(expires_at);
CREATE TABLE IF NOT EXISTS public.whatsapp_tombstones (
  instance_identity text NOT NULL,
  normalized_phone text NOT NULL CHECK (normalized_phone ~ '^[1-9][0-9]{7,14}$'),
  provider_message_id text NOT NULL DEFAULT '',
  cutoff_at timestamptz NOT NULL,
  created_by uuid ,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(instance_identity, normalized_phone, provider_message_id)
);
CREATE TABLE IF NOT EXISTS public.whatsapp_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_identity text NOT NULL,
  session_generation bigint NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','partial','complete','failed','cancelled')),
  cursor_json jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cursor_json) = 'object'),
  processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  unresolved_count integer NOT NULL DEFAULT 0 CHECK (unresolved_count >= 0),
  safe_reason text CHECK (length(safe_reason) <= 100),
  created_by uuid ,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_one_active_sync ON public.whatsapp_sync_runs(instance_identity) WHERE state IN ('pending','running');

-- Foreign keys to existing tables create internal triggers on their parents.
-- Record them now; the approved app-phase retention RPC installs them before new writers deploy.
CREATE TABLE IF NOT EXISTS private.wa_retention_links (
  child_schema name NOT NULL,
  child_table name NOT NULL,
  child_column name NOT NULL,
  parent_schema name NOT NULL,
  parent_table name NOT NULL,
  delete_action text NOT NULL CHECK (delete_action IN ('SET NULL','RESTRICT')),
  PRIMARY KEY(child_schema, child_table, child_column)
);
INSERT INTO private.wa_retention_links
  (child_schema, child_table, child_column, parent_schema, parent_table, delete_action)
VALUES
  ('public', 'whatsapp_settings', 'updated_by', 'auth', 'users', 'SET NULL'),
  ('private', 'wa_payment_outcomes', 'order_id', 'public', 'orders', 'RESTRICT'),
  ('private', 'wa_payment_outcomes', 'attempt_id', 'public', 'payment_attempts', 'RESTRICT'),
  ('private', 'wa_pending_payment_verifications', 'order_id', 'public', 'orders', 'RESTRICT'),
  ('private', 'wa_pending_payment_verifications', 'attempt_id', 'public', 'payment_attempts', 'RESTRICT'),
  ('private', 'wa_payment_evidence', 'order_id', 'public', 'orders', 'RESTRICT'),
  ('private', 'wa_payment_evidence', 'attempt_id', 'public', 'payment_attempts', 'RESTRICT'),
  ('public', 'whatsapp_contacts', 'user_id', 'auth', 'users', 'SET NULL'),
  ('public', 'whatsapp_contacts', 'linked_by', 'auth', 'users', 'SET NULL'),
  ('public', 'whatsapp_contact_orders', 'order_id', 'public', 'orders', 'RESTRICT'),
  ('public', 'whatsapp_contact_orders', 'confirmed_by', 'auth', 'users', 'SET NULL'),
  ('public', 'whatsapp_media_objects', 'created_by', 'auth', 'users', 'SET NULL'),
  ('public', 'whatsapp_notification_events', 'order_id', 'public', 'orders', 'RESTRICT'),
  ('private', 'wa_event_input_revisions', 'created_by', 'auth', 'users', 'SET NULL'),
  ('private', 'wa_send_requests', 'actor_id', 'auth', 'users', 'SET NULL'),
  ('public', 'whatsapp_delivery_jobs', 'order_id', 'public', 'orders', 'RESTRICT'),
  ('public', 'whatsapp_delivery_attempts', 'actor_id', 'auth', 'users', 'SET NULL'),
  ('public', 'whatsapp_tombstones', 'created_by', 'auth', 'users', 'SET NULL'),
  ('public', 'whatsapp_sync_runs', 'created_by', 'auth', 'users', 'SET NULL')
ON CONFLICT DO NOTHING;

-- Scope every privilege change to this migration's explicit new-object inventory.
-- Existing public/auth/storage defaults and policies are intentionally untouched.
DO $wa_privileges$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'whatsapp_settings','evolution_connections','whatsapp_contacts','whatsapp_contact_orders',
    'whatsapp_chats','whatsapp_media_objects','whatsapp_messages','whatsapp_notification_events',
    'whatsapp_delivery_jobs','whatsapp_delivery_attempts','whatsapp_account_dispatch',
    'whatsapp_pending_acks','whatsapp_tombstones','whatsapp_sync_runs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated, service_role', table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name AND policyname = 'WhatsApp admin read') THEN
      EXECUTE format('CREATE POLICY "WhatsApp admin read" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role))', table_name);
    END IF;
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY[
    'wa_release_state','wa_credentials','wa_payment_outcomes','wa_pending_payment_verifications',
    'wa_payment_evidence','wa_event_input_revisions','wa_send_requests','wa_retention_links',
    'wa_provider_readiness'
  ] LOOP
    EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE private.%I FROM PUBLIC, anon, authenticated, service_role', table_name);
  END LOOP;
END
$wa_privileges$;

INSERT INTO storage.buckets(id, name, public, file_size_limit)
VALUES ('whatsapp-media','whatsapp-media',false,10485760)
ON CONFLICT(id) DO NOTHING;
DO $wa_bucket$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'whatsapp-media' AND public) THEN
    RAISE EXCEPTION 'whatsapp-media bucket must remain private';
  END IF;
END
$wa_bucket$;
COMMIT;
