## Add Show/Hide toggle for the loading page progress bar

Add a `visible` flag to the loader-bar settings so admins can hide the gradient progress bar on the splash screen from `/admin/branding` without losing existing position/width/duration values.

### Changes

1. **`src/lib/db.ts`** — Extend `LoaderBarSettings` with `visible: boolean`. Add `visible: true` to `LOADER_BAR_DEFAULTS` so existing installs keep current behavior.

2. **`src/pages/Loading.tsx`** — Read `cfg.visible`; conditionally render the gradient progress bar block only when `visible !== false` (default-on for backward compatibility with already-saved settings missing the field).

3. **`src/pages/admin/AdminBranding.tsx`** — In `LoaderBarControl`, add a `Switch` row labeled "Show progress bar" at the top of the card. Toggling it updates state and commits via the existing `useUpdateSiteSetting` flow. When hidden, dim/disable the position/width/duration inputs to make it clear they have no effect.

### Notes
- Pure presentation change; no migration needed (stored in `site_settings` JSON).
- Backward compatible: missing `visible` is treated as `true`.