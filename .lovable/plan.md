## Goal
When the user-selected AI model fails (rate limit, payment, provider error, or empty output), the `extract-product` edge function should automatically retry with a 2nd model, then a 3rd. Only if all three fail does the user see an error.

## Changes

### 1. `supabase/functions/extract-product/index.ts`
- Accept an optional `fallbackModels: string[]` from the request body in addition to the existing `model`.
- Build a chain `[model, ...fallbackModels]` (deduped, max 3 entries).
- Wrap the existing `callOpenRouter` logic in a loop:
  - For each model in the chain: call OpenRouter (with the existing 1× retry-after-1.5s on 429).
  - If it returns valid structured `args` → return `{ fields, model: usedModel, attempts }`.
  - If it returns 402 / 429 / non-OK / no parseable args → record the failure reason and continue to the next model.
- Only after all three models fail, return the structured 200-with-error payload (`code: "ALL_MODELS_FAILED"`, `attempts: [...]`, `fallback: true`).
- Keep the existing "return 200 with structured error" pattern so the supabase-js client doesn't swallow the body.

### 2. `src/lib/aiImport.ts`
- Update `extractProductFields` signature to accept optional `fallbackModels?: string[]` and forward them in the body.
- Surface `usedModel` in the return type (small extension) so the UI can show which model actually answered.

### 3. `src/components/admin/ProductImportFromUrl.tsx`
- Add two more model selector dropdowns (reusing the existing Popover/Command combobox pattern):
  - **Primary model** (existing) — default `openai/gpt-4o-mini`
  - **Fallback model #2** — default `google/gemini-2.0-flash-001`
  - **Fallback model #3** — default `anthropic/claude-3.5-haiku`
- Persist all three to `localStorage` (`ai-import-model`, `ai-import-model-2`, `ai-import-model-3`).
- Pass `fallbackModels: [model2, model3]` to `extractProductFields`.
- On success, if `usedModel !== primary`, show a toast like "Primary model failed — used {usedModel} instead".

### 4. No DB / schema / auth changes needed
The function already validates the admin role; nothing else to migrate.

## Files touched
- `supabase/functions/extract-product/index.ts` (edit)
- `src/lib/aiImport.ts` (edit)
- `src/components/admin/ProductImportFromUrl.tsx` (edit)

## Out of scope
- Changing `scrape-product` (Firecrawl) — fallbacks here are AI-only.
- Changing the OpenRouter models list endpoint.
