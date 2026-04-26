## Goal
Replace the static testimonials grid with an **infinite, slowly auto-scrolling marquee** that drifts continuously to the left (no buttons, no snap, no pagination). RTL pages will mirror the direction so it still feels natural in Arabic.

## Why a marquee (not the existing AutoCarousel)
The current `AutoCarousel` uses `scrollBy` on an interval — it pauses between jumps and stops at the end. A true marquee requires duplicating the track and using a CSS keyframe `translateX(-50%)` animation for buttery, continuous motion.

## Changes

### 1. `src/components/site/Testimonials.tsx` — rewrite layout

- Remove the `grid gap-5 md:grid-cols-2 lg:grid-cols-3` block.
- Wrap the testimonial list in a marquee container:
  - Outer: `relative overflow-hidden` with edge fade masks (`mask-image: linear-gradient(...)`) so cards fade in/out at both edges.
  - Inner track: `flex gap-5 w-max animate-marquee-left hover:[animation-play-state:paused]`.
  - Render the items **twice** (`[...items, ...items]`) so the `-50%` translation loops seamlessly.
- Each card stays a fixed width (`w-[320px] md:w-[360px] shrink-0`) so the track has a stable measurable length.
- Keep the existing card visual (Quote icon, initial avatar, name, role, location) untouched — only the wrapper changes.
- Direction handling:
  - Default (LTR + Arabic both): animation moves the track left → `translateX(0)` to `translateX(-50%)`.
  - This gives the visual impression of cards flowing **leftwards** for everyone, matching the request.

### 2. `tailwind.config.ts` — add the `marquee-left` keyframe

Add to `theme.extend.keyframes`:
```ts
"marquee-left": {
  "0%":   { transform: "translateX(0)" },
  "100%": { transform: "translateX(-50%)" },
},
```

Add to `theme.extend.animation`:
```ts
"marquee-left": "marquee-left 60s linear infinite",
```

A 60s duration on a duplicated track gives a slow, calm drift. Hovering pauses it via `hover:[animation-play-state:paused]`.

### 3. No other files touched
- `AutoCarousel.tsx` stays as-is (still used by `CuremedHome` spotlight).
- `useTestimonials` hook and DB schema unchanged.
- i18n keys unchanged.

## Result
- Testimonials section becomes a single horizontal lane of cards drifting slowly leftwards forever.
- Pauses on hover so users can read.
- Soft fade masks on both edges instead of hard cutoffs.
- Works identically on `/`, `/curemed`, and brand pages where Testimonials is rendered.