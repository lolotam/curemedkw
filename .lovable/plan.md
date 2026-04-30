## Goal

On `/admin/branding`, give every brand **two** logo controls (URL + Upload for each):
1. **Header logo** — already exists, used in the brand site header.
2. **Card logo** — NEW, used inside the brand tile in the "Our brands" carousel on `/curemed`.

The Curemed parent stays as-is (Site logo + Favicon, no card section). Brand colors and card sizes on `/curemed` are not touched.

Also verify/fix the upload flow.

## Investigation findings

- Storage bucket `brands-images` is public and already has correct RLS policies (`Admins can upload brands images` with `has_role(auth.uid(),'admin')`). The previous "missing RLS policies" claim was incorrect — uploads should already work for logged-in admins. If the user still sees an upload failure, the most likely cause is **not being signed in as an admin** in the browser session. We will surface a clearer error message when the upload returns an RLS error so the admin understands why.
- `BRANDING_BRAND_LOGO_KEY(brand)` already stores the per-brand header logo via `site_settings`. We will add a parallel `BRANDING_BRAND_CARD_LOGO_KEY(brand)` using the same pattern — no schema migration needed (`site_settings` is a generic key/value table).
- `/curemed` brand cards currently use `getBrandLogo(...)` (the built-in static logo). They need to fall back to the saved card logo when present.

## Changes

### 1. `src/lib/db.ts`
- Add `BRANDING_BRAND_CARD_LOGO_KEY(brand)` and `useBrandingBrandCardLogo(brand)` mirroring the existing header-logo helpers.
- Add a small `useAllBrandCardLogos()` helper that returns `Record<BrandKey, string>` so the home page can read them in one render without N hooks (read each via `useSiteSetting` inside a `useQueries`-style aggregate, or simply expose individual hooks consumed by a small subcomponent).
- In `uploadBrandingImage`, on error inspect the message; when it indicates RLS / unauthorized, throw a friendlier message: "Upload denied — make sure you are signed in as an admin."

### 2. `src/pages/admin/AdminBranding.tsx`
- Restructure the per-brand list. For each brand render a single `Card` containing:
  - Brand name as the card title.
  - Two stacked `BrandingField` sub-sections (no longer a full Card each — convert `BrandingField` to render either as a Card or as a plain section; simplest: extract the inner body into a `BrandingFieldBody` component and reuse). Labels: "Header logo" and "Card logo".
- Pass the new `BRANDING_BRAND_CARD_LOGO_KEY(b.key)` + `useBrandingBrandCardLogo` for the second field, with `uploadPrefix={`brand-${b.key}-card`}`.
- Keep the global "Site logo", "Favicon", and "Remove white background" sections unchanged (Curemed parent has no card section).

### 3. `src/pages/CuremedHome.tsx`
- In the brand-cards marquee, replace the static `getBrandLogo(...)` call with a resolver that prefers the admin-saved card logo and falls back to the existing logo. To avoid one hook per brand inside a `.map`, render each tile via a small `BrandTile` subcomponent that calls `useBrandingBrandCardLogo(b.key)` itself.
- DO NOT change card width/height/padding/colors — only the `<img src>` source.

### 4. No DB migration required
- `site_settings` already supports arbitrary keys.
- Storage policies are already in place; no SQL changes.

## Acceptance

- `/admin/branding` shows, for each brand, one card with two upload+URL fields ("Header logo" and "Card logo").
- Uploading a card logo for e.g. Flexitol immediately changes the logo shown inside the Flexitol tile in the "Our brands" carousel on `/curemed`, while the header logo on `/flexitol` keeps using the header-logo setting.
- Curemed parent section on `/admin/branding` is unchanged (Site logo + Favicon only).
- Brand card sizes, colors, and layout on `/curemed` remain identical.
- If an upload fails due to RLS, the toast clearly says the user must be signed in as an admin.
