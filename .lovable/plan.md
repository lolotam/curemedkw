Add an admin toggle to show/hide the initial loading/splash page.

### Changes

1. **src/lib/db.ts**
   - Add `LOADER_PAGE_ENABLED_KEY = "loader_page_enabled"`
   - Add `useLoaderPageEnabled()` hook returning `boolean` (default `true`)

2. **src/App.tsx**
   - Import `useLoaderPageEnabled`
   - Wrap the root route so when the setting is `false`, `/` immediately redirects to `/curemed` instead of rendering `<Loading />`

3. **src/pages/admin/AdminFlags.tsx**
   - Add a new `LoadingPageCard` component using a Switch toggle
   - Uses `useLoaderPageEnabled` + `useUpdateSiteSetting`
   - Inserted below the existing `HomeCarouselAutoscrollCard`
   - Icon: `Loader2` (or `PlayCircle`)
   - Description: "When off, visitors skip the intro loading page and go straight to the Curemed home page."

### No DB migration needed
Uses the existing `site_settings` table (key-value JSON store) already wired up for similar toggles.