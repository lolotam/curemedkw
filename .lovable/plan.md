# Add carousel auto-scroll toggles to /admin/landing

Add a small settings card at the top of the **Landing Pages** admin (`/admin/landing` → `AdminLandingPages.tsx`) with two switches:

1. **Brands cards carousel auto-scroll** (home page brands marquee)
2. **Category cards carousel auto-scroll** (home page categories marquee)

When ON → marquee animates as today. When OFF → animation paused, user can still scroll horizontally manually.

## Storage

Use existing `site_settings` table via `useSiteSetting` / `useUpdateSiteSetting` hooks (already in `src/lib/db.ts`).

- Key: `home_carousel_autoscroll`
- Value: `{ brands: boolean; categories: boolean }`
- Defaults: both `true`.

## Files to change

**1. `src/pages/admin/AdminLandingPages.tsx`**
- Add a card above the grid with two `<Switch>` rows (label + description).
- Read/write via `useSiteSetting("home_carousel_autoscroll", { brands: true, categories: true })` + `useUpdateSiteSetting()`.
- Toast on save.

**2. `src/pages/CuremedHome.tsx`** (brands marquee at line ~47 and ~225)
- Read the same setting.
- Conditionally add `[animation-play-state:paused]` class to the `.marquee` divs when `brands === false`.

**3. `src/components/site/CategoryCarousel.tsx`**
- Read the same setting.
- Conditionally add `[animation-play-state:paused]` to the `.cat-marquee` div when `categories === false`.

This keeps the manual horizontal scroll/hover behavior intact and only halts the CSS keyframe animation. No DB migration needed (key/value row in existing `site_settings`).

## Out of scope
- `AutoCarousel.tsx` (used elsewhere, not on home brands/categories sections).
- Per-brand landing pages.
