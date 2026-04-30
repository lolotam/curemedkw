## Goal

Add an admin control panel for the **loading-page gradient progress bar** so the admin can:

1. Change the bar's **animation duration** (seconds) — like the `intervalMs` control for hero slides.
2. Change the bar's **position** on the loading page — using percent-based **X / Y sliders** (0–100), the same logic used by `text_position_x` / `text_position_y` on hero slides.

Settings persist in `site_settings` (one JSON row, key `loader_bar`) so changes apply instantly with no migrations needed.

## Changes

### 1. `src/lib/db.ts` — add settings hook

Append a new typed setting:

```ts
export interface LoaderBarSettings {
  durationMs: number;   // total time bar takes to fill (default 3200)
  positionX: number;    // 0–100 % of viewport width  (default 50)
  positionY: number;    // 0–100 % of viewport height (default 50)
  widthPx: number;      // bar width in px            (default 256)
}
export const LOADER_BAR_KEY = "loader_bar";
export const LOADER_BAR_DEFAULTS: LoaderBarSettings = {
  durationMs: 3200, positionX: 50, positionY: 50, widthPx: 256,
};
export function useLoaderBarSettings() {
  return useSiteSetting<LoaderBarSettings>(LOADER_BAR_KEY, LOADER_BAR_DEFAULTS);
}
```

### 2. `src/pages/Loading.tsx` — consume the settings

- Remove the hard-coded `animate-loader-progress` utility class and `w-64 md:w-80`.
- Read `useLoaderBarSettings()`. While loading, fall back to defaults.
- Keep the navigate timer aligned with the bar duration: `setTimeout(... , durationMs + 300)`.
- Replace the centered flex container with an absolutely positioned wrapper anchored at `(positionX%, positionY%)` and translated by `-50%` so the bar's center sits exactly on that point:

```tsx
<div
  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
  style={{ left: `${positionX}%`, top: `${positionY}%`, width: widthPx }}
>
  <div className="h-1.5 w-full rounded-full bg-white/15 backdrop-blur-sm overflow-hidden shadow-lg">
    <div
      className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--curemed-blue-soft))] via-[hsl(var(--curemed-blue))] to-[hsl(var(--curemed-teal))] shadow-[0_0_12px_hsl(var(--curemed-blue)/0.6)]"
      style={{ animation: `loader-progress ${durationMs}ms ease-out forwards` }}
    />
  </div>
</div>
```

(The `loader-progress` keyframe already exists in `src/index.css`; we just drive it with an inline `animation` string so duration is dynamic.)

### 3. `src/pages/admin/AdminBranding.tsx` — new "Loading page bar" card

Add a new `<LoaderBarControl />` card (rendered just below `<FeaturedGlassOpacityControl />`) modeled exactly on `FeaturedGlassOpacityControl`, using shadcn `Slider` + `Button`:

Card sections:
- **Animation duration** slider — range `1000–8000` ms, step `100`, displays `X.Xs`.
- **Horizontal position (X)** slider — range `0–100`, step `1`, displays `X%`.
- **Vertical position (Y)** slider — range `0–100`, step `1`, displays `Y%`.
- **Bar width** slider — range `120–600` px, step `10`, displays `Npx`.
- A small **live preview box** (16:9, dark background) showing a miniature dot at the chosen X/Y so the admin can see where the bar will sit before saving.
- **Reset to defaults** button.

Save behavior matches existing pattern: update on `onValueCommit` via `useUpdateSiteSetting().mutate({ key: LOADER_BAR_KEY, value: nextSettings })`, with a `toast.success("Loader bar updated")`.

## No DB / RLS changes

The `site_settings` table already exists with admin-only write RLS and public read RLS — exactly what we need. No migration required.

## Visual layout (admin card)

```text
┌─ Loading page — gradient progress bar ──────────────┐
│ Animation duration       3.2 s    [────●────────]   │
│ Horizontal position (X)   50 %    [────●────────]   │
│ Vertical position (Y)     50 %    [────●────────]   │
│ Bar width               256 px    [──●──────────]   │
│                                                     │
│ ┌─ Preview ──────────────────────────────┐          │
│ │                                        │          │
│ │                  ●                     │  ← dot   │
│ │                                        │          │
│ └────────────────────────────────────────┘          │
│                                  [Reset to defaults]│
└─────────────────────────────────────────────────────┘
```
