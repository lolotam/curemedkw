-- Hero slides table
CREATE TABLE public.hero_slides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_key TEXT NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
  title_en TEXT,
  title_ar TEXT,
  subtitle_en TEXT,
  subtitle_ar TEXT,
  cta_label_en TEXT,
  cta_label_ar TEXT,
  cta_href TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hero_slides_page ON public.hero_slides(page_key, sort_order);

ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

-- Public read of active slides
CREATE POLICY "Anyone can view active hero slides"
ON public.hero_slides
FOR SELECT
USING (true);

-- Open write (app-level admin gate). Tighten later when admin auth is added.
CREATE POLICY "Anyone can insert hero slides"
ON public.hero_slides
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update hero slides"
ON public.hero_slides
FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete hero slides"
ON public.hero_slides
FOR DELETE
USING (true);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_hero_slides_updated_at
BEFORE UPDATE ON public.hero_slides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for hero media
INSERT INTO storage.buckets (id, name, public)
VALUES ('hero-media', 'hero-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read hero media"
ON storage.objects FOR SELECT
USING (bucket_id = 'hero-media');

CREATE POLICY "Anyone can upload hero media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'hero-media');

CREATE POLICY "Anyone can update hero media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'hero-media');

CREATE POLICY "Anyone can delete hero media"
ON storage.objects FOR DELETE
USING (bucket_id = 'hero-media');