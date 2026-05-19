Add an admin toggle on `/admin/flags` to show/hide the PICSART engine in both upscale dialogs.

## Changes

### 1. `src/lib/db.ts`
Add a new site-setting key + hook (mirrors existing `useImageCompressionEnabled`):
```ts
export const PICSART_ENGINE_ENABLED_KEY = "picsart_engine_enabled";
export function usePicsartEngineEnabled() {
  return useSiteSetting<boolean>(PICSART_ENGINE_ENABLED_KEY, true);
}
```

### 2. `src/pages/admin/AdminFlags.tsx`
Add a new card (next to `ImageCompressionCard`) with a single switch:
- Label: "PICSART upscale engine"
- Description: "Show the PICSART option in single and bulk upscale dialogs. When off, only the AI engine is available."
- Reads `usePicsartEngineEnabled`, writes via `useUpdateSiteSetting` with key `PICSART_ENGINE_ENABLED_KEY`.
- Same toast pattern as `HomeCarouselAutoscrollCard`.

### 3. `src/components/admin/ImageUpscaleDialog.tsx`
- Read `usePicsartEngineEnabled()`.
- If disabled: force `engine` to `"ai"` on mount/when flag flips, and hide the PICSART `<RadioGroupItem>` (render only the AI option, or hide the entire RadioGroup if only one option remains and show a small note "Engine: AI").

### 4. `src/components/admin/BulkImageUpscaleDialog.tsx`
Same change as #3.

## Out of scope
- No DB migration (uses existing `site_settings` table).
- No edge function changes.
- Default = enabled (true), so behavior is unchanged until an admin flips it off.

## Files touched
- `src/lib/db.ts`
- `src/pages/admin/AdminFlags.tsx`
- `src/components/admin/ImageUpscaleDialog.tsx`
- `src/components/admin/BulkImageUpscaleDialog.tsx`
