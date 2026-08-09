-- Per-product landing-page theme.
--
-- Until now the long-form landing layout was hardcoded to one slug in
-- ProductDetail.tsx, and every image on it was a fixed path under
-- /landing/kapiva-shilajit-gold/. Both move into the product row so an admin
-- can apply the layout to any product and upload that product's own assets.

-- ---------------------------------------------------------------------------
-- 1. Columns.
--
-- Empty string rather than NULL for the theme: the storefront treats "no
-- theme" as the default two-column layout, and a single sentinel keeps the
-- admin <Select> (which cannot hold a null value) and the row in agreement.
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS landing_theme text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS landing_assets jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.products.landing_theme IS
  'Landing layout id from src/lib/landingThemes.ts. Empty means the default product detail layout.';
COMMENT ON COLUMN public.products.landing_assets IS
  'Per-section image URLs for the selected landing theme, keyed by section id.';

-- ---------------------------------------------------------------------------
-- 2. Carry the existing hardcoded landing page over to the row it describes.
--
-- Without this the Kapiva page would fall back to the default layout the
-- moment the hardcoded slug list is removed from the frontend. The paths are
-- the same static files that shipped in public/landing/, so nothing needs to
-- be re-uploaded.
--
-- Benefit images are ordered to line up with that product's own Benefits list,
-- which now supplies the card captions. The two trailing images have no
-- matching benefit and render as images alone.
-- ---------------------------------------------------------------------------
UPDATE public.products
SET
  landing_theme = 'gold_landing',
  landing_assets = jsonb_build_object(
    'highlights', jsonb_build_array(
      '/landing/kapiva-shilajit-gold/ingredients-banner-clean.png'
    ),
    'benefits', jsonb_build_array(
      '/landing/kapiva-shilajit-gold/benefit-stamina-endurance-gym.png',
      '/landing/kapiva-shilajit-gold/benefit-sustained-energy.png',
      '/landing/kapiva-shilajit-gold/benefit-faster-recovery.png',
      '/landing/kapiva-shilajit-gold/benefit-vitality-drive.png',
      '/landing/kapiva-shilajit-gold/benefit-immune-support.png',
      '/landing/kapiva-shilajit-gold/benefit-stamina-endurance-run.png'
    ),
    'ingredients', jsonb_build_array(
      '/landing/kapiva-shilajit-gold/ingredients-banner-text.png'
    ),
    'howToUse', jsonb_build_array(
      '/landing/kapiva-shilajit-gold/howto-take-one-capsule.png',
      '/landing/kapiva-shilajit-gold/howto-with-milk-or-water.png',
      '/landing/kapiva-shilajit-gold/howto-after-meal.png'
    ),
    'reviews', jsonb_build_array(
      '/landing/kapiva-shilajit-gold/showcase-drinking-water.png',
      '/landing/kapiva-shilajit-gold/showcase-recommending.png',
      '/landing/kapiva-shilajit-gold/showcase-gym-bag.png',
      '/landing/kapiva-shilajit-gold/showcase-office-routine.png',
      '/landing/kapiva-shilajit-gold/showcase-family-breakfast.png',
      '/landing/kapiva-shilajit-gold/showcase-majlis-couple.png'
    )
  )
WHERE slug = 'kapiva-shilajit-gold-30-capsules'
  AND landing_theme = '';
