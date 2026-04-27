# Slide Editor: Debug + Major Upgrade

## 1. Debug — CTA not appearing on the live slide

**Root cause:** In `src/components/site/HeroSlider.tsx` the CTA only renders when **both** `ctaLabel` AND `s.cta_href` are set:
```tsx
{ctaLabel && s.cta_href && (...)}
```
If the admin filled CTA label but left the link empty (or vice-versa), nothing shows, with no warning in the form.

**Fix:**
- Render the CTA when `ctaLabel` is set; if `cta_href` is empty, render a non-navigating button styled the same so the admin sees it.
- In the editor, add an inline warning when `cta_label_*` is set but `cta_href` is missing ("Add a link so the button navigates").
- Default `cta_href` to `#` in DB insert path so a freshly created slide with a label always renders.

## 2. New per-slide fields (DB columns added to `hero_slides`)

| Column | Type | Default | Purpose |
|---|---|---|---|
| `font_family_en` | text | `'Inter'` | English font choice |
| `font_family_ar` | text | `'Cairo'` | Arabic font choice |
| `h1_font_size` | smallint | `60` | Title size in px (mobile auto-scales) |
| `h2_font_size` | smallint | `20` | Subtitle size in px |
| `cta_font_size` | smallint | `16` | CTA size in px |
| `h1_animation` | text | `'fade-in-up'` | Title animation key |
| `h2_animation` | text | `'fade-in-up'` | Subtitle animation key |
| `cta_animation` | text | `'fade-in-up'` | CTA animation key |
| `text_position_x` | smallint | `10` | Horizontal % (0=left, 100=right) |
| `text_position_y` | smallint | `50` | Vertical % (0=top, 100=bottom) |
| `text_align` | text | `'left'` | left / center / right |

**10 English fonts:** Inter, Roboto, Poppins, Montserrat, Playfair Display, Lora, Oswald, Raleway, Merriweather, Bebas Neue.

**10 Arabic fonts:** Cairo, Tajawal, Almarai, Amiri, Noto Naskh Arabic, Markazi Text, Reem Kufi, Lateef, Scheherazade New, Changa.

All loaded from Google Fonts via `index.html` `<link>` tags.

**10 text animations** (dropdown for each of H1/H2/CTA):
1. None
2. Fade in
3. Fade in up
4. Fade in down
5. Slide in left
6. Slide in right
7. Zoom in
8. Typewriter (char-by-char reveal)
9. Blur in
10. Bounce in

Keyframes added to `tailwind.config.ts` + helper `slideAnimations.ts` mapping key → className. Typewriter implemented as a small React component using a CSS `steps()` animation on `width`.

## 3. Live preview inside the editor

Inside each slide card, replace the current static media tile with a **scaled mini hero preview** (16:9, ~480px wide) that renders exactly what the live `HeroSlider` shows for that slide:

- Background image/video + overlay opacity
- H1 / H2 / CTA with chosen font, size, animation, position
- Language toggle button (EN / AR) above the preview to switch which translation is shown
- "Replay animations" button to re-trigger the animations on demand
- Updates in real time as the admin types or moves sliders — no save needed

Implementation: extract the slide-render JSX from `HeroSlider.tsx` into `SlidePreview.tsx` and reuse it in both the live slider and the editor preview.

## 4. Positioning sliders

Add two sliders + an alignment toggle in the slide form:
- **Horizontal position** (0–100%) — moves the text block left↔right inside the slide
- **Vertical position** (0–100%) — moves it top↔bottom
- **Align** segmented control: Left / Center / Right

The text block in `SlidePreview` is absolutely positioned using `left: x%`, `top: y%`, `transform: translate(-x%, -y%)` so the anchor stays where the admin puts it. Live preview reflects each slider tick.

## 5. Per-landing-page auto-slide interval

**New DB row** in `site_settings`:
```
key = 'hero_intervals'
value = { "curemed": 5500, "flexitol": 5500, ... }   // milliseconds per page_key
```

- In `AdminLandingPageEditor`, add a top-of-page card: "Auto-advance interval (seconds)" — number input, default 5.5, range 1–60. Save button next to it persists to `site_settings`.
- `HeroSlider` reads `site_settings.hero_intervals[pageKey]` on mount and uses it instead of the hard-coded 5500ms prop.
- Backwards-compatible: missing value falls back to 5500ms.

## 6. Editor layout changes

The slide card grows, so the form is reorganised into 3 collapsible sections:

1. **Media & Overlay** (existing) — image upload, overlay slider
2. **Content** (existing) — EN/AR title, subtitle, CTA label, CTA link
3. **Style & Motion** (NEW) — fonts, sizes, animations, position sliders, alignment

The **live preview** sits sticky at the top of the card so it stays visible while editing any section.

## Technical details

**Files to edit:**
- `supabase/migrations/<new>.sql` — add 11 columns to `hero_slides` with defaults
- `src/lib/heroSlides.ts` — extend `HeroSlide` interface
- `src/lib/slideFonts.ts` (new) — font lists + CSS family strings
- `src/lib/slideAnimations.ts` (new) — animation key → className map + keyframes registration
- `src/components/site/SlidePreview.tsx` (new) — shared render component
- `src/components/site/HeroSlider.tsx` — use `SlidePreview`, read interval from settings, fix CTA render condition
- `src/components/admin/SlideStylePanel.tsx` (new) — fonts/sizes/animations/position UI
- `src/components/admin/SlideLivePreview.tsx` (new) — wraps `SlidePreview` with EN/AR toggle + replay
- `src/pages/admin/AdminLandingPageEditor.tsx` — integrate panel, preview, and per-page interval card
- `src/lib/db.ts` — add `getHeroInterval(pageKey)` / `setHeroInterval(pageKey, ms)` helpers using `site_settings`
- `tailwind.config.ts` — add 10 keyframes/animations
- `index.html` — add Google Fonts `<link>` for all 20 fonts (with `display=swap`)

**Backwards compatibility:** All new columns are nullable with sensible defaults so existing slides render unchanged.

**No breaking changes** to RLS — `hero_slides` and `site_settings` policies already allow admin writes / public read.
