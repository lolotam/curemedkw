## Goal
Enhance the **Media** section in `src/pages/admin/AdminProductEditor.tsx` so admins can:
1. **Preview** any image (main or gallery) full-size in a lightbox by clicking it.
2. **Download** any individual image (hover overlay button + lightbox button).
3. **Select multiple gallery images** with checkboxes and **bulk-download** them as a ZIP, plus a "Download all" shortcut.

No backend changes required — all client-side.

---

## Changes

### 1. New component: `src/components/admin/ImagePreviewDialog.tsx`
A reusable lightbox built on the existing shadcn `Dialog`:
- Receives `src`, `alt`, `open`, `onOpenChange`.
- Shows the image at `max-h-[85vh] object-contain`, centered on a dark backdrop.
- Includes a **Download** button in the dialog footer (calls a shared `downloadImage(url, filename)` helper).
- Closes on overlay click / X / Escape (built-in Dialog behavior).

### 2. New helper: `src/lib/downloadImage.ts`
Small utility module:
- `downloadImage(url, filename?)` — fetches the image as a blob, creates an object URL, triggers `<a download>` click, then revokes. Falls back to opening in a new tab if CORS blocks the fetch (Supabase Storage URLs are CORS-enabled, so this should work for our own uploads).
- `downloadImagesAsZip(urls, zipName)` — uses **JSZip** to bundle multiple images into one `.zip`. Each file named `image-1.jpg`, `image-2.jpg`, …, derived from the URL's extension when available.
- Show `toast.loading` → `toast.success`/`toast.error` for feedback.

**New dependency:** `jszip` (lightweight, ~100KB gzipped, well-maintained).

### 3. Update `src/pages/admin/AdminProductEditor.tsx` — Media card

**Main image block:**
- Make the thumbnail clickable → opens `ImagePreviewDialog`.
- Add a small **Download** icon button next to the existing **Upload** button.

**Gallery block:**
- Add local state: `selected: Set<number>` and `previewUrl: string | null`.
- Add a header row above the grid with:
  - "Select all" / "Clear" toggle (only when gallery has images).
  - **Download selected** button (disabled when none selected) → `downloadImagesAsZip(selectedUrls, "{sku}-selected.zip")`.
  - **Download all** button → ZIP of all gallery images + main.
  - Existing "Add images" button stays on the right.
- Each gallery tile gets:
  - A small **checkbox** in the top-left corner (always visible, semi-transparent, becomes solid on hover/checked) to toggle selection.
  - The hover overlay gains two new icon buttons: **Eye** (preview → opens lightbox) and **Download** (single-image download). Existing **Star** (set as main) and **X** (remove) remain.
  - Clicking the image itself (outside the checkbox/overlay buttons) opens the lightbox preview.
- A selected tile shows a brand-colored ring (`ring-2 ring-brand`) for clear visual feedback.

**Imports added:** `Download`, `Eye`, `CheckSquare`, `Square` from `lucide-react`; `Checkbox` from `@/components/ui/checkbox`; the new `ImagePreviewDialog` and download helpers.

### 4. Filename heuristics
- Single download filename: `{sku || slug(name) || "product"}-main.{ext}` for main, `{sku}-{index+1}.{ext}` for gallery items.
- ZIP name: `{sku || "product"}-images.zip` or `{sku}-selected.zip`.

---

## Files touched
- **New:** `src/components/admin/ImagePreviewDialog.tsx`
- **New:** `src/lib/downloadImage.ts`
- **Modified:** `src/pages/admin/AdminProductEditor.tsx` (Media card only — no other sections affected)
- **Dependency added:** `jszip`

## Out of scope
- Drag-to-reorder gallery (not requested).
- Server-side ZIP generation — client-side is sufficient for typical 1–20 product images.
- Public product detail page lightbox — this plan covers the **admin editor** only, per the request.