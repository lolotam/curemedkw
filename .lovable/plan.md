## Plan

Fix the two home page carousels (Brands + Categories) so the admin auto-scroll toggle works correctly, and add full manual scrolling that coexists with auto-scroll.

### 1. Make auto-scroll OFF actually stop

When the admin turns the toggle OFF in `/admin/landing`, fully remove the marquee animation class instead of trying to pause it with a CSS override. The carousel becomes a static, freely scrollable strip.

### 2. Make auto-scroll ON support manual interaction (touch + mouse + wheel)

When the toggle is ON, the carousel keeps auto-scrolling, but:
- On desktop: pause on hover (already works), and pause while the user drags or uses the horizontal scroll wheel.
- On mobile/tablet: pause as soon as the user touches the carousel; resume a couple of seconds after they lift their finger.
- The user can freely swipe/scroll horizontally at any time. When they let go, the animation resumes from where the visible position is (no jump).

### 3. Apply to both carousels

- Brands carousel (in `src/pages/CuremedHome.tsx`)
- Category carousel (in `src/components/site/CategoryCarousel.tsx`)

Both will share the same behavior so the two admin toggles map 1:1 to what the user sees.

### 4. Verification

- Confirm in DB that `home_carousel_autoscroll` is read correctly.
- Verify in the live preview:
  - Toggle OFF → no animation, manual swipe/scroll works.
  - Toggle ON → auto-scrolls; pauses on hover / touch / drag; resumes after release.

## Technical details

- New small component `AutoScrollMarquee` (or inline hook) that:
  - Renders the duplicated children inside a horizontally scrollable container (`overflow-x-auto`, `scroll-smooth`, hidden scrollbar).
  - Drives auto-scroll via `requestAnimationFrame`, advancing `scrollLeft` by a px-per-second rate. When `scrollLeft` reaches half the content width (the duplicate boundary), it wraps back to 0 — visually seamless.
  - Pauses when:
    - `autoScroll` prop is false
    - pointer is hovering (`pointerenter` / `pointerleave`)
    - user is touching (`touchstart` → pause; `touchend` → resume after ~1.5s)
    - user is actively scrolling/dragging (`scroll` event with debounce, `pointerdown`/`pointerup`)
  - Direction respects RTL (`dir="rtl"` → scroll right-to-left).
- Replace the current CSS `.marquee` / `.cat-marquee` animation usage in both components with this JS-driven scroller.
- Keep the existing edge mask gradient and tile sizes unchanged.
- No DB or admin UI changes — the existing `home_carousel_autoscroll` setting and toggles are reused as-is.

Files to update:
- `src/pages/CuremedHome.tsx` (brands strip)
- `src/components/site/CategoryCarousel.tsx` (categories strip)
- `src/components/site/AutoScrollMarquee.tsx` (new shared component)