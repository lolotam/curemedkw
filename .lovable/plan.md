# Persist scraped product URL into `source_url`

## Why
The product editor already has a `sourceUrl` field (DB column `source_url` exists in both Lovable Cloud and the self-hosted Supabase). Today, after a Firecrawl scrape, the URL is passed to the AI extractor but **never written back into the form**, so saving the product leaves `source_url` empty. The user wants the scraped URL automatically saved so each product remembers where it came from.

## Change (frontend only — single flow, both backends benefit)

### 1. `src/components/admin/ProductImportFromUrl.tsx`
- Extend the `onImported` callback signature from
  `(fields, images) => void` to
  `(fields, images, sourceUrl) => void`.
- Pass `scraped.sourceUrl` (the canonical URL Firecrawl returns) as the third argument when calling `onImported`.

### 2. `src/pages/admin/AdminProductEditor.tsx`
- Update `applyImported(fields, images)` to `applyImported(fields, images, sourceUrl)`.
- Inside the `setForm(...)` reducer, set `next.sourceUrl = sourceUrl` whenever a non-empty value is provided. Always overwrite — the URL is the source of truth for this import.
- Existing Save flow already persists `form.sourceUrl` into `source_url` via the standard `useCreateProduct` / `useUpdateProduct` mutations (see `src/lib/db.ts` mapping). No DB or RLS work needed.

## Out of scope
- No edge-function change (`extract-product` already receives `sourceUrl`; that path is unchanged).
- No migration (column exists).
- No change to the URL-paste field in the editor — admin can still override manually.

## Files touched
- `src/components/admin/ProductImportFromUrl.tsx`
- `src/pages/admin/AdminProductEditor.tsx`
