Add a "Convert to PNG" button inside ImagePreviewDialog that reuses the existing convertAndUploadImage helper to fix old scraped WebP/AVIF URLs on demand, and wire AdminProductEditor to persist the swap.

## Files

1. **src/components/admin/ImagePreviewDialog.tsx**
   - Add optional props: `brand?: string`, `slug?: string`, `onConverted?: (oldUrl, newUrl) => void`.
   - New button next to Download, visible only when `onConverted` is provided AND the URL does not already end in `.png/.jpg/.jpeg`.
   - Click handler: set loading → `await convertAndUploadImage(src, brand ?? "misc", slug ?? "misc")` → if returned URL differs, call `onConverted(src, newUrl)`, swap displayed `src`, toast "Converted to PNG". On no-op or failure, toast accordingly.

2. **src/pages/admin/AdminProductEditor.tsx**
   - In every `<ImagePreviewDialog>` usage, pass `brand={form.brand}`, `slug={form.slug}`, and an `onConverted` handler that:
     - Replaces the old URL in `form.mainImage` if it matches.
     - Replaces any occurrence in `form.images[]`.
     - Sets the form dirty flag so the existing Save button persists it.
   - No auto-save — user clicks Save like for any other edit.

## Out of scope
- No bulk converter (one-image-at-a-time only).
- No edge function — pure client-side, same path as import flow.
- No upscale-flow changes.