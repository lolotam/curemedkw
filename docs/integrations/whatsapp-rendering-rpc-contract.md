# WhatsApp SQL rendering and preview

Migration `20261103001900_whatsapp_rendering.sql` establishes one SQL renderer for preview and future immutable message expansion. It creates no jobs and dispatches nothing. The migration only changes feature-owned objects; existing application tables, writers and default privileges remain unchanged.

`wa_preview_template(p_validated_draft jsonb, p_sample_or_order_identity jsonb, p_actor_id uuid)` is service-role-only and independently checks a real administrator role. The future HTTP handler must derive the actor from verified `auth.getUser`; the UUID parameter alone is not authentication. The draft has exactly `audience` (`buyer`, `admins`, `custom`), `language` (`ar`, `en`) and `body`. Identity is exactly `{ "sample": true }` or `{ "order_id": "<uuid>" }`. The sample is fixed synthetic data. An order preview reads immutable facts from `private.wa_payment_outcomes`; it does not re-read mutable order values or accept caller facts.

The response matches the browser-safe `WaTemplatePreviewResponse`: `status`, `rendered`, `codepoints`, `truncated`, `remainingItems`, `unsupportedTokens`, `errors`. Known draft/rendering problems return a fixed error code and correlation UUID without rejected input or internal SQL text. Corrupt trusted facts yield `status: error`; unrecognized operational errors propagate to the later endpoint's fixed failure mapper. Unknown request fields, missing snapshots and unauthorized actors are refused by SQL.

Only these tokens are supported: `order_number`, `customer_name`, `customer_phone`, `total`, `currency`, `items_summary`, `invoice_url`, `order_url`. Surrounding token whitespace follows the shared TypeScript trim contract, including Unicode whitespace. Expansion is one pass: token-looking text in names and item titles remains literal. `order_url` uses the same captured server-owned invoice URL; no URL is synthesized from caller input.

Money remains PostgreSQL numeric and renders KWD to exactly three decimal places. Limits count Unicode code points, not UTF-8 bytes or JavaScript UTF-16 units. Non-item text is never silently truncated. Item summaries reserve the remaining 4096-code-point budget, divided across repeated summary tokens. Whole lines and localized remaining-item counts are preferred. An exceptionally long first title may shorten with an ellipsis while retaining its positive integer quantity. An unusably small budget fails explicitly. Stored integer quantities through `2147483647` remain supported. Preview reports truncation and omitted item count.

Private renderer helpers have no browser or service execution grants. The service reaches them through the checked preview wrapper and, later, transactional expansion wrappers. No browser renderer, hash calculation, readiness proof, provider fallback or retry authority is introduced here.

## Validation and release boundaries

`supabase/tests/whatsapp/rendering.sql` exercises actual PostgreSQL behavior under real feature roles. The guarded assembled proof includes this migration and fixture for absent/existing private schemas, permissive defaults, reruns and baseline-object parity. These are local manager receipts, not native transport or production evidence.

Recipient expansion, durable uniqueness, claim/finish, paid-path integration, legacy activation compatibility and HTTP preview remain separate unfinished gates. In particular, a legacy outcome with no resolved provider account cannot safely be assigned to a later account by this renderer. Ministry hold, production migration/merge approval, pairing and message-send gates remain unchanged.
