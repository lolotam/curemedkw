ALTER TABLE public.hero_slides
ADD COLUMN overlay_opacity smallint NOT NULL DEFAULT 80
CHECK (overlay_opacity BETWEEN 0 AND 100);