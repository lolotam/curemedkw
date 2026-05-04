## Goal

In `/admin/categories` "Add category" / "Edit category" dialog, the image upload works but the resulting URL is not visible. Add a URL text input next to the Upload button (mirroring the pattern in `/admin/branding` `BrandingField`), so admins can either paste a URL or upload — and after upload, the URL is shown and editable.

## Changes

**File: `src/pages/admin/AdminCategories.tsx`** — only the image section of `CategoryEditorDialog` (lines ~382–415).

Replace the current image block with the same UX as branding:

1. Keep the 32×32 (h-32 w-32) square preview thumbnail on the left with the X remove button.
2. To the right, render:
   - A **URL Input** bound to `form.imageUrl` (`onChange` updates `imageUrl` directly). Placeholder: `https://example.com/category.jpg`.
   - An **Upload button** (icon + label) that triggers a hidden `<input type="file" accept="image/*">`. On upload, call existing `uploadCategoryImage(file)`, set `form.imageUrl` to the returned public URL, and toast success — same behavior as today.
   - Helper text: "Paste a URL above, or upload an image. 1:1 square recommended (PNG/JPG/WebP)."
   - When `form.imageUrl` is non-empty, show a small "Currently: <mono URL>" line below (break-all) so the link is visible — matching `AdminBranding`.

3. No changes to `uploadCategoryImage`, `useCreateCategory`, or `useUpdateCategory` — the saving flow is unchanged. The URL is already persisted to the `categories.image_url` column via the existing save path.

No DB migrations, no new dependencies, no other files touched.

## Result

- Admins can paste an image URL directly (no upload needed).
- After uploading, the resulting public Storage URL appears in the input and is visible/copyable.
- Behavior matches `/admin/branding` brand card logo flow.
