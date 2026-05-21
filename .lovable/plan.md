## Problem

In the product image zoom dialog (`src/components/site/ImageZoom.tsx`), pressing the `+` button or scrolling the wheel updates the percentage indicator (e.g. 100% → 150% → 200%) but the image itself does not visibly grow.

Root cause: the `<img>` has both `max-h-full max-w-full object-contain` **and** the CSS `transform: scale(...)`. The flex parent uses the image's natural layout box (capped by `max-h/max-w-full`) and centers it. Combined with `transition-transform` and `pointer-events-none` on the same element, scaling the `<img>` directly is unreliable across browsers — the image's intrinsic box stays the same and the visual transform appears suppressed or clipped.

The robust fix is the standard lightbox pattern: scale a **wrapper div** instead of the `<img>`, and let the image inside use its natural size.

## Changes (only `src/components/site/ImageZoom.tsx`)

1. Replace the inner `<img>` in the dialog with a transformed wrapper:
   ```tsx
   <div
     className="will-change-transform"
     style={{
       transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
       transformOrigin: "center center",
       transition: dragRef.current ? "none" : "transform 120ms ease-out",
     }}
   >
     <img
       src={src}
       alt={alt}
       className="block max-h-[90vh] max-w-[90vw] object-contain select-none"
       {...noSave}
     />
   </div>
   ```
   - The wrapper is what scales, so the visible image clearly grows.
   - `max-h-[90vh] max-w-[90vw]` sets the base size (100% state); scale multiplies from there.
   - Drop `pointer-events-none` and `transition-transform` from the `<img>` — handlers already live on the parent area, and the wrapper owns the transition.

2. Keep all existing logic intact: zoom in/out/reset buttons, wheel, keyboard (+ / - / 0), drag-to-pan, click-to-zoom, anti-save handlers, dialog open/close.

3. No changes to `ProductDetail.tsx`, no new files, no other components touched.

## Verification

- Open any product page → click main image → dialog opens at 100%.
- Click `+` → image visibly grows to 150%, 200%, … up to 500%.
- Mouse wheel up/down zooms; `0` resets; `-` zooms out and recenters at 100%.
- When zoomed, cursor becomes grab/grabbing and drag pans the image.
- Right-click / drag-save still blocked.