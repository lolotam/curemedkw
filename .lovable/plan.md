# Organize storage as `{brand}/{product-slug}/...`

Today every image lands flat in the `product-images` bucket — uploads at the root, upscales under `upscaled/` or `upscaled-ai/`. We'll restructure so each product owns a folder under its brand.

## Target layout (bucket: `product-images`)

```text
product-images/
├── flexitol/
│   ├── heel-balm-200ml/
│   │   ├── original/1731000000-ab12.webp
│   │   ├── original/1731000050-cd34.webp
│   │   └── upscaled/8e3f-...-2025-05-14.png
│   └── foot-cream-100ml/
│       └── original/...
├── neutrogena/
│   └── ...
└── _unsorted/        ← fallback when brand or slug isn't known yet
    └── ...
```

- **`original/`** — direct uploads (replaces today's flat root).
- **`upscaled/`** — Picsart results (replaces `upscaled/` at the root).
- **`upscaled-ai/`** — AI image-model results (replaces `upscaled-ai/` at the root).

## Changes

### Frontend

**`src/lib/db.ts`**
- Change `uploadProductImage(file)` → `uploadProductImage(file, ctx?: { brand?: BrandKey; productSlug?: string; subfolder?: "original" | "upscaled" })`.
  - Build path: `{brand ?? "_unsorted"}/{productSlug ?? "_unsorted"}/{subfolder ?? "original"}/{ts}-{rand}.{ext}`.
  - Default `subfolder = "original"`.

**`src/pages/admin/AdminProductEditor.tsx`**
- Compute `productSlug = slugify(form.name) || form.sku || "_unsorted"`.
- Pass `{ brand: form.brand, productSlug }` to every `uploadProductImage(...)` call (main upload + gallery upload + import-from-URL persisted images).
- Pass the same context to both upscale dialogs.

**`src/components/admin/ImageUpscaleDialog.tsx`** and **`src/components/admin/BulkImageUpscaleDialog.tsx`**
- Accept new optional `storageContext?: { brand?: string; productSlug?: string }` prop.
- Forward it in the body of `supabase.functions.invoke("upscale-image" | "upscale-image-ai", { body: { ..., brand, productSlug } })`.

**`src/components/admin/ProductImportFromUrl.tsx`** (and `src/lib/aiImport.ts` if it persists images)
- Same `{ brand, productSlug }` plumbing where it calls `uploadProductImage` or invokes scrape/extract that store images.

### Edge functions

**`supabase/functions/upscale-image/index.ts`** and **`supabase/functions/upscale-image-ai/index.ts`**
- Read optional `brand`, `productSlug` from request body. Sanitize each (lowercase, `[a-z0-9-]`, max 64 chars). Default to `_unsorted` if missing.
- Build path:
  - Picsart: `{brand}/{slug}/upscaled/{uuid}.{ext}`
  - AI: `{brand}/{slug}/upscaled-ai/{uuid}.{ext}`

### Storage / RLS

- No bucket changes (`product-images` already exists and is public).
- No RLS changes — existing admin policies work for any object key.
- No DB schema changes.

## Existing images

- Existing flat objects stay where they are; `products.main_image` / `products.gallery` URLs keep working.
- A one-shot migration script (out of scope unless asked) could move legacy keys into `_unsorted/` or attempt brand/slug inference. For now just leave them.

## Edge cases

- **New product (no name yet)**: slug falls back to `_unsorted`. Files reorganize automatically once the user gives the product a name and uploads more.
- **Renamed product**: previously uploaded files keep their old folder name (URLs are immutable); only new uploads/upscales land in the new folder. Acceptable trade-off.
- **Slug collisions across brands**: scoped under brand folder, so collisions are isolated.

## Out of scope

- Backfilling existing files into the new structure.
- Renaming/moving objects when a product's name changes.
- Per-folder cleanup when a product is deleted.

Confirm and I'll implement, or tell me if you also want a one-shot backfill of existing files into `{brand}/{slug}/original/`.
