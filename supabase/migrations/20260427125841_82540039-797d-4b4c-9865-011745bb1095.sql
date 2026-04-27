ALTER TABLE public.hero_slides
  ADD COLUMN IF NOT EXISTS font_family_en text NOT NULL DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS font_family_ar text NOT NULL DEFAULT 'Cairo',
  ADD COLUMN IF NOT EXISTS h1_font_size smallint NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS h2_font_size smallint NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS cta_font_size smallint NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS h1_animation text NOT NULL DEFAULT 'fade-in-up',
  ADD COLUMN IF NOT EXISTS h2_animation text NOT NULL DEFAULT 'fade-in-up',
  ADD COLUMN IF NOT EXISTS cta_animation text NOT NULL DEFAULT 'fade-in-up',
  ADD COLUMN IF NOT EXISTS text_position_x smallint NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS text_position_y smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS text_align text NOT NULL DEFAULT 'left';