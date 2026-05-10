## Picsart Image Upscale — Admin Product Editor

Add an "Upscale with AI" action on each product image in `/admin/products` editor. Admin picks mode (Standard or Ultra) + factor, sees a before/after preview, then clicks Save to replace the image.

### 1. Secret
Store `PICSART_API_KEY` in Supabase secrets (value: `paat-m6jpVftwjNKr02Wf6LPVXmHBamr`). Server-side only.

### 2. Edge function — `supabase/functions/upscale-image/index.ts`
- Auth: validate JWT + `has_role(uid, 'admin')`.
- Input (Zod): `{ imageUrl: string, mode: 'standard' | 'ultra', factor: 2|4|6|8 (standard) | 2|4|6|8|16 (ultra), format?: 'JPG'|'PNG'|'WEBP' }`.
- Flow:
  1. Fetch source image from `imageUrl` → Blob.
  2. POST multipart to Picsart:
     - Standard: `https://api.picsart.io/tools/1.0/upscale` with `upscale_factor`, `format`, `image`.
     - Ultra: `https://api.picsart.io/tools/1.0/upscale/ultra` with same fields, `mode=sync`.
  3. Header `X-Picsart-API-Key: <PICSART_API_KEY>`.
  4. Read `data.url` (Picsart-hosted result, expires) → fetch bytes → upload to `product-images` bucket under `upscaled/<uuid>.<ext>` → return public URL.
- Returns `{ url, width, height, originalUrl }`.
- CORS + JSON error envelope.

### 3. Frontend — new component `src/components/admin/ImageUpscaleDialog.tsx`
Triggered from the product editor image grid (a small "Upscale" button on each image thumbnail).

Dialog contents:
- Original image preview.
- Mode radio: **Standard** (sharp images, 2×–8×) / **Ultra** (low-res / faces / noise, 2×–16×).
- Factor select: `2x / 4x / 6x / 8x` — Ultra adds `16x`.
- "Generate" button → calls `supabase.functions.invoke('upscale-image', ...)`.
- Loading state (Picsart sync can take 10–40s).
- Result preview side-by-side with original, showing new dimensions.
- Footer: **Cancel** / **Save** — Save replaces the image URL in the product's images array (via the existing setter the editor passes in).

### 4. Wire-up in `src/pages/admin/AdminProductEditor.tsx`
- Import `ImageUpscaleDialog`.
- For each entry in the images grid, add a small icon button (Sparkles icon) opening the dialog with `imageUrl` and an `onReplace(newUrl)` callback that swaps that index in the images array. No save-to-DB until the admin clicks the existing "Save product" button (consistent with current editor flow).

### 5. No DB migration
No new tables. Result image is uploaded to the existing public `product-images` bucket.

### Technical notes
- Picsart returns `{ status, data: { id, url } }` for sync upscale; `url` is a temporary CDN URL — we re-host it in our bucket so the product never points to an expiring URL.
- Aspect ratio is preserved by the API; no crop step is offered (per your answer).
- Self-hosted parity: secret name `PICSART_API_KEY` documented in `SELF_HOSTED.md` section C and the function added to `scripts/deploy-self-hosted-functions.sh`.
- Error mapping: Picsart 402/413/422 surfaced as toast with the API's message.
