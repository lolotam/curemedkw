# Batch upscale with before/after compare slider

Extend the upscale workflow on the product editor so the admin can upscale **multiple selected images at once**, compare each one with a draggable before/after slider, then download or replace selectively.

## UX flow

1. In `AdminProductEditor`, add a "Bulk upscale" button to the gallery toolbar (next to existing per-image upscale).
2. Clicking opens a new full-screen dialog `BulkImageUpscaleDialog` with:
   - **Step 1 — Select**: thumbnail grid of all product images (main + gallery) with checkboxes. "Select all" / "Clear" controls.
   - **Engine + settings panel**: same engine choice (PICSART vs AI) and options as the existing single dialog. Single setting applied to the whole batch.
   - **Run** button → triggers parallel upscale (max 3 concurrent) calling the same `upscale-image` / `upscale-image-ai` edge functions per image. Per-image status: pending → loading → done/failed (with error tooltip).
3. **Step 2 — Compare**: once any image finishes, a results grid shows pairs. Each card has:
   - A **before/after slider** (draggable vertical handle over a stacked `<img>` pair) so the admin drags left/right to reveal the upscaled version.
   - A row checkbox (selected by default for successful items).
   - Buttons: **Preview fullscreen** (opens an enlarged version of the same slider), **Download** (single).
4. **Footer actions**:
   - **Download selected (zip)** — uses existing `downloadImagesAsZip`.
   - **Replace selected** — swaps each selected original URL with its upscaled URL inside `form.mainImage` / `form.gallery` and closes.
   - **Replace all (successful)** — same but ignores selection.
   - **Cancel** — discards results.

## Files

**New:**
- `src/components/admin/BulkImageUpscaleDialog.tsx` — orchestrates batch state, calls edge functions, renders selection + results grid + footer actions.
- `src/components/admin/BeforeAfterSlider.tsx` — reusable draggable slider (stacked images, draggable handle, keyboard arrow support, `aspect-square` container, `object-contain`). Used in both grid cards and fullscreen preview.

**Edited:**
- `src/pages/admin/AdminProductEditor.tsx` — add "Bulk upscale" button to gallery toolbar, wire dialog open state, implement `replaceMany(urlMap: Record<string,string>)` to update `mainImage` and `gallery` in one `setForm` call.

## Technical notes

- No new edge functions or DB changes. Reuses `upscale-image` and `upscale-image-ai`.
- Concurrency: simple promise pool (limit 3) to avoid hammering APIs.
- Each item state shape: `{ src, status: 'pending'|'loading'|'done'|'error', resultUrl?, meta?, error? }`.
- Selection state separate from status — only `done` items are selectable.
- Slider implementation: pointer events on a handle, percentage state 0–100, `clip-path: inset(0 X% 0 0)` on the top image. Works on touch + mouse. RTL-safe via `dir="ltr"` wrapper.
- Replace logic (in editor): build a `Map<oldUrl, newUrl>`; remap `mainImage` and `gallery` preserving order and duplicates.
- Use existing `ImagePreviewDialog` only as inspiration; the fullscreen compare uses the same `BeforeAfterSlider` enlarged.
- All styling via semantic tokens (`bg-background`, `border-border`, `bg-muted`, `text-muted-foreground`, `text-brand`). No hardcoded colors.
- Toasts for batch summary: `"Upscaled 7/8 images — 1 failed"`.
- Reuse `useAiModels` + `PROVIDER_LABELS` for the AI engine fallback display.

## Out of scope

- Persisting upscales as separate stored assets (current flow keeps the returned URL — same as today).
- Per-image different engines/factors in one batch (single setting applies to all).
- Side-by-side (non-slider) comparison view — slider is the only compare mode.
