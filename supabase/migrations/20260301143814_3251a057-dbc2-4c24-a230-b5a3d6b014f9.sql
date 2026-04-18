
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

CREATE INDEX IF NOT EXISTS idx_partners_region ON partners(region);
CREATE INDEX IF NOT EXISTS idx_partners_partner_type ON partners(partner_type);

CREATE OR REPLACE VIEW partner_monthly_referral_counts AS
SELECT
    pi.partner_id,
    date_trunc('month', pi.created_at) AS month,
    COUNT(*) FILTER (WHERE pi.status != 'draft') AS invites_sent,
    COUNT(*) FILTER (WHERE pi.status IN ('registered', 'converted')) AS registrations
FROM partner_invites pi
GROUP BY pi.partner_id, date_trunc('month', pi.created_at);
