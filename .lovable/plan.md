## Goal
Let admins control image WebP conversion from `/admin/branding`: an enable/disable toggle and a quality % slider (default 99%).

## Settings (stored in `site_settings`)
- `image_compression_enabled` — boolean, default `true`
- `image_compression_quality` — number 1–100, default `99`

## Changes

### 1. `src/lib/imageConvert.ts`
- Make `convertToWebP(file, quality?)` read defaults from a module-level cache when `quality` is not passed.
- Add `setImageCompressionConfig({ enabled, quality })` and `getImageCompressionConfig()` so React code can sync settings into the cache after fetch.
- If `enabled === false`, return the original file untouched (skip conversion entirely).
- Quality stored as 1–100, divided by 100 internally for the canvas API.

### 2. `src/lib/db.ts`
- Add constants + hooks:
  - `IMAGE_COMPRESSION_ENABLED_KEY`, `IMAGE_COMPRESSION_QUALITY_KEY`
  - `useImageCompressionEnabled()` → boolean (default `true`)
  - `useImageCompressionQuality()` → number (default `99`)
- Existing `useUpdateSiteSetting` is reused for writes.

### 3. `src/components/site/BrandingHead.tsx` (or a tiny new sync component mounted in `App.tsx`)
- Subscribe to both settings via the hooks above and call `setImageCompressionConfig(...)` on change so every uploader (hero, products, branding, account avatar) picks up the latest values without prop-drilling.

### 4. `src/pages/admin/AdminBranding.tsx`
- New "Image compression" card with:
  - Switch: "Convert uploaded images to WebP" (bound to `image_compression_enabled`)
  - Slider + number input: "Quality" 1–100, default 99 (disabled when toggle off)
  - Helper text explaining lower % = smaller file but lower quality; 100% = near-lossless.
- Save uses `useUpdateSiteSetting` and shows a toast.

### 5. Call sites already in code
No changes needed at call sites in `heroSlides.ts`, `db.ts`, `Account.tsx` — they all call `convertToWebP(file)` with no quality arg, which will now read from the synced config.

## Notes
- No DB migration required; `site_settings` already supports arbitrary JSON keys.
- Default quality bumped from 0.82 → 0.99 effectively for any project that hasn't customized the value.
