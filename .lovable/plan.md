## Goal

In `/admin/branding`, every image URL field (global Curemed logo, favicon, and the 7 per-brand logos) should support **two ways** of setting the image:

1. Paste a URL (current behavior — keep working).
2. Upload a file from the computer — the file is uploaded to the storage bucket, and the resulting public URL is auto-filled into the same field and saved.

Both paths end up writing the same string (a public URL) into the existing `site_settings` rows, so there is **no schema change** and the header / favicon / per-brand logo logic keeps working unchanged.

---

## Storage

Reuse the existing public bucket **`brands-images`** (already in the project, already public, already RLS-configured for admins to write). All branding uploads go into a dedicated folder inside it:

```
brands-images/
  branding/
    logo-<timestamp>.png            ← global Curemed logo
    favicon-<timestamp>.png         ← favicon
    brand-flexitol-<timestamp>.png  ← per-brand logos
    brand-kapiva-<timestamp>.svg
    ...
```

- Filename pattern: `${prefix}-${Date.now()}.${ext}` — keeps history, avoids collisions, no overwrite of older versions.
- Public URL obtained via `supabase.storage.from("brands-images").getPublicUrl(path)`.
- No DB migration needed (bucket already exists and is public).

---

## UI changes — `src/pages/admin/AdminBranding.tsx`

Inside the existing `BrandingField` card, next to the URL input add an **"Upload file"** button (and a hidden `<input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg,image/x-icon">`).

Layout per field:

```
[ URL input ..........................................  ]  [ Upload ]
[ format / transparency check messages ]
[ preview tiles ]
[ Reset ]                                              [ Save ]
```

Behavior on file pick:
1. Validate: image mime, max size (e.g. 4 MB).
2. Show inline progress (spinner on the Upload button, disable Save).
3. Upload to `brands-images` under the storage path described above using the field's `storagePrefix` prop (`logo`, `favicon`, `brand-<key>`).
4. On success: get the public URL, set it as the draft value, then immediately call the existing save mutation so the user does not have to click Save (toast: "Logo uploaded and saved").
5. On error: toast with the error message; leave the existing saved value untouched.

The URL input and existing Save / Reset / preview tiles / transparency probe all keep working exactly as today — uploading just becomes a shortcut that fills the URL automatically.

---

## Code changes

### `src/lib/db.ts`
Add one small helper used by all branding fields:

```ts
export async function uploadBrandingImage(
  file: File,
  prefix: string,                  // "logo" | "favicon" | "brand-flexitol" | ...
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `branding/${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("brands-images")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("brands-images").getPublicUrl(path).data.publicUrl;
}
```

### `src/pages/admin/AdminBranding.tsx`
- Add an `uploadPrefix: string` prop to `BrandingField` (`"logo"`, `"favicon"`, `\`brand-${b.key}\``).
- Add internal state: `uploading: boolean`, `inputRef`.
- Add the Upload button + hidden file input.
- On change → call `uploadBrandingImage`, then `update.mutateAsync({ key: settingKey, value: url })`, then update `draft` and toast.
- Keep all existing behavior: URL probe, transparency tiles, JPEG warning, Reset, manual Save.

### Files NOT changed
- DB schema, RLS, buckets — none.
- `SiteHeader.tsx`, `BrandingHead.tsx`, `SiteFooter.tsx`, `AdminLayout.tsx` — they read the URL from `site_settings` exactly as today.
- All other admin pages.

---

## Acceptance checks

- In `/admin/branding`, each of: global logo, favicon, and the 7 brand logos shows a URL input **and** an Upload button.
- Pasting a URL + clicking Save still works (current flow unchanged).
- Clicking Upload → picking a PNG → file is uploaded to `brands-images/branding/...`, the URL auto-fills the input, and the setting is saved automatically.
- After upload, the header (or brand-page header / browser tab favicon) immediately reflects the new image without manual save.
- Invalid (non-image) or > 4 MB files are rejected with a toast and no upload happens.
- Reset still clears the value back to the bundled default.
