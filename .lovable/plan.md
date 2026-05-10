# Why GPT-4o-mini was used and where the last scrape ran

## 1. Findings — read this first

### A. Why OpenRouter logged `gpt-4o-mini` even though `/admin/models` shows Nemotron + Gemma + gpt-oss-120b

The 3 model slots on `/admin/models` are stored in **browser `localStorage`** (`src/lib/aiModels.ts`, keys `ai-import-model`, `ai-import-model-2`, `ai-import-model-3`).

`localStorage` is **per-origin and per-browser**. That means:

- Settings saved on `id-preview--…lovable.app` are **NOT visible** on `curemedkw.com`.
- Settings saved in one browser/profile are not visible in another.
- A private/incognito window starts empty.

When the slots are empty, `getAiModels()` falls back to `DEFAULT_AI_MODELS`:
```
["openai/gpt-4o-mini", "google/gemini-2.0-flash-001", "anthropic/claude-3.5-haiku"]
```
The frontend (`ProductImportFromUrl.tsx`) sends those values to `extract-product`, which forwards them as-is to OpenRouter. The edge function is behaving correctly — it is the **client** that sent `openai/gpt-4o-mini` because the live origin had no saved selection.

So nothing in the edge function ignores the dashboard. The dashboard choices simply didn't reach the edge function on that call.

### B. Where the last scrape was stored, and which functions ran

- **Lovable Cloud edge function logs** for `scrape-product`, `extract-product`, `translate-product` for the last day are **empty** (see context).
- **Lovable Cloud `products` table**: newest row is `2026-04-29` (over a week ago). No new product was inserted on Lovable Cloud today.
- The OpenRouter dashboard screenshot shows a real call at **May 10, 03:16 PM** with App = "Curemed Admin" (the `X-Title` header set inside our edge functions).

Conclusion: the recent scrape ran on the **self-hosted Supabase stack** (Dokploy / `supabase.curemedkw.com`), not on Lovable Cloud. The functions invoked were `scrape-product` (Firecrawl) → `extract-product` (OpenRouter). `translate-product` may or may not have followed depending on the admin UI flow.

This is consistent with `clientRuntime.ts` + `/config.js`: when the live site is served with a `config.js` pointing to the self-hosted Supabase URL, every `supabase.functions.invoke(...)` call goes to the self-hosted functions container, and rows are written to the self-hosted DB — completely separate from Lovable Cloud's DB.

## 2. Proposed fix — make model selection authoritative server-side

The cleanest fix is to stop relying on per-browser `localStorage` for something that affects server billing and behavior. Store the 3 model IDs in the database, read them in the edge function as the source of truth, and use the dashboard UI to write them.

### Steps

1. **DB**: add a tiny key/value settings table (or reuse one if it already exists) on **both** Lovable Cloud and the self-hosted stack:
   ```
   create table public.app_settings (
     key text primary key,
     value jsonb not null,
     updated_at timestamptz not null default now()
   );
   ```
   - RLS: `select` allowed to everyone authenticated (or anon, since model IDs are not secret); `insert/update` only for `has_role(auth.uid(), 'admin')`.
   - Seed row: `('ai_import_models', '["openai/gpt-4o-mini","google/gemini-2.0-flash-001","anthropic/claude-3.5-haiku"]')`.

2. **`/admin/models` page**: load + save the 3 slots from `app_settings` instead of `localStorage`. Keep a small in-memory cache so the UI is snappy. Show a "Saved" toast on success.

3. **`extract-product` edge function**: at the top of the handler, fetch `app_settings.ai_import_models` with the service-role client and use that as the chain. Ignore any model fields coming from the request body (or only honor them when an explicit `override: true` flag is passed by the admin UI for one-off testing).

4. **`translate-product` edge function**: today the model is hardcoded to `google/gemini-2.5-flash`. Either (a) leave it, or (b) add a separate `app_settings.ai_translate_model` row and read it the same way. Recommend (b) so translation is also configurable from the dashboard.

5. **`ProductImportFromUrl.tsx`**: stop sending `model` / `fallbackModels` from the client. The edge function now decides. Keep `useAiModels` only as a *display* hook that reads from DB so the admin still sees the active models in the import card.

6. **Self-hosted parity**: the migration applied to Lovable Cloud must also be applied to the self-hosted Supabase via `scripts/apply-self-hosted-migrations.sh`, and `extract-product` / `translate-product` redeployed on the self-hosted side via `scripts/deploy-self-hosted-functions.sh`. Document this in `SELF_HOSTED.md`.

### Result
- One source of truth for which models are used, regardless of browser, device, or origin.
- The self-hosted site and the Lovable preview each have their own row, so you can run different model chains per environment if you want.
- No more "I set Nemotron but OpenRouter billed GPT-4o-mini".

## 3. Quick answer to "which side stored the last scrape"

The latest scrape on May 10 was **stored on the self-hosted Dokploy Supabase database** and used the **self-hosted `scrape-product` + `extract-product` edge functions**. The Lovable Cloud DB and Lovable Cloud functions were not involved in that call.

## 4. Files that will change (for reference)

- `supabase/migrations/<new>.sql` — create `app_settings` + RLS + seed.
- `src/lib/aiModels.ts` — replace localStorage with Supabase read/write.
- `src/pages/admin/AdminModels.tsx` — wire to async load/save.
- `src/components/admin/ProductImportFromUrl.tsx` — stop sending model fields.
- `supabase/functions/extract-product/index.ts` — read chain from `app_settings`.
- `supabase/functions/translate-product/index.ts` — optionally read translate model from `app_settings`.
- `SELF_HOSTED.md` — note the migration + redeploy step.

Approve this and I'll implement it.
