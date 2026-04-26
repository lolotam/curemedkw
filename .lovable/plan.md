## Goal
Transform the plain 4-card "What we do" pillars section on the Curemed home page into a vibrant, modern, animated showcase — without breaking i18n (EN/AR) or the brand theming system.

## Current state
- File: `src/pages/CuremedHome.tsx` (lines 59–72)
- Plain `Card` grid, single brand color icon tile, static, no motion.
- Uses `t("pillars.*")` keys (already translated EN/AR).

## Design direction
A colorful, glassy, animated showcase where each pillar gets its own accent color, gradient halo, floating icon, and reveal-on-scroll animation. Modern, playful but professional (medical/wellness appropriate).

### Visual concept per card
- Rounded-3xl card with **soft white/glass background** (`bg-card/70 backdrop-blur`) and a **colored gradient border glow** that intensifies on hover.
- **Top-right blurred color blob** (decorative gradient circle) using the pillar's accent color — adds depth and color.
- **Animated icon badge**: gradient-filled rounded-2xl tile with a subtle floating animation (gentle up/down loop) and a rotating ring on hover.
- **Number indicator** ("01", "02"…) faintly displayed in the corner for editorial feel.
- **Hover effects**: card lifts (`-translate-y-2`), gradient glow appears, icon scales + slight rotate, title color shifts to the accent color, an arrow CTA fades in.
- **Scroll reveal**: stagger fade-in-up using existing `animate-fade-in-up` keyframe (already in `index.css`) with per-card `animation-delay` inline style.

### Section background
- Replace flat `bg-muted/40` with a soft **layered gradient background** + subtle radial color spots (decorative blurred divs) to add color without overwhelming.
- Add a small **eyebrow label** above the title ("Our Expertise" / "خبراتنا") and a short subtitle for hierarchy.
- Title gets a gradient text treatment using brand colors.

### Per-pillar accent palette (HSL, added as semantic tokens)
- Pharma → blue/cyan (existing brand tones)
- Skincare → pink/rose
- Wellness → emerald/green
- Medical → violet/indigo

These will be applied per-card via inline CSS variables (no hard-coded Tailwind colors in JSX where avoidable; we'll use `style={{ "--accent": "..." }}` and a small set of utility classes) so the design system stays consistent.

## New animations to add (in `src/index.css`)
- `@keyframes float` — gentle 6px vertical bob, 4s ease-in-out infinite (for icon badges).
- `@keyframes glow-pulse` — opacity + scale on the blurred halo, 5s infinite.
- `@keyframes shimmer` — diagonal shine sweep across the card border on hover (optional, subtle).
- Utilities: `.animate-float`, `.animate-glow-pulse`, plus `.animation-delay-100/200/300/400` helper classes for stagger.

These are additive; no existing animations are touched.

## i18n additions (in `src/lib/i18n.tsx`)
- `pillars.eyebrow` → EN: "Our Expertise", AR: "خبراتنا"
- `pillars.subtitle` → EN: "Four pillars that define how we care for every Kuwaiti home.", AR: "أربع ركائز تحدد كيف نعتني بكل بيت كويتي."

(Existing `pillars.title` and per-pillar titles/bodies remain unchanged.)

## Implementation plan

1. **`src/index.css`** — append new keyframes and utility classes (float, glow-pulse, shimmer, animation-delay helpers) inside the existing `@layer utilities` block.

2. **`src/lib/i18n.tsx`** — add the two new translation keys (`pillars.eyebrow`, `pillars.subtitle`).

3. **`src/pages/CuremedHome.tsx`** — rewrite only the pillars `<section>` (lines 59–72). Keep the `Pill / Sparkles / HeartPulse / Stethoscope` icons and `t("pillars.*")` keys. Restructure JSX to:
   - Wrap section in a relative container with two absolutely-positioned blurred gradient blobs (decorative, `aria-hidden`).
   - Render eyebrow + gradient title + subtitle header block.
   - Map an extended pillar config array that also carries `accentFrom`, `accentTo`, and `index` for staggered animation delay.
   - Each card uses: rounded-3xl, gradient border via `before:` pseudo (Tailwind arbitrary), glass background, hover lift, animated icon tile, decorative blob, number, animated arrow CTA.
   - RTL safe: use `rtl:rotate-180` for arrows, logical spacing utilities, icon stays centered.

4. **No breaking changes**: still uses `Card`-style markup (we'll switch to a plain `div` to avoid the default `Card` border conflicting with the new gradient border, but visual hierarchy and accessibility remain intact).

## Files to change
- `src/index.css` (additions only)
- `src/lib/i18n.tsx` (2 new keys)
- `src/pages/CuremedHome.tsx` (pillars section JSX only)

## Out of scope
- Other sections of the home page (brands, spotlight, testimonials, etc.) remain untouched.
- No new dependencies; pure Tailwind + CSS keyframes.
- Other brand pages (Flexitol, Kapiva, Nada, ABC) are not modified — this is for the Curemed home only, as selected.

## Verification after build
- Inspect on desktop (1476px) and mobile to confirm grid wraps to 2 cols then 1 col, animations play smoothly, hover states feel snappy, RTL Arabic layout mirrors correctly, and dark mode still reads well.
