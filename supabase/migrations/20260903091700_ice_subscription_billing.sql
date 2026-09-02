-- ICE import: legacy membership and billing metadata.
--
-- Populated rows: Membership Type 128 (the authoritative duplicate, col 66) ·
-- Payment Type 134 · Monthly Fee 15 · DD or TVP 19 · Monthly Payment Date 12 ·
-- Debt or TVP 46 · Personal Pendant 150.
--
-- legacy_membership_label holds the verbatim CRM string. The plan_type enum
-- stays single|couple: "Emergency Response (Standard/Premium)", "PAYG
-- Membership" and "Nursing & Homecare" are NOT added as plan types until
-- someone decides they are real plans. Keeping the label loses no information
-- and avoids inventing product.
--
-- is_free_of_charge is how FOC survives. It appears today only inside the two
-- payment columns the importer refuses to store (card details, bank number),
-- so without this flag the fact that a member pays nothing is discarded along
-- with the card data.
--
-- Reverse: ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS <each>;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS legacy_membership_label text,
  ADD COLUMN IF NOT EXISTS payment_arrangement     text,
  ADD COLUMN IF NOT EXISTS monthly_payment_date    text,
  ADD COLUMN IF NOT EXISTS arrears_note            text,
  ADD COLUMN IF NOT EXISTS is_free_of_charge       boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subscriptions.legacy_membership_label IS 'Verbatim KarmaCRM membership string. Source of truth for migrated members until reclassified.';
COMMENT ON COLUMN public.subscriptions.is_free_of_charge IS 'FOC member. Derived from the CRM payment fields at import, which are otherwise discarded.';
