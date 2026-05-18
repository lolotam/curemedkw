## Root cause (confirmed)

`callOpenAI()` in `supabase/functions/upscale-image-ai/index.ts` uses the legacy DALL·E 2 multipart shape:

```ts
fd.append("image", srcBlob, "source.png");  // singular → routes to DALL·E 2 path
fd.append("size", "auto");                  // not valid on /v1/images/edits
```

For `gpt-image-2` (and `gpt-image-1`), `/v1/images/edits` requires the array field `image[]`, and rejects `size=auto` on edits. The 400 OpenAI returns reads "invalid model" — misleading — so the chain silently falls through to OpenRouter. Model id `gpt-image-2` is correct and stays.

## Changes

### 1. `supabase/functions/upscale-image-ai/index.ts` — fix `callOpenAI`

```ts
fd.append("image[]", srcBlob, "source.png");
// remove fd.append("size", "auto");
```

Nothing else in that function changes. Default chain, DB row, and API key are untouched.

### 2. Surface real provider error in the UI

The function already returns `502 { error, details: [...] }` with per-provider failure strings. Currently both flows swallow `details`:

- `src/lib/jobs/upscaleJobs.ts` → `runOne` → toast on error
- `src/lib/jobs/bulkUpscaleJobs.ts` → already concatenates `details` when `data.url` is missing, but does NOT use them when `error` is set (Supabase SDK throws before we see the body)

Update both job runners so when the invoke `error` carries a body, we read `error.context` (Supabase FunctionsHttpError exposes the Response) and prefer `details[0]` over the generic `error` string. Final fallback stays the current message.

No changes to `ImageUpscaleDialog.tsx` / `BulkImageUpscaleDialog.tsx` — they already display whatever the job store reports.

### 3. Redeploy

Deploy `upscale-image-ai` to Lovable Cloud (automatic on save) and to self-hosted via `scripts/deploy-self-hosted-functions.sh upscale-image-ai`.

## What does NOT change

- `gpt-image-2` model id (kept everywhere)
- `DEFAULT_IMAGE_CHAIN` ordering
- `site_settings.ai_import_models` row
- `OPENAI_API_KEY`, OpenRouter, Google fallbacks
- Frontend model picker

## Verification

1. Single upscale on `/admin/products/...` → response JSON shows `provider:"openai"`, `model:"gpt-image-2"`, `attempts: []`.
2. Bulk upscale on 3+ images → all succeed on slot 1; no `openrouter` fallback entries in logs.
3. Temporarily set slot 1 model to `gpt-image-bogus` in Admin → Models → toast now shows the actual `openai 400: ...` reason instead of a generic message. Restore afterwards.

Estimated change: ~5 lines across 2 files.
