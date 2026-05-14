Plan to fix the persistent data loss

1. Add real backend-backed job persistence
- Create one admin-only table, for example `admin_background_jobs`, in the self-hosted database.
- Store each scrape/upscale job with:
  - `id`, `kind`, `status`, `user_id`
  - `input` JSON, `result` JSON, `error`
  - timestamps: `created_at`, `started_at`, `finished_at`, `updated_at`
- Protect it with RLS using the existing `has_role(auth.uid(), 'admin')` function.
- This keeps job state/results even if you leave `/admin/products/new`, refresh, or return later.

2. Convert scrape/import to an async job flow
- Keep using the self-hosted Supabase runtime client (`clientRuntime.ts`) and do not switch back to Lovable Cloud credentials.
- Change the frontend scrape flow from:
  - call `scrape-product` and wait in the page
- To:
  - create/start scrape job
  - return a `jobId` immediately
  - poll job status until `succeeded` or `failed`
  - store scraped/extracted result in the job table
- When the user returns to the product editor, show the finished scrape job and allow applying it to the form.

3. Convert image upscaling to async/polling
- Update single and bulk upscale flows so the browser does not own the only running process.
- The function should create a job row and process it in the background where supported, then the UI polls by `jobId`.
- Persist final image URLs in the job result, so “Use this image” is still available after navigating away or refreshing.
- Keep the current self-hosted API keys server-side only: PICSART/OpenAI/Google/OpenRouter remain in the edge-runtime environment, never frontend code.

4. Add product editor draft autosave
- Persist unsaved product form changes locally per editor route:
  - new product draft: `/admin/products/new`
  - existing product draft: `/admin/products/:id`
- Autosave all form data after scrape import, manual edits, and image replacements.
- On returning to the editor, restore the draft automatically or show a clear “restore/discard” prompt.
- Clear the draft only after a successful product save/delete.

5. Make current UI reconnect to existing jobs
- Update `jobStore` behavior so running jobs are not blindly marked “Interrupted by reload”.
- If a persisted job has a backend `jobId`, rehydrate it and continue polling.
- Add small status/recovery UI in:
  - `ProductImportFromUrl`
  - `ImageUpscaleDialog`
  - `BulkImageUpscaleDialog`
- This lets you recover finished scrape/upscale results even if the original dialog/page was closed.

6. Error handling and deployment notes
- Return clear job errors like missing API key, admin role missing, provider timeout, or scrape failure.
- Keep all calls using `supabase.functions.invoke()` through `clientRuntime.ts` so the app remains connected to `https://supabase.curemedkw.com` via `public/config.js` / runtime config.
- Add/update self-hosted migration and function deployment scripts if needed so the same changes can be applied to Dokploy/self-hosted Supabase.

Files expected to change
- `supabase/functions/*` for async job start/status/processing
- a new database migration for `admin_background_jobs`
- `src/lib/jobs/jobStore.ts`
- `src/lib/jobs/scrapeJobs.ts`
- `src/lib/jobs/upscaleJobs.ts`
- `src/lib/jobs/bulkUpscaleJobs.ts`
- `src/components/admin/ProductImportFromUrl.tsx`
- `src/components/admin/ImageUpscaleDialog.tsx`
- `src/components/admin/BulkImageUpscaleDialog.tsx`
- `src/pages/admin/AdminProductEditor.tsx`

Validation
- Start scrape on `/admin/products/new`, navigate away, return, confirm result can still be applied.
- Start single upscale, close dialog/navigate away, return, confirm result remains available.
- Start bulk upscale, leave page, return, confirm completed/failed item statuses persist.
- Refresh during a job and confirm the UI reconnects instead of canceling it.
- Confirm console still shows the self-hosted Supabase URL from runtime config.