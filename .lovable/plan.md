# Branding admin: add per-brand "card logo" + fix logo upload

## Problems

1. **Upload to `brands-images` is broken.** The `uploadBrandingImage()` helper writes to the public `brands-images` storage bucket, but `storage.objects` has **no RLS policies for that bucket** (nor for `favicone`, `buket-images`). Admins can read but not insert, so every Branding upload silently fails with a permission error.

2. **Brand cards on `/curemed` "Our brands" section have no admin control over the card logo.** Today the card image comes from `getBrandLogo()` -> hardcoded `BRANDS[].logo` constant. There's no way to change it without code edits, and the Admin Branding page only manages the **header** logo, not the card logo.

3. The Branding page lists every brand with the same single field, mixing "Curemed" (which has no card) into the same per-brand section.

## Approach

- Add storage RLS policies so admins can upload/update/delete in `brands-images` (and the other unprotected branding buckets).
- Add a second site-setting per brand for the **card logo** (separate from the header logo).
- Restructure the Admin Branding page so each brand has **two** image controls: header logo + card logo, each with paste-URL + upload. The Curemed parent stays as a single header logo (no card).
- Wire `/curemed` "Our brands" cards to read the new card-logo setting (fall back to the existing hardcoded `BRANDS[].logo` when unset).

## Changes

### 1. Storage RLS migration

For bucket `brands-images` (and `favicone`, `buket-images` for safety) add three `storage.objects` policies — INSERT/UPDATE/DELETE gated by `has_role(auth.uid(), 'admin')`. Public SELECT already works because the buckets are public.

### 2. `src/lib/db.ts`

- Add `BRANDING_BRAND_CARD_LOGO_KEY(brand)` returning `branding_brand_card_logo_${brand}`.
- Add `useBrandingBrandCardLogo(brand)` hook (mirrors `useBrandingBrandLogo`).
- No change to `uploadBrandingImage()` once RLS is fixed.

### 3. `src/pages/admin/AdminBranding.tsx`

- Keep top "Site logo", "Remove white bg" toggle, and "Favicon" sections as-is (Curemed parent — header logo only, no card).
- Replace the per-brand `BRAND_LIST.map(...)` block with a grouped section per brand showing **two** `BrandingField` cards side-by-side (or stacked):
  - **`{Brand} — Header logo`** (existing key `BRANDING_BRAND_LOGO_KEY(b.key)`, prefix `brand-${b.key}-header`).
  - **`{Brand} — Card logo`** (new key `BRANDING_BRAND_CARD_LOGO_KEY(b.key)`, prefix `brand-${b.key}-card`). Description: "Shown inside this brand's tile in the 'Our brands' section on the Curemed home page."
- Wrap each brand in a titled group (e.g. small heading with brand name) so it's clear the two fields belong together.
- The existing `useValue: () => useBrandingBrandLogo(b.key)` pattern is reused for the new field with `useBrandingBrandCardLogo`.

### 4. `src/lib/placeholder.ts`

No change — keep `getBrandLogo()` as the static fallback.

### 5. `src/pages/CuremedHome.tsx` — brand marquee

In the `BRAND_LIST.map(...)` for the `#brands` section:

- For each brand, read the saved card-logo URL. Because it's a fixed list rendered twice (BRAND_LIST + clones), call a small helper component `BrandMarqueeCard` per item so we can use the `useBrandingBrandCardLogo(b.key)` hook safely (one hook call per stable brand row — Rules of Hooks compliant).
- If the hook returns a non-empty URL, use it for `<img src>` and treat it as `isImage=true`. Otherwise fall back to existing `getBrandLogo()` result.
- Keep the layout/sizing exactly as it is now (`h-[200px]` panel, white inner tile, `object-contain`).

## Out of scope

- Changing card sizes, the featured-products marquee, or the BrandPage header logo logic (still uses existing `useBrandingBrandLogo`).
- Adding card logo for Curemed parent (it has no card per the request).

## Technical notes

- New site_settings keys are created lazily on first save; no DB migration needed for them (the existing `site_settings` table + `useSiteSetting`/`useUpdateSiteSetting` already handle arbitrary keys).
- The only DB migration is the storage RLS policies for `brands-images` (and the two other unprotected branding buckets). After this, the existing Upload button will start working immediately.
