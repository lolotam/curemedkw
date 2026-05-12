## Goal

On brand pages (e.g. `/kapiva`, `/flexitol`, …), make the **footer logo** use the same uploaded image as the **header logo** configured in `/admin/branding` → "Per-brand page logos" → Header logo. Today the footer falls back to the hardcoded bundled brand logo even when an admin has uploaded a custom one.

## Change

**File:** `src/components/site/SiteFooter.tsx`

- Resolve `brandMeta` as today (by `themeAttr`).
- Add `const { data: brandHeaderLogo } = useBrandingBrandLogo(brandMeta?.key ?? null);` (already exported from `src/lib/db.ts`, reads `site_settings` key `branding_brand_logo_<brand>`).
- Logo resolution order:
  1. If on a brand page (`brandMeta` exists): `brandHeaderLogo?.trim() || brandMeta.logo`
  2. Otherwise (Curemed footer): existing behavior — `brandingLogo?.trim() || defaultLogo` with the remove-bg class.
- Keep the existing remove-bg class only for the Curemed (non-brand) case, matching `SiteHeader` behavior.

No DB changes, no admin UI changes, no changes to `BrandPage` or any other file. The admin already uploads to the same `branding_brand_logo_<brand>` setting that the header reads — we're just making the footer read from it too.