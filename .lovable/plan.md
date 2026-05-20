## Goal

In the Partners dropdown, the right-side preview should render the same header logo each brand uses (admin-overridden via `useBrandingBrandLogo`), not the static `b.logo` from `BRAND_LIST`.

## Change (single file: `src/components/site/SiteHeader.tsx`)

1. Extract a new small component `BrandLogoPreview` that takes `brand` (a `BRAND_LIST` item).
   - Calls `useBrandingBrandLogo(brand.key)` to get the admin-uploaded header logo for that brand.
   - Falls back to the global `brandingLogo` (default header logo) when the brand-specific override is empty — matching the header's own `logoSrc` precedence.
   - Final fallback: `brand.logo` (card logo) only if neither setting is configured, so the preview is never blank.
   - Renders the `<Link to={`/${brand.slug}`}>` + `<img>` currently in the right half, and reuses the `brand-logo-img` / `brand-logo-img--remove-white` classes (reading `useBrandingLogoRemoveBg`) so transparency handling matches the header.

2. In `PartnersMenu`, replace the inline right-half `<Link><img/></Link>` block with `<BrandLogoPreview brand={hoveredBrand} />`. Keep the existing container styling (`w-1/2 border-l border-border bg-muted/30 flex items-center justify-center p-4`).

3. No changes to the left list, widths, hover behavior, or any other file.

## Notes

- `useBrandingBrandLogo` is already imported in this file.
- Hooks run per-render of `BrandLogoPreview`, so React's rules-of-hooks are respected (one hook call per brand key as it changes).
