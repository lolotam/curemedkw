Fix the "Provide a valid http(s) imageUrl" error in bulk and single upscale flows by normalizing relative Storage URLs to absolute URLs before they reach the edge function.

## Root cause

Some image URLs in DB are stored as relative paths (e.g. `/storage/v1/object/public/...`). They flow through `ensureOpenAISupportedFormat()` unchanged (HEAD fetch fails silently → returns `{ imageUrl: relative }`), then `upscale-image-ai` edge function rejects with 400 `"Provide a valid http(s) imageUrl"`.

## Changes

### 1. `src/lib/imageConvert.ts`
Add a small exported helper and a guard inside `ensureOpenAISupportedFormat`:

```ts
export function toAbsoluteImageUrl(src: string): string {
  if (!src) return src;
  if (/^https?:\/\//i.test(src)) return src;
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return src;
  return `${base}${src.startsWith("/") ? "" : "/"}${src}`;
}
```

At the top of `ensureOpenAISupportedFormat`, early-return for non-http(s) inputs so callers that forget to normalize still don't crash the edge function:
```ts
if (!/^https?:\/\//i.test(imageUrl)) return { imageUrl };
```
(The edge function will still reject, but this prevents wasted HEAD attempts and makes intent explicit.)

### 2. `src/lib/jobs/bulkUpscaleJobs.ts`
In `runOne`, normalize `src` once at the top:
```ts
const absoluteSrc = toAbsoluteImageUrl(src);
```
Use `absoluteSrc` for both branches:
- Picsart: pass `imageUrl: absoluteSrc`
- AI: `await ensureOpenAISupportedFormat(absoluteSrc)`

Keep `src` as the item key (so UI mapping by original src still works).

### 3. `src/lib/jobs/upscaleJobs.ts`
Same normalization in `startUpscale` — replace `key` with `toAbsoluteImageUrl(key)` for both `imageUrl` and `ensureOpenAISupportedFormat` calls. Keep the original `key` as the store key.

## Out of scope
- No DB cleanup of relative URLs (handled forward-only).
- No edge function changes — the 400 guard there stays as a safety net.
- Production deploy of `upscale-image-ai` is a separate server-side step (Claude Code prompt below in the chat reply, not in this plan).

## Files touched
- `src/lib/imageConvert.ts`
- `src/lib/jobs/bulkUpscaleJobs.ts`
- `src/lib/jobs/upscaleJobs.ts`
