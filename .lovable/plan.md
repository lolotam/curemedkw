## Goal
Change product URLs from `/{brand}/product/{uuid}` to `/{brand}/product/{slug}` where `slug` is derived from the product name and unique. Keep old UUID URLs working as a fallback (for SEO/external links).

Example: `/australian-bodycare/product/ea06427d-…` → `/australian-bodycare/product/tea-tree-body-wash`

## Database changes

Add a globally unique, lowercase, kebab-case `slug` column on `products`, auto-maintained by a trigger.

```sql
-- 1. Column
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS slug text;

-- 2. Slugify helper (ASCII-safe, removes diacritics, collapses non-alnum to '-')
CREATE OR REPLACE FUNCTION public.slugify(_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(coalesce(_input, '')),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
$$;

-- 3. Backfill existing rows with unique slugs (suffix -2, -3, … on collision)
DO $$
DECLARE
  r record;
  base text;
  candidate text;
  n int;
BEGIN
  FOR r IN SELECT id, name FROM public.products WHERE slug IS NULL OR slug = '' ORDER BY created_at LOOP
    base := public.slugify(r.name);
    IF base = '' THEN base := 'product'; END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM public.products WHERE slug = candidate AND id <> r.id) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    UPDATE public.products SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Enforce uniqueness + non-null
ALTER TABLE public.products
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_slug_key ON public.products (slug);

-- 5. Trigger: auto-generate slug on insert/update when blank or name changes
CREATE OR REPLACE FUNCTION public.products_set_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  n int := 1;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base := public.slugify(NEW.name);
    IF base = '' THEN base := 'product'; END IF;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.products WHERE slug = candidate AND id <> NEW.id) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_set_slug ON public.products;
CREATE TRIGGER trg_products_set_slug
  BEFORE INSERT OR UPDATE OF name, slug ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_set_slug();
```

This will be applied via the Lovable migration tool on the managed backend, and the same SQL is provided as a script to run on your self-hosted Supabase.

## App changes

### `src/App.tsx`
- Change route `/:brand/product/:id` → `/:brand/product/:slug`.

### `src/lib/db.ts`
- Add `slug` to `Product` type and `rowToProduct` mapping.
- Rename/extend `useProduct(id)` to `useProduct(slugOrId)` — query by `slug` first; if not found and the value looks like a UUID, fall back to lookup by `id` (legacy URL support). Same query key semantics.

### `src/pages/ProductDetail.tsx`
- Read `:slug` instead of `:id`.
- If found via UUID-fallback, `Navigate` (replace) to the canonical `/${brand}/product/${product.slug}` for SEO.
- Replace the 2 hardcoded `${product.id}` link strings with `${product.slug}`.

### Link callsites — replace `product.id` with `product.slug` in:
- `src/components/site/ProductCard.tsx` line 60
- `src/pages/CuremedHome.tsx` line 400
- `src/pages/admin/AdminProducts.tsx` line 327

### `src/integrations/supabase/types.ts`
Auto-regenerated after migration — no manual edit.

## Self-hosted Supabase script
Save the full SQL block above to `scripts/migrations/2026xxxx_product_slugs.sql` so you can apply it with `psql` or via `scripts/apply-self-hosted-migrations.sh`. Plan adds the file alongside the existing migration scripts; no behavior change there.

## Out of scope
- Brand-scoped uniqueness (using global unique slugs is simpler and still gives clean URLs).
- Redirect rules at the hosting layer — handled client-side by the UUID-fallback Navigate.
- Admin slug editor UI — slug auto-generates from name; can be added later if you want manual control.
