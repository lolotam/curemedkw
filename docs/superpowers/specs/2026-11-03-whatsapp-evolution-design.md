> Historical design record (2026-11-03); current behavior is defined by the code on main and docs/integrations/*. All implementation instructions, status assertions, proof receipts and file/symbol references below describe the historical proposal/checkpoint only. They are not current contracts, execution instructions or evidence of deployed state.

# CureMed WhatsApp integration and paid-order automation

Date: 2026-11-03. Status: user approved the written specification on 2026-11-03; implementation plan/debate in progress; application implementation has not started.

## 1. Outcome and approved decisions

Port the complete applicable WhatsApp experience from Danat Al Mustaqbal into CureMed, using CureMed's existing React UI and Supabase Deno backend. Repair and connect the user-deployed dedicated Evolution gateway on the CureMed server, provide selectable Evolution/Postora delivery, and reliable paid-order automation for buyers and multiple admin/custom numbers.

The user approved these decisions in this conversation:

1. Notifications trigger after successful payment only, not on unpaid order creation.
2. The first release includes the full adapted WhatsApp section and paid-order automation together.
3. Admins can select Evolution or Postora in settings; one provider is active for outbound sends.
4. Buyer and admin/custom-number audiences have separate switches and templates.
5. Use an isolated `feat/whatsapp-evolution` branch/worktree based on `main`, excluding unfinished Shipa changes.
6. The terminal state is deployed and verified. Production migrations and merge require separate approval after the release is concrete and reviewable.
7. Codex authors specification, plan and SQL; Claude Opus 5.5/high debates four rounds; MiniMax M3.1-Flash implements code and tests; Codex Astra/medium reviews before PR/release gates.
8. Research uses official sources. No silent model substitution is authorized.

This draft is held outside application checkouts while reviewed. After debate, the reviewed specification and plan enter the isolated feature branch as separate documentation commits. No Shipa source or production state changes are part of writing this specification.

## 2. Evidence and current behavior

Target baseline: `main` at `878dde5748548094aab457b54402809d81770668`; the primary checkout currently retains Shipa work at `bb494a4dfad8b2de73475e175033aae59f28f061`. Refresh the remote baseline before provisioning the feature checkout; report any intervening changes.

Donor inspected: `F:/Dev/Projects/Danat-Mostakbal`, commit `f679f129d110d59dba3183e3c6f161c9a5e63ec6`, clean after investigation. Inspect the main source tree, not nested agent worktrees. This identifies the parity reference; it does not prove every donor implementation is correct.

CureMed uses React 18, Vite 5, React Router 6, Tailwind 3 and Supabase Deno Edge Functions. Danat uses React 19, TanStack Start/Nitro and Tailwind 4. TypeScript and Supabase/PostgreSQL are shared, but routes, server calls, permissions and schema require adaptation.

Verified target entry points:

- `src/pages/admin/AdminWhatsApp.tsx`: Postora settings, admin numbers, event switches, Arabic/English templates, diagnostics, test sends and recent logs.
- `src/pages/admin/AdminOrderEmail.tsx`: existing order-email configuration and templates; its header says Automation, but this is not a general workflow builder.
- `src/pages/admin/AdminNotificationTemplates.tsx`: reusable stored templates, distinct from the payment dispatcher.
- `src/pages/admin/AdminOrders.tsx`: existing customer shipment notification action.
- `supabase/functions/send-whatsapp/index.ts`: authenticated admin/service sender, outbound Postora text and diagnostics; currently at most ten recipients per request.
- `supabase/functions/_shared/apply-payment.ts`: successful-payment email/WhatsApp dispatch. It claims `order_notified_at` before delivery and ignores settled task results. This suppresses duplicate dispatch attempts but does not guarantee successful delivery or retries.
- `supabase/functions/_shared/caller-auth.ts`: existing admin/service caller checks.
- `supabase/functions/create-myfatoorah-payment/index.ts`, `verify-myfatoorah-payment/index.ts`, `myfatoorah-webhook/index.ts`: payment-attempt persistence and provider-result entry points.
- `SELF_HOSTED.md`, `scripts/supabase-post-deploy.sh`: self-hosted deployment; the production Edge router is hand-patched and must not be replaced by the repository's `supabase/functions/main/`.

The initial read-only inspection on 2026-11-03 found no Evolution deployment. Waleed subsequently deployed `curemedkw-evultionapi-wrtdxe` and requested connection to that existing gateway. Follow-up inspection verified source commit `f1100ad8741fb8af5015fc86b11e78e95d50c353`, package Evolution 2.3.7/Baileys 7.0.0-rc14 and local Docker image identity `sha256:be2cbdefd40b2c10e780b05b812fe7a2291525ada4e2af70af64bfabb7c766a5`. Docker also reported a local RepoDigest with that value; registry availability is not established. The service is crash-looping with `Error: Database provider  invalid.`; its effective runtime lacks database/auth configuration, persistent mounts and a network shared with Edge. Repair/reuse this deployment; do not provision a duplicate gateway or silently replace its custom build. Infrastructure repair is approved; private credentials have not been received.

Existing public tables include `whatsapp_send_logs` and `order_email_logs`; the proposed inbox/session tables do not exist. Saved WhatsApp settings are enabled with zero admin numbers. Current public site-settings policy excludes the secret integration row; the two stored order phone numbers use Kuwait international format. Shopping is paused (`shoppingEnabled=false`). No actual phone numbers/credential values were returned and no live Postora delivery was tested.

## 3. User experience and donor parity inventory

The `/admin/whatsapp` section provides Inbox, Contacts, Connection/Settings, Automation and Delivery Logs. Its screens follow CureMed navigation and components; the interaction parity comes from Danat. English/Arabic content, RTL-safe message rendering and mobile list/thread navigation are required. CureMed's wider admin layout is not redesigned.

| Donor capability | CureMed requirement | Source reference in donor |
| --- | --- | --- |
| QR pairing and connection lifecycle | Dedicated `curemed` instance; connect, QR refresh, state, connected number and explicit disconnect | `src/fns/evolutionSession.ts`, `src/hooks/useEvolutionConnection.ts`, `EvolutionConnectionCard.tsx`, `EvolutionQrDialog.tsx` |
| Shared inbox | Searchable direct conversations, last message, shared unread count, responsive list/thread, stable thread pagination and deep links | `src/components/admin/whatsapp/WhatsAppInboxTab.tsx`, `WhatsAppChatList.tsx`, `WhatsAppThread.tsx`, `src/hooks/useWhatsAppInbox.ts` |
| Conversation identity | Contact/name/avatar, add or edit contact from the thread, links to associated CureMed user and orders | `WhatsAppThreadHeader.tsx`, `WhatsAppContactDialog.tsx`, `WhatsAppChatLink.tsx` |
| Manual text messages | Compose to a known or new international number, visible pending/sent/failure state | `WhatsAppComposer.tsx`, `src/fns/whatsappChat.ts` |
| Media exchange | Send and receive image, video, audio, PDF and document files; captions, preview/lightbox, playback and download | `src/fns/whatsappMedia.ts`, `messageMedia/*` |
| Forwarding | Forward text/media to a selected direct conversation, preserving cached file content | `WhatsAppForwardDialog.tsx`, `src/fns/whatsappMedia.ts` |
| Deletion | Explicit local message delete, outbound delete-for-everyone, local chat delete and separate contact delete | `MessageBubble.tsx`, `src/fns/whatsappChat.ts` |
| Contact directory | Auto-capture incoming numbers; create/edit/delete, name, business name, email, notes, search, sort and full CSV export | `WhatsAppContacts.tsx`, `src/hooks/useWhatsAppContactsData.ts`, `src/fns/whatsappChat.ts` |
| Avatars | Display and refresh available contact/chat avatars with safe fallbacks | `src/fns/evolutionAvatars.ts`, `src/lib/whatsappAvatar.ts` |
| History import | Bounded resumable contact/chat/message import, progress and incomplete-result reporting | `src/fns/evolutionHistorySync.ts` |
| Delivery acknowledgments | Provider acceptance, delivered, read and rejected outcomes; handle acknowledgments arriving before the local send response | `src/fns/evolutionWebhook.ts`, `src/lib/evolution/messageAck.ts` |
| Unified delivery policy | Same provider/session/pacing/audit rules for manual and automatic sends | `src/fns/evolutionDelivery.ts`, `src/fns/dispatchWhatsAppChannel.ts` |
| Templates and workflows | Editable templates, audience switches, selectable provider, delivery log, retry/review controls | `src/fns/dispatchWhatsAppChannel.ts` and existing CureMed WhatsApp/email screens |
| Database/storage protection | Private media, restricted session columns, server-controlled ingestion and writes | `db/migrations/179_evolution_connections.sql`, `180_whatsapp_inbox.sql`, `182_whatsapp_media_bucket.sql` |

Every row requires an explicit implementation task and acceptance proof. A feature is not omitted merely because its source imports an incompatible router or real-estate entity.

### Adaptation boundaries

- Replace tenant links with optional CureMed user links. Replace many-to-many contract links with explicit order links. Do not create real-estate tables, copy tenant data or automatically link a person solely because a phone number matches. Offer suggestions for an admin to confirm; one phone can be shared by several customers.
- Preserve business name and other contact details. Preserve order/customer snapshots; editing a contact does not rewrite historical orders.
- One CureMed WhatsApp account and direct conversations are in scope, matching the inspected donor. Groups, newsletters, multiple accounts, campaigns, chatbot/AI agents and a generic drag-and-drop automation builder are outside this release.
- Audio file sending/playback is in scope. Microphone recording, message reactions, editing and other features not established by the donor inventory are not implied.
- Donor Cloud API/Twilio provider integrations are not added: the approved provider selection is Evolution/Postora.
- Existing shipment WhatsApp support stays operational through the selected provider. Abandoned-cart and review-request scheduler placeholders must not be presented as working automations; implementing those schedules is outside this paid-order release.

## 4. Provider selection and capabilities

The settings screen exposes one active outbound provider, configuration readiness, test connection and test-send controls. Save and activate are separate: selecting an unconfigured provider reports validation errors rather than silently turning off working delivery. Existing Postora configuration stays available when switching away.

Evolution supports the complete paired inbox/media experience. The inspected Postora connector supports outbound text and diagnostics; no inbox/history/media contract has been established for it. When Postora is active:

- Paid-order text automation and manual text sends use Postora.
- Stored Evolution conversations, contacts and cached media remain readable by admins.
- Evolution pairing, inbound ingestion and explicit read-only sync remain available; receiving is independent of outbound selection.
- Media sends, media forwarding and remote delete-for-everyone that require Evolution are disabled with a capability explanation. Do not send secretly through Evolution while Postora is selected. Local deletion and text forwarding remain available.
- Do not claim delivery/read acknowledgments for Postora unless its approved contract supplies them. Accepted text is shown as provider accepted, not delivered.

Automation jobs snapshot provider identity, instance/account identity, recipient, language, rendered content and settings snapshot revision when created. Credential values never enter jobs. A provider switch affects newly enqueued messages; unsent jobs pinned to the previous provider are parked for explicit staff review, not rerouted automatically.

Switching refuses while a previous-provider request is actively sending. A stale lease must first become an uncertain/review outcome. Accepted, delivered, read and uncertain jobs cannot be resubmitted through the other provider by an ordinary Retry button. Any explicit replacement requires an audited reason and acknowledgement of duplicate risk. No automatic cross-provider failover or dual sending.

## 5. Paid-order automation

### Event and eligibility

The event is a newly verified successful MyFatoorah payment for an order. An unpaid checkout, browser-supplied status, admin cosmetic status update or unauthenticated webhook cannot create a paid-order notification event. Bind provider invoice identity and external order identifier to a server-created `payment_attempts` row; verify the actual transaction through the provider contract and record its payment ID as evidence, without assuming it equals an ID returned at invoice creation. Signed webhook fields are used only within their actual signature coverage; unsigned amounts are not treated as signed evidence.

This release does not implement Shipa, change checkout pricing or remove the ministry ordering hold. The narrow payment-path work needed here is reliable trusted enqueue and recovery; any wider payment integrity change must be recorded and reviewed as added scope before implementation.

Preserve current payment-recording semantics: a valid signed provider success bound to the server-created invoice/order attempt records protected paid status without a separate GET. Only the first SUCCESS-MAPPED outcome takes notification ownership and immutable input snapshots; failed/pending attempts never take it. Under cutover 0, that transaction immediately owns idempotent legacy WhatsApp and email behavior even during GET outage. Legacy paid job identity is outcome/audience/normalized-recipient/rendered-content, not a per-request UUID. Under cutover 1, authenticated GET amount/currency/transaction proof completes a separate transaction for strict evidence, the unique durable event and recipient jobs. Unsigned amounts never become evidence. Recipient expansion failure leaves enqueue_failed without undoing paid/evidence/event. A payment-owned leased sweep automatically repairs pending GET verification with bounded backoff, review on exhaustion and a 24-hour notification cutoff; no automatic thank-you days late. Webhooks attempt at most one GET within 10 seconds before deferring. Repair uses recorded outcomes/events, never a historical-order scan, and never resends existing jobs or successful email.

The implementation plan must name the transaction/RPC boundary and exactly which caller supplies trusted evidence. A browser can never invoke that boundary, including under Supabase default function grants. Do not use a trigger on an arbitrary `payment_status='paid'` write as the sole eligibility check.

### Audience controls

- Master WhatsApp automation switch; independent buyer, admin and custom-recipient switches.
- Admin and custom-number lists support multiple international numbers; normalise and validate on the server, eliminate duplicates within each audience, cap total recipients per event at 50, and process in bounded batches. This is an application limit, not a provider capacity claim.
- Use the order's buyer phone snapshot; no phone means a visible skipped buyer outcome while other recipients continue.
- Admin/custom messages contain only the approved template fields. A buyer/admin number overlap is shown in preview: different audience templates may produce two distinct messages intentionally; identical rendered messages to the same normalized number within one event are coalesced with all audience labels recorded.
- Each audience has its own Arabic/English template and chosen language. Defaults follow existing CureMed copy and KWD formatting with three decimal places.
- Supported paid-order fields: order number, customer name/phone, total/currency, item summary and an approved order/invoice link. Do not include card details, payment session tokens, service keys or full provider payloads.
- Preview uses sample data and lists unresolved/unsupported placeholders before save. Test sends are explicit admin actions to a selected test number and are logged separately from real order events.
- Changed templates, recipients or provider settings affect future events, not existing job snapshots. No automatic backfill or mass historical-order sends on deployment/enablement.

### Email compatibility

Email remains an independently configured channel with its existing templates, audience settings and delivery function. Adding WhatsApp must not resend successful historical emails, disable email when WhatsApp is down, or move SMTP secrets into new public settings.

Remove the WhatsApp calls from the legacy combined dispatch when the new path is enabled, so there is one WhatsApp owner. Preserve the existing email claim/send path during this feature unless a specific compatibility fix is required. `order_notified_at` is no longer the WhatsApp delivery marker. Do not claim this release solves every legacy email retry limitation.

Expose the paid-order email and WhatsApp controls together in an Automation view; existing `/admin/order-email` remains a valid route to email configuration. Stored `user_notification_templates` must not silently override paid-order templates without an explicit binding.

## 6. Delivery state, concurrency and recovery

Proposed WhatsApp job states: `queued`, `sending`, `accepted`, `delivered`, `read`, `failed`, `needs_review`, `skipped`, `cancelled`. State definitions and transitions are server-owned. A job records attempt history, provider message ID, safe reason code, timestamps and actor/retry reason where applicable.

- A database lease allows one worker to own a job. Claims use transactional row locking; the scheduler and admin Retry use the same worker path. No process-local lock is accepted as cross-request protection.
- One instance/account-wide send budget covers manual sends and automation. Process at most three jobs serially per worker invocation; use a 10-second provider timeout, a 45-second lease and a 50-second request budget. These are proposed application budgets to verify on the actual runtime, not external performance guarantees.
- Authenticated one-minute scheduler drains queued jobs; successful enqueue may nudge the same worker. A missed nudge cannot lose a persisted event. Enablement requires a recent real scheduler heartbeat, not a browser-generated heartbeat.
- Retry only outcomes proven not accepted, honoring provider rate-limit instructions within the bounded schedule. Proposed maximum: three send attempts total, with delays of one and five minutes after the first two safe failures. Session disconnection, permanent validation errors and exhausted attempts go to review.
- Network timeout, connection loss after request dispatch, worker crash after provider acceptance, missing provider ID or a 5xx with unknown side effects becomes `needs_review`; no blind resend. Reconcile by known provider message identity where the pinned API supports it. No exactly-once external-delivery promise.
- An expired `sending` lease becomes uncertain/review, never automatically queued. A provider acceptance followed by a local persistence error must not be shown as an ordinary safe retry.
- Accepted is distinct from delivered. Acknowledgments can advance accepted to delivered/read or establish rejection; late acceptance cannot erase a stronger read/rejection fact. Duplicate and out-of-order events must be harmless.
- An authorized staff action can retry a safe failed job after configuration/session repair. Uncertain resends require a separate duplicate-risk confirmation and an audit trail; successful jobs never have an ordinary Retry action.
- Check cancellation/refund state and global/provider/audience pause before claiming an unsent job. A skipped/cancelled job has a visible reason. Do not rewrite or recall a message already accepted by the provider.
- Scheduler health, queue age, disconnected session and review-required counts are visible to admins. Failures do not break the payment callback or prevent unrelated recipients from being processed after the durable event is recorded.

## 7. Inbox, contacts, history and media contracts

Ingestion deduplicates by instance identity plus provider message ID, including outgoing webhook echoes. An inbound message increments unread once; historical import does not increment unread. Mark-read uses the newest message actually displayed so a concurrently arriving message remains unread. The unread count is shared among admins, matching the donor.

Use stable compound cursors for messages and ordered paginated contacts/chats. Search is bounded and escaped. Full CSV export walks all accessible pages and neutralises spreadsheet formulas. Client sorting must clearly apply to the displayed result set; do not label a truncated page as the entire directory.

Store only allow-listed diagnostic webhook metadata. Authenticate webhook secret and expected instance before ingestion. QR/connection events require a current session generation and bounded validity; stale events cannot replace a newer QR or reopen a disconnected session. Pending delivery acknowledgments are retained until their send row is available.

Pairing refresh rotates webhook secrets only after the gateway accepts the new configuration. A previous secret is accepted for a maximum five-minute overlap, then expires. Reconnecting must not delete an existing live instance as rollback. Disconnect requires an explicit UI confirmation and invalidates the relevant session generation without deleting history.

History sync is explicit, admin-only, bounded and resumable with a persisted cursor. It reports imported, skipped, unresolved LID and incomplete counts. Resolve LID identities from reliable provider evidence; never guess a phone from opaque identifiers. Groups, newsletters and unresolved identities are skipped visibly. Historical recovery depends on what the gateway/phone retains; no unlimited recovery guarantee.

Local message/chat deletion persists a tombstone/cutoff so webhook replay and later history sync cannot resurrect deleted history. Local chat deletion keeps its contact. Remote delete-for-everyone applies only to outbound messages; provider refusal is reported distinctly from local deletion. An explicit local-only action may still be offered after remote refusal.

Media has a 10 MiB decoded limit per file, checked both before upload and on the server. Validate MIME/size, sanitise filenames and storage paths, bound base64/request sizes and reject executable/HTML content. Preserve supported PDF/document/image/video/audio behavior and captions. Use private `whatsapp-media` storage; authorize downloads server-side, with private caching and cleanup of temporary browser object URLs. Failed cache writes or oversized files are visible, not silent attachment loss.

Downloads and avatar refreshes must not forward credentials to arbitrary URLs. Use the configured gateway media API or verified allow-listed media origins, bounded size/time and redirect rejection. Content-Disposition prevents document execution; render message text as text, never untrusted HTML. Avatars use validated HTTPS origins or server-cached files.

## 8. Proposed data and backend boundaries

The names below are proposed additions, not claims that these objects already exist:

- Integration configuration with active provider, readiness, account/instance identity and revision; public-safe settings separated from encrypted service-only credentials.
- `evolution_connections`: safe connection metadata plus server-only QR/secret/session-generation fields.
- `whatsapp_chats`, `whatsapp_messages`, `whatsapp_contacts`, `whatsapp_contact_orders`: direct-conversation data and explicit CureMed links, with optional user association.
- `whatsapp_notification_events`, `whatsapp_delivery_jobs`, `whatsapp_delivery_attempts`: trusted event ownership, recipient snapshots, leases and audit history.
- A bounded pending-ack store and deletion/sync metadata; use focused tables or explicit columns rather than full raw-payload storage.
- Existing `whatsapp_send_logs` remains readable for historical logs. New logs identify provider and outcome without leaking credentials or pretending old Postora records contain delivery receipts.

Backend responsibilities are separated into settings/credentials, connection management, authenticated webhook ingestion, chats/contacts, media, automation enqueue and dispatch/recovery. Implement these as Deno Edge Functions/shared modules using CureMed's runtime client and existing auth conventions. The implementation plan specifies exact function names, typed action contracts and SQL objects before MiniMax starts.

Admins may read inbox/contact/delivery information. Browser writes go through validated admin endpoints; only service-role SQL can write ingest/lease/secret data. Use CureMed's actual admin-role model rather than importing Danat permission tables. Guest/buyer accounts cannot read company inboxes or other users' links.

Revoke Supabase's permissive default table/function grants before granting the intended privileges. Service-only RPCs must not be callable by `anon`, `authenticated` or `PUBLIC`. Check role behavior in real PostgreSQL, including default-function-grant adversarial fixtures.

Store provider keys and webhook secrets encrypted server-side with a deployment-managed key, random authenticated-encryption nonces and account/provider/config-version binding. UI writes secrets through a dedicated endpoint; reads return only presence/masked metadata. Migrate the legacy Postora key out of browser-readable settings without logging it; preserve working configuration and document key rotation/backup.

Sender and worker endpoints validate methods, discriminated payloads, lengths and audience limits. Gateway destinations are deployment-managed, not arbitrary browser-controlled hosts. The worker requires a dedicated scheduler credential or an explicitly authorized server caller; the public anon key is not sender authorization. QR responses are admin-only and non-cacheable.

## 9. Dedicated gateway and release controls

Repair the existing Evolution deployment on the CureMed host by attaching dedicated PostgreSQL/database user, Redis service, persistent instance/database volumes, resource limits, health checks and backup/restore procedure. The user approved this infrastructure repair separately on 2026-11-03; app migrations/merge, pairing and messages remain excluded. Do not reuse CureMed application tables as Evolution's Prisma schema or copy Danat credentials/session data. The API uses the required internal network or restricted authenticated ingress; no public database/Redis ports or unprotected management UI.

Reuse the user-deployed gateway and pin its inspected image/source identity rather than `latest`. It identifies as Evolution 2.3.7 with Baileys 7.0.0-rc14; do not equate that customized build with upstream stable. Upstream release classification remains reference evidence. Verify endpoints, webhook headers, media and cold-contact delivery against the actual deployed build. If it fails, report the failure and obtain approval before changing version/fork.

The historical Danat delivery incident report records accepted-but-rejected messages and a cold-contact acknowledgment failure. Treat it as a regression scenario, not proof of the current CureMed gateway behavior. Activation requires controlled tests that distinguish acceptance, actual delivery, rejection and disconnect.

Prepare a reviewable rollout packet before production approval: final commit/PR, reviewed migration bytes/checksums, disposable-DB proofs, backup/restore commands, compose/image digest, safe runtime configuration inventory, scheduler/routing changes and rollback steps. The production migration and merge request must explicitly disclose auto-deploy/auto-apply behavior.

Release order: rehearse and back up; approved additive schema prerequisites; approved gateway/runtime prerequisites with automation disabled; approved merge/deploy; verify frontend, functions and schema match the reviewed commit; pair the intended CureMed account; run explicitly approved controlled sends; enable configured audiences only after health checks. Keep existing Postora active until Evolution pairing and send tests succeed. Do not invent recipient numbers, credentials, DNS names or send a real customer notification as a diagnostic.

Operational rollback pauses durable dispatch, exports outstanding jobs for operator review and preserves history/ownership. Deployment begins cutover 0 with legacy settings authoritative. Approved credential migration atomically copies validated nonsecret settings/ciphertext, arms the scoped legacy-write guard and clears api_key to empty/absent (never masked), after proving retained server Postora env fallback. New canonical saves then mirror current enabled/events/language/templates/admin_numbers into the baseline row; custom recipients are never merged into admin_numbers. Provider activation precedes atomic durable enable/cutover. Before code rollback, reconcile the latest reviewed safe baseline projection and restore validated Postora/cutover 0 only for future successful outcomes; unsafe projection keeps sends disabled. Retain the guard/read-only baseline form so stale tabs cannot reintroduce removed recipients/plaintext/enablement. Retain/reprovision server fallback privately and test baseline handlers against migrated schema. Park/export existing durable jobs, never turn them into legacy sends or resend accepted/uncertain jobs. Any later return to writable baseline settings is separately reviewed. Do not drop schema/media or replace the production router; email remains usable.

## 10. Acceptance and verification

1. Every donor parity row maps to a task and an observable test or controlled runtime proof; no real-estate routes/types remain in the shipped WhatsApp flow.
2. Admin-only settings, connect/QR/disconnect, inbox/contact CRUD, media, forwarding, deletion, CSV, history and avatars work with direct conversations on desktop and mobile layouts.
3. Anonymous, buyer and non-admin users cannot retrieve messages, QR, credentials, private files or invoke management/send/worker/SQL operations.
4. Enqueue occurs for a newly verified paid order, never an unpaid/failed order or a browser status patch. Callback/webhook races produce one event and one intended recipient job per deduplication key.
5. Payment-result replay repairs an unrecorded enqueue without duplicating jobs or resending successful email. A migration or enqueue error is visible and recoverable.
6. Buyer/admin/custom switches, recipient validation, 50-recipient cap, overlap preview/coalescing, independent language/templates and missing-phone outcomes behave as specified.
7. Evolution/Postora switching preserves settings, validates readiness, refuses active-send conflicts and never silently reroutes or doubles queued/uncertain sends.
8. Postora text/diagnostics work through the existing approved endpoint contract. Evolution-only features show their capability requirements when Postora is active.
9. Duplicate webhook replay, send echo, early/late acknowledgment, stale QR, secret rotation and out-of-order delivery updates cannot duplicate messages/unread counts or erase stronger outcomes.
10. Concurrent senders obey one durable account budget. Timeouts/crashes/ambiguous responses become review-required without a blind retry; safe failures honor bounded retries.
11. Recipient failure/session disconnect does not suppress other eligible recipients or email; lost enqueue nudges recover through the scheduler. Heartbeat expiry is visible and gates automation enablement.
12. Existing paid orders are not backfilled automatically. Existing shipment-message behavior is preserved. The ministry ordering hold and Shipa code/state stay unchanged.
13. Mark-read cannot swallow a newer inbound message. Local deletion survives replay/history sync. Remote-delete refusal is not falsely reported as successful remote deletion.
14. History pagination resumes rather than repeatedly processing only the first chats; incomplete/unresolved counts are truthful and historical import does not create unread bursts.
15. Supported media previews/downloads and forwards preserve content. Oversize, bad MIME, path traversal, SSRF redirects, private-object access and CSV formula injection are rejected or neutralised.
16. Real PostgreSQL tests prove transactional enqueue, recipient uniqueness, claim/lease concurrency, RLS, foreign-key deletion behavior and service-only privileges under Supabase-like default grants.
17. Changed-area Vitest/Deno tests, TypeScript and targeted lint pass. Verify the actual Deno Edge runtime separately from frontend TypeScript. Run one full local suite immediately before PR, with one heavy job at a time; do not add GitHub Actions without the spending decision.
18. Apply clean-code-guard, test-guard and docs-guard; manager re-runs checks rather than trusting delegate reports. Astra review findings are resolved or explicitly deferred with reasons before PR/release.
19. Four Opus plan-debate rounds have recorded findings and accept/partial/reject verdicts. No claim of reviewer approval when only manager corrections have been verified.
20. Deployment completion requires approved migration application confirmed live, reviewed gateway/runtime configuration, deployed commit identities and health checks. Waleed approved full isolated sandbox/staging payment-to-WhatsApp proof plus separately authorized production transport/configuration tests while preserving the ministry shopping hold. Staging may use a fake WhatsApp provider; actual production transport needs approved test numbers/sends. A genuine provider-originated sandbox webhook requires an approved reachable test endpoint; signed fixtures are distinguished from that proof. Live production payment-trigger proof is explicitly deferred until the hold is lifted, and this limitation must appear in the final report. A merge/healthy container alone does not satisfy verification.

## 11. Source references and research limits

Local evidence paths above are relative to their named repository. The donor migration numbering is reference material, not migration names to copy into CureMed.

- [Evolution official repository](https://github.com/evolution-foundation/evolution-api) and [official documentation index](https://docs.evolutionfoundation.com.br/llms.txt): current upstream entry points. Documentation and default-branch code are not evidence that every feature exists in a pinned older release.
- [Official releases](https://github.com/evolution-foundation/evolution-api/releases): stable/prerelease classification inspected on 2026-11-03.
- [Version 2.3.7 Compose source](https://raw.githubusercontent.com/evolution-foundation/evolution-api/2.3.7/docker-compose.yaml) and [package metadata](https://raw.githubusercontent.com/evolution-foundation/evolution-api/2.3.7/package.json): starting deployment/runtime evidence; CureMed will pin images and restrict ingress rather than copying mutable example tags.
- [Version 2.3.7 instance routes](https://raw.githubusercontent.com/evolution-foundation/evolution-api/2.3.7/src/api/routes/instance.router.ts), [chat routes](https://raw.githubusercontent.com/evolution-foundation/evolution-api/2.3.7/src/api/routes/chat.router.ts) and [message routes](https://raw.githubusercontent.com/evolution-foundation/evolution-api/2.3.7/src/api/routes/sendMessage.router.ts): observed route families supporting the port. Exact request/response fixtures belong in the plan's versioned contract work.
- Donor `docs/handover/2026-09-02-whatsapp-delivery-handover.md`: historical delivery regression context; not a current host/version certification.

Application implementation, pairing and sends have not started. The existing gateway is failing startup; approved preparation backed up its exact image, retained an immutable local tag and disabled autoDeploy. Runtime repair still awaits private credentials. Four plan-debate rounds completed. Manager accepted/amended the final findings; SQL freeze still requires implementation/fixture proof, not a claim of subsequent Opus approval. Staged proof preserves the active shopping hold and explicitly defers live payment-trigger proof.

Planning clarification after final debate: settings_revision governs optimistic locking/audit; credential_revision alone participates in secret AAD with provider/account/key version; actual provider/account identity governs queue parking. Template edits and same-account credential rotation do not park jobs. Schema phase permits only additive new objects and their per-object grants, with no ALTER DEFAULT PRIVILEGES, existing-schema REVOKE or active existing-table guard. Production release inventories every migration/deploy/repo-sync trigger before pausing and selecting one runner; the two known scripts are not assumed exhaustive.
