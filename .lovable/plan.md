## Goal
Make the public site header (`src/components/site/SiteHeader.tsx`) auto-hide when the user scrolls down, and reappear when:
- the user scrolls up, or
- the mouse hovers near the top of the viewport (top ~80px), or
- the mobile menu is open, or
- the user is at/near the top of the page.

The admin sidebar (`AdminLayout`) is unaffected.

## Behavior
- Scrolling down past ~80px → header slides out of view (transform: -translate-y-full).
- Scrolling up any amount → header slides back in.
- Mouse moves into the top 80px of the viewport → header reveals (even mid-page).
- Mobile menu open (`open` state) → header stays visible.
- Smooth CSS transition (~300ms) on transform.
- Keep existing `sticky top-0 z-40` and backdrop styles.

## Implementation (single file: `src/components/site/SiteHeader.tsx`)
1. Add a `hidden` state (boolean) and a `lastScrollY` ref.
2. `useEffect` registers a `scroll` listener on `window`:
   - If `currentY < 80` → `hidden = false`.
   - Else if `currentY > lastScrollY` (scrolling down) → `hidden = true`.
   - Else (scrolling up) → `hidden = false`.
   - Update `lastScrollY`.
   - Use `passive: true`.
3. `useEffect` registers a `mousemove` listener on `window`: if `e.clientY < 80` → `hidden = false`.
4. Force `hidden = false` whenever the mobile menu `open` is true.
5. Apply classes to the `<header>`: add `transition-transform duration-300 will-change-transform` and conditionally `-translate-y-full` when `hidden`.

No new dependencies, no other files touched, no DB changes.