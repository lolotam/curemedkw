## Plan

### 1. Header — remove About & Contact links
**File:** `src/components/site/SiteHeader.tsx`
- Delete the two `<NavItem>` entries for `/about` and `/contact` in the desktop `<nav>` block.
- Delete the matching `<MobileItem>` entries in the mobile drawer.
- Keep them in the footer (already present in `SiteFooter.tsx` under the brand quick‑links column).

### 2. Restyle About Us page — modern, animated, branded
**File:** `src/pages/AboutUs.tsx` (full visual refresh, content & translation keys preserved)

#### Color palette (derived from the Curemed 3D logo: cyan/sky → blue → violet/pink)
- Hero: animated gradient (sky-400 → blue-500 → violet-500 → pink-400) with floating blurred orbs.
- Section accents: each card uses a unique gradient pair from the palette (sky, cyan, violet, pink, emerald-teal for "care").
- Subtle grid / dot background overlays for depth.

#### Animated sections (using existing Tailwind keyframes: `fade-in`, `scale-in`, `slide-in-right`, `hover-scale`)
- Hero: `animate-fade-in` for headline, staggered delay on subtitle (`[animation-delay:150ms]`).
- Story section: `animate-fade-in` triggered with a small `IntersectionObserver` hook (inline, lightweight) so it plays on scroll-into-view. Add a `useInView` helper at the top of the file (no new dependency).
- Mission/Vision cards: `animate-scale-in` with reveal-on-scroll; add hover lift (`hover:-translate-y-2 hover:shadow-2xl`) and an animated gradient ring (`bg-gradient-to-r ... p-[1px]` wrapper).
- Pillars & Values cards: stagger reveal (delays 0/100/200/300ms), `hover-scale`, glow on hover via `after:` pseudo gradient blur.
- "Why choose" grid: tick items slide in from the side (`animate-slide-in-right`), with gradient check badges.
- Map section: framed card with gradient border + soft shadow, hover scale on the iframe wrapper.

#### "3D coloured icons" replacement
Lucide is monochrome, so we will create a small inline `<Icon3D>` component inside `AboutUs.tsx` that renders each Lucide icon inside a **3D-style badge**:
- Rounded-2xl/3xl badge with multi-stop conic/linear gradient background (per pillar/value).
- Inner highlight (`::before` via absolute span) for glossy top sheen.
- Inset & drop shadow combo (`shadow-[0_10px_30px_-5px_rgba(...)] ring-1 ring-white/20 inset-shadow`) for depth.
- White Lucide icon on top (`text-white drop-shadow`), slight rotate on hover (`group-hover:rotate-6 transition-transform`).
- Per-item color mapping:
  - Quality / Integrity → sky→blue gradient
  - Partnership → violet→fuchsia
  - Accessibility → emerald→teal
  - Excellence → amber→orange
  - Care / Mission → rose→pink
  - Innovation / Vision → indigo→violet
  - Why-choose checks → cyan→sky

No new packages — pure Tailwind + inline SVG gradients give the "3D colored" look while staying consistent with the rest of the codebase.

#### Layout polish
- Wider hero with animated gradient text on the title (`bg-clip-text text-transparent bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500`).
- Section dividers: thin gradient line (`h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent`).
- Card corners bumped to `rounded-3xl`, borders softened (`border-border/60`), backgrounds use `bg-card/70 backdrop-blur` for a glassy feel.
- Respect dark mode (all gradients use `/10`–`/20` opacity tints so they read well on both themes).
- RTL-safe (no hard left/right utilities where direction matters).

### 3. Out of scope (no changes)
- Translations (`src/lib/i18n.tsx`) — all existing About keys stay the same.
- ContactUs page, footer, routing.
- Brand metadata.

### Files to edit
- `src/components/site/SiteHeader.tsx`
- `src/pages/AboutUs.tsx`
