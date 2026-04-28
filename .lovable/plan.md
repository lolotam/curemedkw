# Fix: White background behind transparent PNG logo in header

## What's actually happening

The header `<img>` tag itself does **not** add any background color. Looking at `src/components/site/SiteHeader.tsx`:

```tsx
<img src={logoSrc} alt="Curemed" className="h-20 w-auto" />
```

There is no `bg-white`, no padding, no wrapper with a fill color. So the white you're seeing is coming from one of three real sources:

1. **The PNG itself is not actually transparent.** This is by far the most common cause. When a logo is exported, uploaded to a host (Google Drive, WhatsApp, some CDNs, screenshots, "Save image as…" from a white page), or converted, the transparency channel is often flattened to white. The file looks transparent in your viewer but ships with a white background baked in.
2. **The hosting URL strips transparency.** Some image hosts (e.g. `googleusercontent.com` thumbnails, `imgur` `?fmt=jpg`, social CDN proxies) re-encode PNG → JPEG, which forces a white background.
3. **The header surface itself is white in light mode.** `bg-background/85` resolves to white in light theme. A truly transparent logo will *look* like it sits on white because the header behind it is white. This is correct, not a bug.

## Plan

### 1. Verify the source image (no code yet)
Add a small debug helper so we can confirm whether the uploaded file is genuinely transparent:

- In `AdminBranding.tsx`, render the logo preview on **two backgrounds**: a checkerboard tile (industry standard for transparency) **and** a dark tile. If the logo shows a white box on the checkerboard, the PNG itself has the white baked in — no code fix can remove it; you must re-export the logo with a transparent background.
- Also show the response `Content-Type` of the URL after fetch (e.g. `image/png` vs `image/jpeg`). If it's `image/jpeg`, the host stripped transparency.

### 2. Make sure nothing in our code adds a background
Audit the three places the logo is rendered and explicitly remove any backgrounds / padding:

- `src/components/site/SiteHeader.tsx` — confirm `<img>` has no wrapper background. (Already clean — keep as is.)
- `src/components/site/SiteFooter.tsx` — check the footer logo container.
- `src/pages/admin/AdminLogin.tsx` and `src/components/admin/AdminLayout.tsx` — same check.

If any wrapper has `bg-white`, `bg-background`, or padding that creates a visible box, remove it.

### 3. Add CSS safety net
Add a utility class `.brand-logo-img` applied to all logo `<img>` tags:

```css
.brand-logo-img {
  background: transparent !important;
  mix-blend-mode: normal;
}
```

This guarantees no parent style accidentally paints a background on the image element itself.

### 4. Optional: blend-mode fallback (only if user opts in)
If the user *cannot* re-export a clean PNG, we can add a per-asset toggle in `/admin/branding`:
- "Image has white background — try to remove it" → applies `mix-blend-mode: multiply` on dark headers or `mix-blend-mode: darken` on light headers.
- This is a visual hack, not a real fix, and it can darken or wash out colored logos. Off by default.

### 5. Documentation in the admin page
Add a short hint under the logo input:
> "For best results, upload a PNG or SVG with a true transparent background. If your logo shows a white box on the dark preview tile below, the file itself is not transparent — re-export it from your design tool."

## Files to edit
- `src/pages/admin/AdminBranding.tsx` — dual-background preview (checkerboard + dark), Content-Type indicator, hint text, optional "remove white bg" toggle.
- `src/index.css` — add `.brand-logo-img` utility + checkerboard background utility.
- `src/components/site/SiteHeader.tsx` — apply `brand-logo-img` class.
- `src/components/site/SiteFooter.tsx` — apply `brand-logo-img` class, audit wrapper.
- `src/components/admin/AdminLayout.tsx` — apply `brand-logo-img` class.
- `src/pages/admin/AdminLogin.tsx` — apply `brand-logo-img` class.
- `src/lib/db.ts` — (only if step 4 accepted) add `BRANDING_LOGO_REMOVE_BG_KEY` setting + hook.

## Expected outcome
- If the PNG is truly transparent: the logo will sit cleanly on the header with no white box, in both light and dark themes.
- If the PNG is not transparent: the new dark preview tile in `/admin/branding` will make this obvious immediately, and the hint will tell you exactly what to fix in your source file.

Approve and I'll implement.