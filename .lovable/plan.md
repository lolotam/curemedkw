## Goal

Restructure `src/pages/Loading.tsx` into a full-screen video splash:

1. **Full-screen background video** plays automatically on every site visit using:
   `https://yjvqzvmyritxegugfhkt.supabase.co/storage/v1/object/public/hero-media//CureMed_logo_loading_animation_202604300936.mp4`
2. **Remove the Curemed logo image and the tagline text** entirely — only the video shows.
3. A single **stylish loading bar** is centered on the screen (middle), animating **left → right** in Curemed brand blue.
4. The loader shows on **every fresh visit** (remove the `sessionStorage` skip).

## Changes

### 1. `src/pages/Loading.tsx` (rewrite)

- Remove `curemedLogo` import, the logo `<img>`, the tagline `<p>`, and the `SEEN_KEY` sessionStorage gate.
- Keep `useEffect` timer → `navigate("/curemed", { replace: true })` after ~3500ms (give the video time to play).
- Structure:
  - Root: `fixed inset-0 overflow-hidden bg-black`
  - `<video>` absolutely positioned to fill the viewport:
    - `className="absolute inset-0 h-full w-full object-cover"`
    - Attributes: `autoPlay muted playsInline loop preload="auto"`
    - `src={VIDEO_URL}`
  - Centered overlay container: `absolute inset-0 flex items-center justify-center pointer-events-none`
    - Inside: the stylish progress bar
      - Track: `h-1.5 w-64 md:w-80 rounded-full bg-white/15 backdrop-blur-sm overflow-hidden shadow-lg`
      - Fill: `h-full rounded-full bg-gradient-to-r from-[hsl(var(--curemed-blue-soft))] via-[hsl(var(--curemed-blue))] to-[hsl(var(--curemed-teal))] animate-loader-progress shadow-[0_0_12px_hsl(var(--curemed-blue)/0.6)]`

### 2. `src/index.css`

Add the left-to-right fill keyframe + utility (only if not already present):

```css
@keyframes loader-progress {
  0%   { width: 0%; }
  100% { width: 100%; }
}
.animate-loader-progress {
  animation: loader-progress 3.2s ease-out forwards;
}
```

## Visual layout

```text
┌──────────────────────────────────┐
│                                  │
│        [ full-screen video ]     │
│                                  │
│       ─────████──────────        │  ← gradient progress bar (center)
│                                  │
│                                  │
└──────────────────────────────────┘
```

## Notes

- `muted` + `playsInline` + `autoPlay` are required so mobile browsers auto-play the video without user interaction.
- The bar uses a subtle white-tinted glass track so it stays readable on any frame of the video.
- No DB, RLS, or storage changes needed — the asset is already public in the `hero-media` bucket.
