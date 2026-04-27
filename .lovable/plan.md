# Fix Hero Section Height to Fully Fit the Slide

## Problem

The hero section currently uses a fixed `aspect-[16/9]` with a `max-h-[85vh]` cap in `src/components/site/HeroSlider.tsx`:

```tsx
className="relative w-full aspect-[16/9] max-h-[85vh] overflow-hidden bg-brand-deep"
```

This causes two problems:
1. **`max-h-[85vh]` cap** — on shorter viewports the section is squeezed, so the slide loses height and the bottom of the image (or text) gets cropped or the section looks "too short".
2. **Fixed 16:9 aspect** — if the uploaded image is taller (e.g. 4:3, 3:2, 1:1) the image is cropped vertically by `object-cover` to fit a 16:9 box, so the slide does not appear "fully filled by the image" — it appears cropped.

## Goal

Hero section should grow to fully fit the uploaded slide so the entire image is visible (no cropping, no forced letterbox cap).

## Approach

Two changes, both inside `src/components/site/HeroSlider.tsx` (and the matching loading skeleton):

### 1. Remove the `max-h-[85vh]` cap

Change the section + skeleton from:
```tsx
"relative w-full aspect-[16/9] max-h-[85vh] overflow-hidden bg-brand-deep"
```
to:
```tsx
"relative w-full aspect-[16/9] overflow-hidden bg-brand-deep"
```

This lets the section take its natural 16:9 height based on container width, instead of being squeezed on shorter screens.

### 2. Auto-fit the section's aspect ratio to the **tallest** slide image

Measure each slide's natural width/height after load, pick the **maximum height-to-width ratio** across all slides, and apply it as an inline `aspectRatio` style on the section. This way:

- If all slides are 16:9 → section stays 16:9.
- If a slide is 4:3 or 1:1 → section grows taller so the full image is shown without being cropped.
- Images keep `object-cover` (so they always fully fill horizontally), but because the box now matches the tallest aspect, no vertical cropping happens on that slide.

Implementation sketch inside `HeroSlider`:

```tsx
const [aspect, setAspect] = React.useState<number>(16 / 9); // width / height

React.useEffect(() => {
  if (!slides || slides.length === 0) return;
  let cancelled = false;
  Promise.all(
    slides
      .filter((s) => s.media_type === "image" && s.media_url)
      .map(
        (s) =>
          new Promise<number>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
            img.onerror = () => resolve(16 / 9);
            img.src = s.media_url;
          })
      )
  ).then((ratios) => {
    if (cancelled || ratios.length === 0) return;
    // Use the SMALLEST width/height ratio (= tallest image) so every slide fits fully.
    setAspect(Math.min(...ratios));
  });
  return () => { cancelled = true; };
}, [slides]);
```

Then on the `<section>`:
```tsx
<section
  className="relative w-full overflow-hidden bg-brand-deep"
  style={{ aspectRatio: `${aspect}` }}
  ...
>
```

And remove `aspect-[16/9]` from the className.

### 3. (Optional safety) Soft cap for extreme portrait images

If a user ever uploads a very tall image (e.g. 1:2), letting the hero be taller than the screen feels broken. Add a sane upper bound:

```tsx
style={{ aspectRatio: `${Math.max(aspect, 4 / 5)}` }} // never taller than 5:4 ratio
```

(`4/5` = width/height ratio; equivalent to "no taller than 1.25× its width".)

## Files Affected

- **`src/components/site/HeroSlider.tsx`** — remove `max-h-[85vh]` and fixed `aspect-[16/9]`, add image-aspect auto-detection, apply inline `aspectRatio`. Update the loading skeleton the same way.

No DB changes, no other components affected. The admin live preview (`SlideLivePreview.tsx`) already uses its own fixed 16:9 mini-frame, which is correct for the editor and stays as is.

## Result

The hero section will grow to fully display the uploaded slide image — no `85vh` cap, and no vertical cropping of taller images.
