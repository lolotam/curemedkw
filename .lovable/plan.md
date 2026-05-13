## Move two admin sections to `/admin/flags`

Relocate both the **Home page carousels — auto-scroll** card (currently in `/admin/landing/all`) and the **Image compression (WebP)** card (currently in `/admin/branding`) into the Site Flags page (`/admin/flags`). No behavior or settings-key changes.

### 1. `src/pages/admin/AdminFlags.tsx`
- Add a new "Home page carousels — auto-scroll" card with two Switch rows (Brands / Categories), wired to `home_carousel_autoscroll` via `useSiteSetting` + `useUpdateSiteSetting`. Reuse existing exports `HOME_CAROUSEL_AUTOSCROLL_KEY`, `HomeCarouselAutoscroll`, `DEFAULT_HOME_CAROUSEL_AUTOSCROLL` from `AdminLandingPages.tsx`.
- Add a new "Image compression (WebP)" card with the enable/disable Switch and 1–100 quality Slider (default 99), reusing the existing `ImageCompressionControl` block from `AdminBranding.tsx`. Move the component into `AdminFlags.tsx` (or extract to `src/components/admin/ImageCompressionCard.tsx` and import from both — recommended to avoid duplication).
- Place both new cards above the existing "Hide all prices (global)" card. Page now reads: Carousels auto-scroll → Image compression → Global price hide → Per-brand price visibility.

### 2. `src/pages/admin/AdminLandingPages.tsx`
- Remove the auto-scroll card JSX and its handler (`update`, `setKey`, the `useSiteSetting`/`useUpdateSiteSetting` calls).
- Keep `HOME_CAROUSEL_AUTOSCROLL_KEY` / `HomeCarouselAutoscroll` / `DEFAULT_HOME_CAROUSEL_AUTOSCROLL` exports so `CuremedHome.tsx`, `CategoryCarousel.tsx`, and the new Flags page keep importing from the same path. (Optional follow-up: relocate constants to `src/lib/db.ts`.)
- Drop now-unused imports (`Switch`, `Label`, `MoveHorizontal`, `useSiteSetting`, `useUpdateSiteSetting`, `toast`).

### 3. `src/pages/admin/AdminBranding.tsx`
- Remove the `ImageCompressionControl` card and its mount point.
- Drop now-unused imports (`useImageCompressionEnabled`, `useImageCompressionQuality`, related slider/switch helpers if only used here).
- No change to `BrandingHead.tsx` or `imageConvert.ts` — settings sync stays as-is.

### Result
`/admin/flags` becomes the single hub for site-wide toggles. `/admin/landing/all` keeps only the unified-editor tip + brand cards grid. `/admin/branding` keeps logo / favicon / loader / colors only.