-- CRM profile: the three legacy membership facts get columns of their own.
--
-- WHY THIS EXISTS. The KarmaCRM import (D-19 item 1) had nowhere to put `Membership Type`,
-- `Payment Type` and `Date Joined`. `crm_profiles` held stage, status, referral_source,
-- assigned_to_staff_id, department, industry, tags and groups, and that was all — so the import
-- wrote the three facts into a single member note with a stable prefix and recorded the gap.
-- Lee's ruling of 2026-09-10: give them columns. This is that migration, plus the backfill that
-- lifts the values out of the notes already written.
--
-- WHY NOT ON `subscriptions`. These are what KARMA said, not what this platform has ever
-- charged. A `subscriptions` row means a billing relationship this system owns; putting a
-- legacy label there would make the two indistinguishable, and golden rule 4 exists because
-- that distinction is the one that decides whether somebody is treated as paying.
--
-- `legacy_date_joined` is a DATE, not text: it is the only one of the three with a real type,
-- and the mapper already parses it through `parseIceDate` (DD/MM/YYYY, ambiguous rejected). The
-- other two are free text because Karma's are free text — 'Single', 'Couple 2 pendants',
-- 'FOC — Ayuntamiento' — and an enum invented over them would be an enum people lie to fit.
--
-- ROLLBACK:
--   ALTER TABLE public.crm_profiles
--     DROP COLUMN IF EXISTS legacy_membership_type,
--     DROP COLUMN IF EXISTS legacy_payment_type,
--     DROP COLUMN IF EXISTS legacy_date_joined;
--   The backfill is not separately reversible and does not need to be: it only ever writes into
--   columns this migration creates, so dropping them removes everything it did. The member notes
--   it reads are left untouched.

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS legacy_membership_type text,
  ADD COLUMN IF NOT EXISTS legacy_payment_type    text,
  ADD COLUMN IF NOT EXISTS legacy_date_joined     date;

COMMENT ON COLUMN public.crm_profiles.legacy_membership_type IS
  'Verbatim KarmaCRM "Membership Type" (first non-numeric occurrence of three duplicate columns, then "Purchased Package"). What Karma said, never what this platform charges.';
COMMENT ON COLUMN public.crm_profiles.legacy_payment_type IS
  'Verbatim KarmaCRM "Payment Type" / "DD or TVP". Not a payment method this platform can charge.';
COMMENT ON COLUMN public.crm_profiles.legacy_date_joined IS
  'KarmaCRM "Date Joined", else "Joined Date". Parsed DD/MM/YYYY; an ambiguous value was rejected and is absent rather than guessed.';

-- ── the backfill ───────────────────────────────────────────────────────────────
--
-- Rows imported before these columns existed carry the three facts in one member note written
-- with a stable prefix:
--
--   Karma CRM membership: membership type Single; payment type DD; joined 2019-04-01
--
-- Each clause is present only when the CRM had a value, so all three patterns are optional and
-- independent. Idempotent twice over: it writes only where the column is still NULL, and the
-- note is left in place — the note is what a human reads on the record, and deleting it would
-- destroy the only copy if a pattern here turned out to be wrong.
DO $$
DECLARE
  updated integer;
BEGIN
  WITH note AS (
    SELECT
      n.member_id,
      -- The FIRST such note per member, oldest first: a re-import writes no second copy (the
      -- import checks the content before inserting), but a hand-edited note must not win over
      -- the one the import wrote.
      substring(n.content from 'membership type ([^;]+)') AS membership_type,
      substring(n.content from 'payment type ([^;]+)')    AS payment_type,
      substring(n.content from 'joined (\d{4}-\d{2}-\d{2})') AS date_joined,
      row_number() OVER (PARTITION BY n.member_id ORDER BY n.created_at, n.id) AS rn
    FROM public.member_notes n
    WHERE n.content LIKE 'Karma CRM membership:%'
  )
  UPDATE public.crm_profiles p
     SET legacy_membership_type = COALESCE(p.legacy_membership_type, note.membership_type),
         legacy_payment_type    = COALESCE(p.legacy_payment_type,    note.payment_type),
         legacy_date_joined     = COALESCE(p.legacy_date_joined,     note.date_joined::date)
    FROM note
   WHERE note.rn = 1
     AND note.member_id = p.member_id
     AND (p.legacy_membership_type IS NULL AND note.membership_type IS NOT NULL
       OR p.legacy_payment_type    IS NULL AND note.payment_type    IS NOT NULL
       OR p.legacy_date_joined     IS NULL AND note.date_joined     IS NOT NULL);

  GET DIAGNOSTICS updated = ROW_COUNT;
  RAISE NOTICE 'crm_profiles legacy columns backfilled from member notes: % row(s)', updated;
END $$;
