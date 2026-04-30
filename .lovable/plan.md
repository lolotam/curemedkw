## Issue

In `/admin/products/:id` → **Media** card, the "Upload" button next to the main image thumbnail calls `uploadMain`, which **replaces** `form.mainImage` instead of adding the file to the gallery. The user expects all uploads to land in the gallery, then to choose which one becomes the main image.

Good news: the gallery already has a per-image "Set as main" star button (calls `setAsMain`), so we just need to change the upload behavior.

## Changes (single file)

`src/pages/admin/AdminProductEditor.tsx`

1. **Replace `uploadMain` with append-to-gallery logic** (lines 164–173). Allow multiple files (consistent with `uploadGallery`). If the current `mainImage` is still the placeholder (`startsWith("data:")`) and there is no real main yet, automatically promote the first uploaded image to main so the product card isn't empty. Otherwise just append all uploads to `form.gallery`.

   ```ts
   const uploadMain = async (e: React.ChangeEvent<HTMLInputElement>) => {
     const files = Array.from(e.target.files || []);
     if (!files.length) return;
     try {
       const urls = await Promise.all(files.map(uploadProductImage));
       const mainIsPlaceholder = !form.mainImage || form.mainImage.startsWith("data:");
       if (mainIsPlaceholder) {
         const [first, ...rest] = urls;
         update("mainImage", first);
         update("gallery", [...form.gallery, ...rest]);
         toast.success(
           urls.length === 1
             ? "Image uploaded and set as main"
             : `${urls.length} images uploaded — first set as main`,
         );
       } else {
         update("gallery", [...form.gallery, ...urls]);
         toast.success(
           `${urls.length} image(s) added to gallery. Hover any image and click ★ to set as main.`,
         );
       }
     } catch (err: any) {
       toast.error(err.message);
     }
     e.target.value = "";
   };
   ```

2. **Allow multi-file selection on the main upload input** (line 570): add `multiple`.

   ```tsx
   <input type="file" ref={fileMain} accept="image/*" multiple onChange={uploadMain} className="hidden" />
   ```

3. **Tweak the helper text** under "Main image" (line 569) so the new behavior is obvious:

   > "Uploads are added to the gallery. Hover any gallery image and click ★ to make it the main image."

No other code needs to change. `setAsMain` (line 197) already swaps the chosen gallery image into `mainImage` and pushes the previous main back into the gallery, which is exactly the workflow the user described.

## Outcome

- Clicking **Upload** next to the main image no longer overwrites the existing main image.
- New uploads always go to the gallery.
- For brand-new products (placeholder main), the very first upload still auto-fills the main slot for convenience.
- User picks the main image any time via the existing ★ button on a gallery thumbnail.
