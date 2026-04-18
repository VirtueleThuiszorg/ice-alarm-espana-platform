-- ============================================================
-- Partner System Upgrade Migration
-- Adds region, how_heard, motivation, additional_notes,
-- reviewed_by/at/notes, current_client_base, position_title,
-- last_name, cif columns. Creates monthly referral counts view.
-- ============================================================

-- 1. Add new columns to partners table
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS how_heard_about_us TEXT,
  ADD COLUMN IF NOT EXISTS motivation TEXT,
  ADD COLUMN IF NOT EXISTS additional_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS current_client_base TEXT,
  ADD COLUMN IF NOT EXISTS position_title TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS cif TEXT;

-- 2. Add new partner types to the partner_type check constraint (if one exists)
-- Since partner_type is a TEXT column without enum constraint, the new types
-- (pharmacy, insurance, healthcare_provider, real_estate, expat_community, corporate_other)
-- are already valid. No schema change needed for the column itself.

-- 3. Index on region for filtering
CREATE INDEX IF NOT EXISTS idx_partners_region ON partners(region);

-- 4. Index on partner_type for filtering
CREATE INDEX IF NOT EXISTS idx_partners_partner_type ON partners(partner_type);

-- 5. Monthly referral counts view (for partner dashboard chart)
CREATE OR REPLACE VIEW partner_monthly_referral_counts AS
SELECT
  pi.partner_id,
  date_trunc('month', pi.created_at) AS month,
  COUNT(*) FILTER (WHERE pi.status != 'draft') AS invites_sent,
  COUNT(*) FILTER (WHERE pi.status IN ('registered', 'converted')) AS registrations
FROM partner_invites pi
GROUP BY pi.partner_id, date_trunc('month', pi.created_at);

-- 6. Grant RLS-compatible access to the view
-- Views inherit RLS from their underlying tables, so no additional policy needed.
