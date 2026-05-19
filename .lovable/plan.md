# Clean scraped image URLs + convert WebP/AVIF on import (client-side)

Self-hosted edge runtime can't reliably run WASM image decoders, so all conversion happens in the browser using the existing `OffscreenCanvas`-based `ensureOpenAISupportedFormat()` helper. No new edge function, no migrations.

## Part 1 — Strip query string from scraped image URLs

**File:** `supabase/functions/scrape-product/index.ts`

In `collectImages()`'s `add()` helper, normalize every URL:

```ts
const stripQuery = (u: string) => {
  try { const x = new URL(u); x.search = ""; x.hash = ""; return x.toString(); }
  catch { return u.split("?")[0].split("#")[0]; }
};
```

Apply `stripQuery(raw)` before deduping so the returned `images[]` is clean. OG image fallback goes through the same path.

Effect: `https://pharmazone.com/cdn/shop/files/49899_000_001_1800x1800.webp?v=1746644166` → `https://pharmazone.com/cdn/shop/files/49899_000_001_1800x1800.webp`.

Needs redeploy on self-hosted:
```bash
bash scripts/deploy-self-hosted-functions.sh scrape-product
```

## Part 2 — Client-side convert + upload at import

### 2a. New helper in `src/lib/imageConvert.ts`

```ts
export async function convertAndUploadImage(
  url: string,
  brand: string,
  slug: string,
): Promise<string>
```

Logic:
1. Cheap extension check on `url.split("?")[0]` — if it ends in `.png/.jpg/.jpeg`, return `url` unchanged.
2. Call existing `ensureOpenAISupportedFormat(url)`.
3. If result has `imageBase64 + imageMime` (i.e. it was WebP/AVIF and got converted to PNG):
   - Decode base64 → `Uint8Array` → `Blob({ type: "image/png" })`.
   - Sanitize `brand` and `slug` the same way `upscale-image-ai` does (`[^a-z0-9-]` → `-`, fall back to `_unsorted`).
   - Path: `<brand>/<slug>/imported/<crypto.randomUUID()>.png`.
   - `supabase.storage.from("product-images").upload(path, blob, { contentType: "image/png", upsert: false })`.
   - Return `supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl`.
4. If no conversion happened, return the original `url`.
5. Wrap everything in try/catch — on any failure, return the original `url` (never break import).

Uses the existing `product-images` public bucket and existing admin RLS policy on storage — no migration.

### 2b. Wire into import merge

**File:** `src/pages/admin/AdminProductEditor.tsx` (around line 312, the `if (images.length)` block)

Before assigning to `next.mainImage` / `next.gallery`, run scraped URLs through the helper in parallel:

```ts
const brand = next.brand;
const slug = slugify(next.name || "_unsorted");
const converted = await Promise.all(
  images.map((u) => convertAndUploadImage(u, brand, slug))
);
const convertedCount = converted.filter((u, i) => u !== images[i]).length;
if (convertedCount > 0) {
  toast.success(`Converted ${convertedCount} image(s) to PNG`);
}
// then use `converted` in place of `images` for mainImage/gallery assignment
```

Import `toast` from `sonner` (already used elsewhere in the editor) and `convertAndUploadImage` from `@/lib/imageConvert`.

### 2c. Upscale fallback untouched

`src/lib/jobs/upscaleJobs.ts` and `src/lib/jobs/bulkUpscaleJobs.ts` already call `ensureOpenAISupportedFormat()` before invoking `upscale-image-ai`. This keeps old DB rows that still have external WebP/AVIF URLs working — no change needed there.

## Part 3 — Deploy script doc only

**File:** `scripts/deploy-self-hosted-functions.sh`

Add `scrape-product` to the production-functions list in the header comment if it isn't already mentioned. No script logic change (it auto-discovers folders). No new function added.

## What you do after I implement

1. Approve plan.
2. Redeploy `scrape-product` to self-hosted (one-liner above). No other deploy needed — Part 2 is pure frontend.

## Files touched

- `supabase/functions/scrape-product/index.ts` — add `stripQuery` in `collectImages`
- `src/lib/imageConvert.ts` — add `convertAndUploadImage`
- `src/pages/admin/AdminProductEditor.tsx` — call helper in import-merge block, show toast
- `scripts/deploy-self-hosted-functions.sh` — header comment only

No SQL migrations. No new edge functions. No changes to upscale flows.
