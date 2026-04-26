# Modern, branded card redesign for /admin/landing

## Goal
Restyle the brand cards on `/admin/landing` (`src/pages/admin/AdminLandingPages.tsx`) so each card looks modern, premium, and tied to its brand identity (logo + brand color accent).

## Current state
- Plain rectangular cards in a 2-column grid.
- Generic `ImageIcon` placeholder for every brand — no brand identity.
- Only label + route shown.

## Proposed design

### Layout
- Grid becomes `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` so cards breathe on wide admin viewports.
- Page header refreshed with a small subtitle chip and a total-count indicator.

### Card styling (per brand)
Each card becomes a premium "brand tile":
- **Container**: `rounded-2xl`, `overflow-hidden`, soft shadow that lifts on hover (`hover:-translate-y-1 hover:shadow-2xl`), 300ms transitions, brand-colored ring on hover via `group-hover:ring-2 group-hover:ring-[hsl(var(--brand))]`.
- **Top media band (h-28)**:
  - Gradient background driven per-brand by setting `data-brand={meta.themeAttr}` so it picks up the existing `--brand` / `--brand-soft` CSS variables (no hard-coded colors).
  - Subtle radial highlight + faint dotted pattern overlay for depth.
  - Brand **logo** from `BRANDS[key].logo` floated bottom-left in a glassy white badge (`bg-white/90 backdrop-blur rounded-xl p-2 shadow-md ring-1 ring-black/5`).
- **Body**:
  - Brand `name` in bold + small uppercase route chip (e.g. `/flexitol`) in muted tone.
  - One-line tagline from `BRANDS[key].tagline.en` for context.
  - Bottom row: a small "Manage slides" pill + animated `ArrowRight` that translates on hover.

### Curemed (main) special case
- `BRANDS` has no `curemed` entry — render a distinct "Main site" tile using global theme tokens and a stylized "C" monogram instead of a logo, with a "Main" chip in the corner.

### Polish
- Focus-visible ring on the `Link` for keyboard accessibility.
- Staggered entrance animation using existing `animate-fade-in` with `style={{ animationDelay: `${i * 60}ms` }}`.
- Dark-mode safe: only CSS variables, no hex values.

## Files to edit
- `src/pages/admin/AdminLandingPages.tsx` — rewrite card markup; import `BRANDS` from `@/lib/brands` and map each `HERO_PAGES` entry to its brand metadata for logo + themeAttr.

## Out of scope
- No DB / schema changes.
- No changes to `HERO_PAGES`, routes, or the landing editor page itself.
- No new dependencies.