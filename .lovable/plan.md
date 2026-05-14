# Persistent background jobs for upscale & scrape

## Problem
Today, `ImageUpscaleDialog`, `BulkImageUpscaleDialog`, and `ProductImportFromUrl` keep all job state (config, items, results, timers) inside React component state. The moment the dialog closes, the user navigates to another route, or the component re‑mounts, the state is wiped. The visible "process" appears to stop because the UI that was driving it is gone — even though some server work may still finish, the client never collects the result.

Switching browser tabs additionally freezes our `requestAnimationFrame` timers, so the elapsed counter looks stuck even when the request is still in flight.

## Goal
Once a user clicks **Generate** / **Scrape & fill**:
- The job keeps running even if the dialog is closed, the route changes, or the tab is in the background.
- When the user reopens the dialog (or comes back to the page), they see the live progress and any results that already finished.
- Results stay visible until the user explicitly **saves** (Use this image / Replace selected) or **dismisses** them.
- Only a hard browser refresh can lose in‑flight requests (browsers kill fetches on reload — unavoidable). Completed results survive a refresh too via `localStorage`.

## Design

Introduce a tiny module‑level **job store** (singleton, plain TS — no extra deps) per job family. Components become thin subscribers; the store owns the fetch and the state.

```text
src/lib/jobs/
  jobStore.ts        // generic createJobStore<TState>() with subscribe/get/set + localStorage persist
  upscaleJobs.ts     // single-image upscale jobs, keyed by imageUrl
  bulkUpscaleJobs.ts // bulk jobs, keyed by a stable jobId (productId or hash of urls)
  scrapeJobs.ts      // product-URL scrape+extract jobs, keyed by URL
```

### Store contract (per family)
- `start(key, config)` → idempotent. If a job with that key is already `running`, return the existing one. Otherwise create it, persist to `localStorage`, and kick off the async work via `supabase.functions.invoke`.
- `get(key)` → current snapshot.
- `subscribe(key, cb)` → React hook `useJob(key)` wraps this with `useSyncExternalStore`.
- `dismiss(key)` → remove from store + storage (called after Save / explicit clear).
- Persisted shape per job: `{ status: 'running' | 'done' | 'error' | 'partial', config, items[], resultUrl?, meta?, error?, startedAt, finishedAt? }`.

Promises live in‑memory only (not persisted). On a hard reload, any `running` job whose promise is gone is marked `error: 'Interrupted by reload'` so the UI can show it clearly.

### Component changes

1. **`ImageUpscaleDialog.tsx`**
   - Replace local `loading / resultUrl / startedAt / elapsedMs` with `useUpscaleJob(imageUrl)`.
   - `handleGenerate` becomes `upscaleJobs.start(imageUrl, {...config})`.
   - On dialog close, do **not** clear the job — only clear local UI selection. Reopening the same image shows live status/result.
   - `LiveTimerBadge` reads `startedAt` from the store and uses `Date.now() - startedAt` recomputed on a 1s `setInterval` (works while tab is hidden — fires when tab returns; also re-render on `visibilitychange`).

2. **`BulkImageUpscaleDialog.tsx`**
   - Generate a stable `jobId` from `storageContext.productSlug` (or hash of `imageUrls`) when the dialog opens.
   - `useBulkUpscaleJob(jobId)` returns the persisted `items[]` + overall status. The `runPool(..., 3)` loop lives inside the store, not the component.
   - Closing the dialog mid‑run leaves the pool running; reopening shows current `items[]` with correct statuses, timers, and finished thumbnails.
   - "Replace selected" calls `onReplaceMany` then `bulkUpscaleJobs.dismiss(jobId)`.

3. **`ProductImportFromUrl.tsx`**
   - `useScrapeJob(url)` drives the `phase` indicator (`scraping | extracting | done | error`).
   - Calling `run()` invokes `scrapeJobs.start(url)`. On unmount the request keeps going; on remount the same URL shows the existing in‑flight phase or, if finished, immediately calls `onImported(...)` once.

### Background‑tab fix for timers
- Drop `requestAnimationFrame`; use `setInterval(1000)` plus a `visibilitychange` listener that forces an immediate re‑render. This makes elapsed time always correct when the user returns, and our `now - startedAt` math stays accurate while hidden.

### Optional small UX touch (in scope, low cost)
- A subtle "Background jobs" pill in the admin header (only when ≥1 job is `running`) that opens the relevant dialog. Implemented as a tiny `useActiveJobs()` hook reading all three stores. If you'd rather skip this, the persistence still works — you'd just reopen the dialog manually.

## Out of scope
- No edge function changes.
- No new database tables (jobs persist in `localStorage`; they are per‑browser, per‑user, which matches today's UX).
- No queue/worker infrastructure — the store is purely client‑side coordination.

## Files touched
- **new**: `src/lib/jobs/jobStore.ts`, `src/lib/jobs/upscaleJobs.ts`, `src/lib/jobs/bulkUpscaleJobs.ts`, `src/lib/jobs/scrapeJobs.ts`
- **edited**: `src/components/admin/ImageUpscaleDialog.tsx`, `src/components/admin/BulkImageUpscaleDialog.tsx`, `src/components/admin/ProductImportFromUrl.tsx`
- **edited (only if you want the header pill)**: `src/components/admin/AdminLayout.tsx`

## Caveat to be transparent about
A **full page reload** (Ctrl+R, closing the browser) will still cancel any in‑flight `fetch`/`functions.invoke` — that's a browser‑level guarantee we can't override from the client. Already‑finished results survive the reload via `localStorage`. If you need true reload‑proof jobs, that requires a server‑side job table + polling, which is a separate, larger change I can plan next if you want.
