-- The 2026 holiday history that predates the rota import, and the entitlement it is read against.
--
-- WHAT WAS WRONG. `20260909120000_rota_2026_seed_and_generator.sql` imported
-- docs/rota/rota_2026_clean.csv from 2026-09-10 onwards, because that was the window the rota
-- brief covered. The holiday columns in that sheet run the whole year, so every day off taken
-- BEFORE the cut was left out — and `staff_holiday_balance` counts days by the year of
-- `start_date`, so the balances an operator and a supervisor both read were wrong for 2026:
--
--                already imported (from 09-10)   the year, per the sheet
--   Mary                     4                              18
--   Carmen                   9                              28
--   Albert                   4                              16
--
-- A supervisor approving November against "Carmen has 21 days left" when she has 2 is the kind
-- of error that only surfaces in December, when somebody is told to take days that do not exist.
--
-- WHAT THIS DOES. Inserts the pre-cut ranges as APPROVED holidays — they were taken; there is
-- nothing to decide — with reason 'imported from 2026 rota sheet' so an imported row is never
-- mistaken for one somebody requested through the app. Ranges, not days: `total_days` is a
-- GENERATED column (end − start + 1), which is días naturales, ET art. 38, and the same count
-- the sheet's per-day columns add up to.
--
-- ENTITLEMENT. 30 calendar days a year for a full-time contrato indefinido (ET art. 38 — the
-- statutory minimum in días naturales, which is what all four operators are on).
-- `20260724100000_holiday_statutory_minimum_30.sql` already set the column default and lifted
-- the 22/NULL rows; this sets it explicitly for the four people the sheet names, so the
-- assertion below is checking a value this migration is responsible for rather than one it hopes
-- is still there. It remains editable per person in admin.
--
-- IDEMPOTENT. Every insert is guarded on (staff_id, start_date, end_date), the entitlement write
-- is a no-op when already 30, and the audit rows are only written for people who actually gained
-- rows on this run. Running it twice changes nothing; that is asserted in
-- src/test/holidayBackfill2026.test.ts, which also re-derives every range below from the CSV so
-- a typo here fails rather than silently importing the wrong dates.
--
-- WHAT IT DOES NOT DO. No pay-out, anywhere: days are taken, never paid instead (Lee's ruling).
-- It does not touch the shifts those absences were covered by — the rota seed owns
-- `staff_shift_covers`, and inventing covers for absences from March would be inventing history.
--
-- EXERCISED BEFORE MERGE, on a local PostgreSQL 16 with a fixture carrying the four staff rows
-- and the September import's nine ranges (the assertions below are the same either way, but "the
-- SQL looks right" is not the same claim as "the SQL ran"):
--
--   correct data  16 ranges imported, 2 entitlements lifted (Mary 22→30, Carmen NULL→30);
--                 2026 reads Albert 16/30, Carmen 28/30, Mary 18/30 — remaining 14 / 2 / 12
--   re-run        0 ranges, 0 entitlements, no new audit rows
--   empty database  no-op, with the reason returned rather than an error
--   one range one day short  RAISES, and the transaction leaves 0 imported rows behind
--
-- ROLLBACK (holidays only; the entitlement is the statutory figure and stays):
--   DELETE FROM public.staff_holidays WHERE reason = 'imported from 2026 rota sheet';
--   DELETE FROM public.activity_logs WHERE action = 'holiday_backfill_2026';
--   DROP FUNCTION IF EXISTS public.backfill_holidays_2026();

CREATE OR REPLACE FUNCTION public.backfill_holidays_2026()
RETURNS TABLE (
  holidays_inserted INTEGER,
  entitlements_set  INTEGER,
  outcome           TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $backfill$
DECLARE
  v_reviewer     UUID;
  v_inserted     INTEGER := 0;
  v_entitlements INTEGER := 0;
  v_known        INTEGER;
  v_bad          TEXT;
  v_year_totals  TEXT;
BEGIN
  -- The pre-cut ranges, derived from the sheet's per-day holiday columns. Held in a temp table
  -- so the inserts below are set-based and the assertions can be expressed against the same
  -- data rather than against a second hand-written list.
  CREATE TEMP TABLE _hol_backfill (
    email      TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _hol_backfill (email, start_date, end_date) VALUES
  ('asoares@icealarm.es',  '2026-08-25'::date, '2026-09-05'::date),
  ('cnicolas@icealarm.es', '2026-02-23'::date, '2026-02-24'::date),
  ('cnicolas@icealarm.es', '2026-03-30'::date, '2026-03-30'::date),
  ('cnicolas@icealarm.es', '2026-05-17'::date, '2026-05-25'::date),
  ('cnicolas@icealarm.es', '2026-05-29'::date, '2026-05-31'::date),
  ('cnicolas@icealarm.es', '2026-07-10'::date, '2026-07-12'::date),
  ('cnicolas@icealarm.es', '2026-07-18'::date, '2026-07-18'::date),
  ('mbonner@icealarm.es',  '2026-01-19'::date, '2026-01-19'::date),
  ('mbonner@icealarm.es',  '2026-02-06'::date, '2026-02-06'::date),
  ('mbonner@icealarm.es',  '2026-03-02'::date, '2026-03-03'::date),
  ('mbonner@icealarm.es',  '2026-03-20'::date, '2026-03-20'::date),
  ('mbonner@icealarm.es',  '2026-04-13'::date, '2026-04-13'::date),
  ('mbonner@icealarm.es',  '2026-05-20'::date, '2026-05-20'::date),
  ('mbonner@icealarm.es',  '2026-07-07'::date, '2026-07-07'::date),
  ('mbonner@icealarm.es',  '2026-07-18'::date, '2026-07-21'::date),
  ('mbonner@icealarm.es',  '2026-08-23'::date, '2026-08-24'::date);

  -- Nobody to import for: a fresh or CI database has no operator rows, and that is not an
  -- error. Same shape as `seed_rota_2026`, which returns zeros and says why.
  SELECT count(DISTINCT s.id) INTO v_known
  FROM public.staff s
  WHERE lower(s.email) IN (SELECT lower(email) FROM _hol_backfill);

  IF v_known = 0 THEN
    RETURN QUERY SELECT 0, 0,
      'no matching staff rows — nothing imported (expected on a fresh or CI database)'::TEXT;
    RETURN;
  END IF;

  -- Reviewer: the longest-standing active super_admin, resolved by ROLE rather than by a
  -- hardcoded address (CLAUDE.md forbids per-entity one-off code, and Lee's email could change).
  -- NULL is acceptable — `reviewed_by` is nullable — and only means the import does not claim a
  -- named human signed these off.
  SELECT id INTO v_reviewer
  FROM public.staff
  WHERE role = 'super_admin' AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  -- ---------- entitlement: 30 días naturales (ET art. 38) ----------
  UPDATE public.staff s
  SET annual_holiday_days = 30
  WHERE lower(s.email) IN (SELECT lower(email) FROM _hol_backfill)
    AND coalesce(s.annual_holiday_days, 0) <> 30;
  GET DIAGNOSTICS v_entitlements = ROW_COUNT;

  -- ---------- the pre-cut holidays ----------
  INSERT INTO public.staff_holidays
    (staff_id, start_date, end_date, reason, status, reviewed_by, reviewed_at)
  SELECT s.id, h.start_date, h.end_date, 'imported from 2026 rota sheet', 'approved',
         v_reviewer, now()
  FROM _hol_backfill h
  JOIN public.staff s ON lower(s.email) = lower(h.email)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.staff_holidays ex
    WHERE ex.staff_id = s.id
      AND ex.start_date = h.start_date
      AND ex.end_date = h.end_date
  );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- ---------- what this migration is responsible for, asserted ----------
  --
  -- Scoped to the rows carrying this import's own reason, deliberately. Asserting each person's
  -- FULL-YEAR total here would make this migration fail on a database where the September import
  -- had not run — which is a real thing to know but not this migration's fault, and a failed
  -- migration blocks every later one. So: what this import put in is asserted hard, and the
  -- year's totals are reported in `outcome` and in the audit rows for a human to read.
  SELECT string_agg(format('%s=%s', x.email, x.days), ', ' ORDER BY x.email) INTO v_bad
  FROM (
    SELECT lower(s.email) AS email, sum(hol.total_days)::INTEGER AS days
    FROM public.staff_holidays hol
    JOIN public.staff s ON s.id = hol.staff_id
    WHERE hol.reason = 'imported from 2026 rota sheet'
    GROUP BY lower(s.email)
  ) x
  JOIN (VALUES
    ('asoares@icealarm.es', 12),
    ('cnicolas@icealarm.es', 19),
    ('mbonner@icealarm.es', 14)
  ) AS want(email, days) ON want.email = x.email
  WHERE x.days <> want.days;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'holiday backfill wrong: expected asoares=12, cnicolas=19, mbonner=14 '
                    'pre-cut days from the sheet; got %', v_bad;
  END IF;

  -- The year as it now stands, per person: 30 entitlement, and the sheet says 16/28/18 approved.
  SELECT string_agg(
           format('%s %s/%s used', x.first_name, x.approved, x.entitlement),
           ', ' ORDER BY x.first_name)
    INTO v_year_totals
  FROM (
    SELECT s.first_name,
           s.annual_holiday_days AS entitlement,
           coalesce(sum(hol.total_days) FILTER (
             WHERE hol.status = 'approved' AND extract(year FROM hol.start_date) = 2026
           ), 0)::INTEGER AS approved
    FROM public.staff s
    LEFT JOIN public.staff_holidays hol ON hol.staff_id = s.id
    WHERE lower(s.email) IN (SELECT lower(email) FROM _hol_backfill)
    GROUP BY s.id, s.first_name, s.annual_holiday_days
  ) x;

  -- ---------- audit ----------
  -- One row per person who actually gained holidays on this run, so a re-run adds nothing. The
  -- Supabase CLI does not surface RAISE NOTICE, so this is the only record of what a data
  -- migration did that can be read back afterwards with a query.
  IF v_inserted > 0 THEN
    INSERT INTO public.activity_logs (staff_id, action, entity_type, entity_id, new_values, reason)
    SELECT v_reviewer, 'holiday_backfill_2026', 'staff', s.id,
           jsonb_build_object(
             'ranges_imported', count(*),
             'days_imported', sum(hol.total_days),
             'source', 'docs/rota/rota_2026_clean.csv',
             'window', 'before 2026-09-10'
           ),
           'imported from 2026 rota sheet'
    FROM public.staff_holidays hol
    JOIN public.staff s ON s.id = hol.staff_id
    WHERE hol.reason = 'imported from 2026 rota sheet'
      AND NOT EXISTS (
        SELECT 1 FROM public.activity_logs al
        WHERE al.action = 'holiday_backfill_2026' AND al.entity_id = s.id
      )
    GROUP BY s.id;
  END IF;

  DROP TABLE _hol_backfill;

  RETURN QUERY SELECT v_inserted, v_entitlements,
    format('imported %s holiday range(s) (0 on a re-run), set %s entitlement(s) to 30. '
           || '2026 now reads: %s', v_inserted, v_entitlements, coalesce(v_year_totals, 'nothing'));
END
$backfill$;

COMMENT ON FUNCTION public.backfill_holidays_2026() IS
  'Idempotent import of the 2026 holidays taken BEFORE 2026-09-10 from '
  'docs/rota/rota_2026_clean.csv, as approved rows with reason "imported from 2026 rota sheet", '
  'plus the 30-day statutory entitlement (ET art. 38) for the four people the sheet names. '
  'Returns zeros and says so when those staff rows do not exist. Owner and SQL editor only.';

REVOKE ALL ON FUNCTION public.backfill_holidays_2026() FROM PUBLIC;

-- Run it now. On a fresh/CI database this is a no-op that says so.
DO $run_backfill$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.backfill_holidays_2026();
  RAISE NOTICE 'holiday backfill: %', r.outcome;
END
$run_backfill$;
