## Goal
Replace the hover-magnifier on the product image with a click-to-open lightbox dialog that has zoom controls and prevents users from saving/stealing the image.

## Behavior
- Click the main product image → opens a centered fullscreen dialog with the image.
- Dialog controls (top toolbar): Zoom In (+), Zoom Out (−), Reset (1:1), Close (×).
- Drag to pan when zoomed in. Mouse wheel zooms. Pinch-zoom on touch.
- Close via × button, ESC, or click on the dark backdrop.
- Anti-steal protection (best-effort — nothing is bulletproof in a browser):
  - Disable right-click context menu inside the dialog (`onContextMenu={e => e.preventDefault()}`).
  - Disable native drag (`draggable={false}`, `onDragStart` prevented).
  - Disable text/image selection (`select-none`, `user-select: none`, `-webkit-user-drag: none`).
  - Render the image inside a wrapper that intercepts pointer events to block "Save image as" hotkeys where possible.
  - Add a subtle diagonal watermark overlay using site branding so any screen-grab is marked.
  - Apply the same protections to the inline product image and thumbnails.

## Files

### Replace `src/components/site/ImageZoom.tsx`
Rewrite the component:
- Plain `<img>` with cursor-zoom-in, anti-steal handlers, and a small search-icon badge as affordance.
- Click → opens an internal `<Dialog>` (shadcn) sized `max-w-[95vw] max-h-[95vh] p-0`.
- Dialog contains:
  - Top toolbar with Zoom In / Out / Reset / Close buttons (lucide `ZoomIn`, `ZoomOut`, `RotateCcw`, `X`).
  - Scrollable/draggable image area using CSS `transform: scale()` with state `scale` (1 → 5, step 0.5) and `translate` (dragged with pointer events).
  - Watermark overlay (`Curemed` text, low opacity, `pointer-events-none`, repeated diagonally).
  - All anti-steal handlers applied.
- Keyboard: `+` / `-` to zoom, `0` to reset, `Esc` closes (Dialog handles ESC by default).

### No change needed elsewhere
`ProductDetail.tsx` already uses `<ImageZoom src alt />` — same API.

## Out of scope
- Multi-image carousel inside the dialog (uses only the active image; thumbnails on the page still switch the active image).
- Server-side watermarking / signed image URLs (true anti-steal requires backend work).
