## Goals

1. **Featured-products marquee on `/curemed`** — Replace the current small auto-carousel with a full-width **infinite marquee** styled exactly like the existing brands marquee (same card width ~288–320px, same brand-soft top panel with image, same hover lift, same edge fade mask, same pause-on-hover). Products are picked via the existing **"Featured"** toggle in the product editor — no schema change needed (`products.featured` already exists).

2. **Per-brand logos in `/admin/branding`** — Today only the global Curemed logo is configurable. Add a dedicated logo URL input for **each brand page** (Flexitol, Kapiva, ABC, NADA, Lafe's, Hartington, Phytophar). When a user is on `/flexitol`, `/australian-bodycare`, etc., the header logo automatically swaps to that brand's configured logo. The Curemed logo is used on `/curemed`, `/about`, `/contact`, `/admin/*`, etc. (anywhere not under a brand slug).

---

## Section 1 — Featured products marquee (CuremedHome)

### What changes
- Remove the existing small `AutoCarousel` block (the `t("spotlight.title")` section at the bottom of `src/pages/CuremedHome.tsx`).
- Add a new section that mirrors the **brands marquee** structure (same wrapper, same edge mask, same `marquee` animation, same `group-hover:[animation-play-state:paused]`, same card width `w-72 md:w-80`, same `mr-5`, same hover `-translate-y-1 hover:shadow-xl`).
- Each card layout (matches brand card visually):
  - Top panel: `bg-brand-soft` (brand-tinted) containing `product.mainImage` in an `aspect-square`/fixed-height container, `object-contain` on white inner tile so transparent product PNGs look clean (same trick used for brand logos that have `l.isImage`).
  - Bottom panel: product **name** (localized), short description (1–2 lines clamp), price (respecting existing `usePriceVisibility` hidden-price logic), discount badge if `originalPrice > price`, and a "Discover" arrow row.
- The whole card is a `<Link>` to `/${brand.slug}/product/${product.id}` and carries `data-brand={brand.themeAttr}` so the brand color theme tints `bg-brand-soft` per product.
- Data source: existing `useFeaturedProducts()` hook — no DB change. Marketing flow stays: admins tick **"Featured"** in `/admin/products/:id` editor; product appears here automatically.
- Duplicate the items once (`[...items, ...items]`) to enable seamless infinite marquee, exactly like brands.
- Section heading reuses `t("spotlight.title")`; subtitle reuses an existing string or adds one new key (e.g. `spotlight.subtitle`).

### Empty state
- If `featured.length === 0`, the section is hidden (current behavior).

---

## Section 2 — Per-brand logos in Admin Branding

### Data model (no migration)
Reuse the existing `site_settings` (key/value JSONB) table. Add 7 new keys, one per brand:
- `branding_brand_logo_flexitol`
- `branding_brand_logo_kapiva`
- `branding_brand_logo_abc`
- `branding_brand_logo_nada`
- `branding_brand_logo_lafes`
- `branding_brand_logo_hartington`
- `branding_brand_logo_phytophar`

Each holds a single string URL (same shape as `branding_logo_url`). Empty/missing string → fall back to the default Curemed logo. RLS already allows admins to write and the public to read `site_settings`.

### `src/lib/db.ts`
- Add `BRANDING_BRAND_LOGO_KEY(brandKey: BrandKey)` helper that returns `branding_brand_logo_${brandKey}`.
- Add `useBrandingBrandLogo(brandKey: BrandKey)` hook (thin wrapper around the existing `useSiteSetting<string>`) returning the saved URL or empty string.

### `src/pages/admin/AdminBranding.tsx`
- Below the existing global logo card, add a new **"Per-brand page logos"** section.
- One `BrandingField` card per brand (loop over `BRAND_LIST`), each with:
  - Title: brand name (e.g. "Flexitol logo").
  - Description: "Shown in the header when visitors are on `/flexitol`."
  - URL input + same checkerboard transparency preview + JPEG warning + Save / Reset buttons (reuse the existing `BrandingField` component, parameterized by `settingKey` + `useValue`).
- The existing global logo + favicon + remove-white-bg toggle remain unchanged at the top.

### `src/components/site/SiteHeader.tsx` (logo selection logic)
- Determine the active brand from the URL using existing `slugToBrand()`:
  - Strip leading `/`, take the first path segment (e.g. `australian-bodycare` from `/australian-bodycare/product/123`).
  - If `slugToBrand(segment)` returns a `BrandKey`, fetch that brand's logo via `useBrandingBrandLogo(brandKey)`.
- Logo resolution order:
  1. Brand-specific configured URL (if on a brand route and value is non-empty)
  2. Global configured Curemed logo (`useBrandingLogo`)
  3. Bundled `defaultLogo` asset
- The header `<Link to="/curemed">` and the `removeBg` blend-mode toggle continue to work as today.

### Optional follow-on (not in this change)
- `SiteFooter` and `AdminLayout` keep using the global Curemed logo (per the user's request: per-brand swap is for the **header on brand pages**).

---

## Files to modify

- `src/lib/db.ts` — add per-brand logo key helper + hook (~15 lines).
- `src/pages/admin/AdminBranding.tsx` — render 7 brand-logo cards in a new section.
- `src/components/site/SiteHeader.tsx` — choose brand-specific logo based on current route.
- `src/pages/CuremedHome.tsx` — replace the small featured `AutoCarousel` with a full-width marquee styled like the brands marquee.
- `src/lib/i18n.tsx` — (optional) add a short subtitle string for the new featured-products section.

## Files NOT changed

- Database schema (no migration — reuses `site_settings`).
- `products` table (the existing `featured` boolean is the marker).
- `src/components/site/ProductCard.tsx` (kept as-is; the new marquee renders its own brand-style card so it can match the brands cards exactly).
- `src/components/site/SiteFooter.tsx`, `AdminLayout.tsx`, `AdminLogin.tsx` (continue using the global logo).

## Acceptance checks

- Toggling **Featured** on a product in `/admin/products/:id` makes it appear/disappear in the new marquee on `/curemed` after a refresh.
- Marquee auto-scrolls infinitely, pauses on hover, fades at the edges, cards match the brand-card width and lift effect.
- In `/admin/branding`, pasting a Flexitol logo URL and saving makes that logo show in the header when visiting `/flexitol` and any sub-route like `/flexitol/product/123`. Visiting `/curemed` still shows the global Curemed logo.
- Resetting a brand logo (empty value) reverts the header on that brand page to the global Curemed logo.
