-- ============================================================
-- Extend products table for public-facing catalog
-- ============================================================
-- Adds slug, status, category, display ordering, hero image,
-- and i18n JSONB columns for multilingual product content.
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'coming_soon', 'inactive')),
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT,
  ADD COLUMN IF NOT EXISTS short_description_i18n JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS long_description_i18n JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS name_i18n JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS features_i18n JSONB DEFAULT '{}'::jsonb;

-- Index for public catalog queries
CREATE INDEX IF NOT EXISTS idx_products_status_order
  ON public.products(status, display_order);

CREATE INDEX IF NOT EXISTS idx_products_slug
  ON public.products(slug);

-- RLS: public can read active + coming_soon products
DROP POLICY IF EXISTS "Public can view catalog products" ON public.products;
CREATE POLICY "Public can view catalog products"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (status IN ('active', 'coming_soon'));
