# Add Overlay Opacity Control per Hero Slide

Each landing-page hero slide currently has a fixed dark gradient layer rendered on top of the image/video (in `HeroSlider.tsx`). I'll let admins control that layer's opacity per slide — including setting it to 0 so the photo shows in full color.

## 1. Database — add `overlay_opacity` column

Migration on `public.hero_slides`:
- Add `overlay_opacity smallint not null default 80` (0–100, where 0 = no overlay, 100 = fully dim)
- Add a CHECK constraint `overlay_opacity between 0 and 100`

Default `80` matches the current visual (the existing `from-background/80` start).

## 2. Types & data layer (`src/lib/heroSlides.ts`)

- Add `overlay_opacity: number` to the `HeroSlide` interface.
- `HeroSlideInput` automatically inherits it.
- No changes to `listSlidesForPage` / `createSlide` / `updateSlide` (they already pass through all columns).
- `createSlide` callers in the editor will include `overlay_opacity: 80` for new slides.

## 3. Live hero (`src/components/site/HeroSlider.tsx`)

Replace the fixed `bg-gradient-to-r from-background/80 via-background/40 to-background/10` element with a dynamic gradient driven by `overlay_opacity`:

```tsx
const op = (s.overlay_opacity ?? 80) / 100;
// only render overlay if op > 0
{op > 0 && (
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      background: `linear-gradient(to right,
        hsl(var(--background) / ${op}),
        hsl(var(--background) / ${op * 0.5}),
        hsl(var(--background) / ${op * 0.125}))`,
    }}
  />
)}
```

When opacity is `0`, the overlay isn't rendered at all → image shows in full color. Text legibility is the admin's call (they can leave a small overlay if needed).

## 4. Editor UI (`src/pages/admin/AdminLandingPageEditor.tsx`)

Inside each slide card, in the Media column under the upload button, add an **Overlay** control block:

- **Label**: "Overlay opacity" with a numeric badge showing current % (e.g. `80%`)
- **`Slider`** (shadcn `@/components/ui/slider`) — `min=0`, `max=100`, `step=5`, value bound to `overlay_opacity`
- **"Remove overlay"** ghost button (sets to 0) and a **"Reset"** button (back to 80) for one-click actions
- A small **live preview strip**: a thin bar overlaying a snippet of the slide thumbnail showing the chosen darkness, so admins see the effect without saving
- Changes go through `patchLocal` → flagged `_dirty` → persisted via the existing **Save changes** button (consistent with other text fields)

## 5. UX details

- New slides created via "Add slide" get `overlay_opacity: 80`.
- Existing slides without the column (pre-migration) fall back to `80` via `?? 80` in both editor and renderer, so nothing breaks during rollout.
- RTL: gradient direction is unchanged (matches existing behavior; the original code uses identical from/via/to in both LTR & RTL).

## Files to edit
- New migration: add `overlay_opacity` column + check constraint on `public.hero_slides`
- `src/lib/heroSlides.ts` — add field to `HeroSlide` type
- `src/components/site/HeroSlider.tsx` — dynamic overlay rendering
- `src/pages/admin/AdminLandingPageEditor.tsx` — slider + remove/reset controls, include in `createSlide`
