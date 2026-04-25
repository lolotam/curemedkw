## Diagnosis

I checked your saved slide in the database:

```
page_key | media_url           | is_active | title_en
---------+---------------------+-----------+------------------------
curemed  | …1777152416184…png  |   FALSE   | GGGGGGGGGGGGGGGGGGGGG
```

**The slide is saved correctly — but `is_active = false`**, so the live `HeroSlider` (which only fetches active slides) hides it. Two UX issues caused this:

1. **New slides default to "Hidden"** and you must toggle Active *and* click "Save changes" for it to go live. The toggle currently only updates local state.
2. **Brand pages (`/flexitol`, `/kapiva`, `/nada`, `/australian-bodycare`) still render a static fallback hero** (logo + tagline + first product image) when no slides exist — you want this gone.

## Fix Plan

### 1. `src/pages/admin/AdminLandingPageEditor.tsx`
- **New slides default to `is_active: true`** so uploading media + saving = instantly live.
- **Active toggle persists immediately** (auto-save on toggle, like the upload flow does) — no need to click "Save changes" just to publish.
- **Auto-activate on first media upload** if the slide has no media yet — uploading a file publishes it.
- Keep manual "Save changes" button for text fields (titles, subtitles, CTAs).

### 2. `src/pages/BrandPage.tsx`
- **Remove the entire static hero fallback** (the `<section>` with the brand logo, tagline, "Shop All" button, and first-product image).
- Render `<HeroSlider pageKey={brandKey} />` with **no fallback** — section simply disappears when no active slides exist for that brand, exactly like CuremedHome already does.
- Keep all sections below (Products carousel, Why brand, Testimonials, FAQ, Contact, Newsletter) untouched.

### 3. `src/pages/CuremedHome.tsx`
- Already correct (no fallback). No change needed.

### 4. Database fix for your existing slide
- Flip your existing `curemed` slide to `is_active = true` so it appears immediately after the code change, without requiring you to go re-toggle it in the admin.

## Result

After this:
- **Upload an image/video in admin → it appears in the hero section immediately** (no save-changes step needed for publishing).
- **No slides for a brand → no hero section at all** (page starts directly with the brand's product carousel).
- The "Active/Hidden" switch becomes a true publish/unpublish control that takes effect instantly.

No changes to: schema, RLS, AdminLandingPages list view, HeroSlider component itself, or any non-hero sections.