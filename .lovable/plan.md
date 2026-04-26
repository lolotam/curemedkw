# Fix: `/admin/landing/all` (Browse all) shows nothing

## Root cause

The route is loading correctly — the page is **rendered but invisible**.

In `src/pages/admin/AdminLandingPages.tsx`, every brand card uses:

```tsx
className="... animate-fade-in opacity-0 [animation-fill-mode:forwards]"
```

But there is **no `animate-fade-in` utility** defined anywhere in the project:
- `tailwind.config.ts` only defines `accordion-down` / `accordion-up` animations
- `src/index.css` defines `fade-in-up` (not `fade-in`)
- `tailwindcss-animate` plugin uses a different API (`animate-in fade-in`, not `animate-fade-in`)

Result: cards are stuck at `opacity-0` forever → the entire grid is invisible → page looks blank.
The console warning about `BrandLandingCard` refs is unrelated (just a `<Link>` with custom props).

## Fix

### 1. `tailwind.config.ts` — register a real `fade-in` animation

Add to `theme.extend.keyframes` and `theme.extend.animation`:

```ts
keyframes: {
  // ...existing accordion keyframes
  "fade-in": {
    from: { opacity: "0", transform: "translateY(8px)" },
    to:   { opacity: "1", transform: "translateY(0)" },
  },
},
animation: {
  // ...existing
  "fade-in": "fade-in 0.4s ease-out both",
},
```

Using `both` as the fill mode means `opacity-0` and the fill-mode utility on the card become unnecessary, but we'll leave the existing class list intact for safety — once the keyframe ends at `opacity:1` with `both`, cards will be visible.

### 2. `src/pages/admin/AdminLandingPages.tsx` — defensive cleanup

Remove the now-redundant `opacity-0 [animation-fill-mode:forwards]` from `BrandLandingCard`'s class list, keeping only `animate-fade-in`. This avoids any future regression if Tailwind's JIT misses the arbitrary class.

### 3. (Optional polish) Verify other usages

Quick `rg "animate-fade-in"` to confirm no other components rely on the broken class. If found, they'll all start working once the keyframe is registered.

## Files to change
- `tailwind.config.ts` — add `fade-in` keyframe + animation entry
- `src/pages/admin/AdminLandingPages.tsx` — drop redundant `opacity-0` / fill-mode classes

## Expected result
Clicking **Browse all** in `/admin/landing` will display the full grid of brand landing-page cards with a smooth fade-in entrance, instead of a blank page.
