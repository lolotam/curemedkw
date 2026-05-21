## Goal
Add a zoom-on-hover magnifier effect to the main product image on the product detail page.

## Approach
Create a small, self-contained `ImageZoom` component that:
- Renders the main product image at normal size in the existing square container.
- On hover (desktop / pointer:fine), tracks the cursor position and shows a circular magnifier lens following the cursor, displaying a 2.5x zoomed-in portion of the image.
- Falls back to the plain image on touch devices (no hover) — no behavior change for mobile.
- Shows a small magnifier icon (lucide `Search`) badge in the corner as an affordance.

Implementation:
- New file `src/components/site/ImageZoom.tsx`.
- Uses a `ref` on the container, `onMouseMove` to compute the cursor's relative %, and renders a lens div with `backgroundImage: url(src)`, `backgroundSize: 250%`, `backgroundPosition` set from the cursor %.
- Lens: ~180px circle, soft shadow, hidden until hover.
- Accessible: keeps the underlying `<img>` for SEO/alt; lens is decorative (`aria-hidden`).

### Edit
`src/pages/ProductDetail.tsx` line 102-104: replace the `<img>` inside the `aspect-square` wrapper with `<ImageZoom src={images[activeImg]} alt={name} />`. Thumbnails and everything else stay unchanged.

## Out of scope
- Lightbox / fullscreen viewer.
- Pinch-to-zoom on mobile.
- Thumbnail zoom.
