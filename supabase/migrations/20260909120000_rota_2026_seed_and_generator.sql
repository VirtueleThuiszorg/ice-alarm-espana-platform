-- The 2026 rota: schema, seed and generator.
--
-- Source of truth for the seed is docs/rota/rota_2026_clean.csv, committed in the same repo.
-- Every count below was recomputed from that file; ROTA_MODEL.md carries the derivation and
-- the two places the original brief was wrong.
--
-- WHAT THIS ADDS
--   1. public.bank_holidays           — shared, not a per-shift flag. Why: below.
--   2. public.staff_shift_swaps       — the swap flow that replaces the sheet's `note` column.
--   3. public.generate_rota()         — extends the six-day cycle into any future range.
--   4. The seed: 2026-09-10 .. 2026-12-31 only (113 days).
--
-- WHY THE SEED STOPS AT 2026-09-10 GOING BACKWARDS
-- The spreadsheet grid does not reflect the swaps that actually happened in the first eight
-- months, so that part of the year is a plan, not a record. Importing it would put 250 days of
-- approximately-true history into a system whose purpose is to be exactly true. History stays
-- in the spreadsheet.
--
-- WHY bank_holidays IS A TABLE AND NOT A COLUMN ON staff_shifts
-- A bank holiday is a property of a DATE, shared by everyone. As a boolean on staff_shifts it
-- would have to be written three times a day and could disagree with itself — one shift on
-- 25 December marked a holiday and the other two not. As a date table it cannot. It also has to
-- outlive 2026: the 2027 Torremolinos calendar is not derivable from anything in this repo.
--
-- IDEMPOTENCE, AND WHY IT IS NOT DONE WITH ON CONFLICT
-- staff_shifts already has UNIQUE(staff_id, shift_date, shift_type), so shifts could use
-- ON CONFLICT DO NOTHING. staff_holidays and staff_shift_covers have no such constraint, and
-- this migration deliberately does NOT add one: production data for those tables cannot be
-- inspected from here, and a UNIQUE index that fails on a duplicate row would fail the whole
-- push for a reason nobody could have predicted. So every insert below is guarded by
-- WHERE NOT EXISTS, which is idempotent regardless of what is already there, and the harness
-- proves a second run inserts nothing.
--
-- ROLLBACK
--   DELETE FROM public.staff_shift_covers WHERE shift_id IN (
--     SELECT id FROM public.staff_shifts WHERE shift_date BETWEEN '2026-09-10' AND '2026-12-31');
--   DELETE FROM public.staff_shifts   WHERE shift_date BETWEEN '2026-09-10' AND '2026-12-31';
--   DELETE FROM public.staff_holidays WHERE start_date BETWEEN '2026-09-10' AND '2026-12-31';
--   DROP FUNCTION IF EXISTS public.generate_rota(date, date);
--   DROP TABLE IF EXISTS public.staff_shift_swaps;
--   DROP TABLE IF EXISTS public.bank_holidays;
-- Reversible. Drops no pre-existing data.

-- ============================================================
-- 1. bank_holidays
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bank_holidays (
  holiday_date DATE PRIMARY KEY,
  name         TEXT NOT NULL,
  -- Torremolinos observes the national, Andalusian and two local feast days. Kept as a column
  -- because a future second office would not share the local ones.
  region       TEXT NOT NULL DEFAULT 'Torremolinos',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bank_holidays IS
  'Public holidays observed by the operation. A property of a date, shared by all staff — '
  'never a per-shift flag. Seeded for 2026 from docs/rota/rota_2026_clean.csv; the NAMES are '
  'derived from the Spanish/Andalusian/Torremolinos calendar, as the sheet gives dates only.';

ALTER TABLE public.bank_holidays ENABLE ROW LEVEL SECURITY;

-- Readable by any authenticated user: a member seeing that 25 December is a public holiday
-- leaks nothing, and the join wizard may want it later. WRITEABLE BY ADMINS ONLY.
DROP POLICY IF EXISTS "Anyone signed in can read bank holidays" ON public.bank_holidays;
CREATE POLICY "Anyone signed in can read bank holidays" ON public.bank_holidays
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins manage bank holidays" ON public.bank_holidays;
CREATE POLICY "Admins manage bank holidays" ON public.bank_holidays
  FOR ALL USING (
    get_staff_role(auth.uid()) IN ('super_admin', 'admin', 'call_centre_supervisor')
  );

-- ============================================================
-- 2. staff_shift_swaps — the flow that replaces the sheet's `note` column
-- ============================================================
--
-- The sheet records swaps as free text: "Mary working this morning for Carmen and she will pay
-- me back on 22nd". That is a promise between two people with no record that it was honoured.
-- This table makes each half explicit and each transition attributable.
--
-- A SWAP IS NOT A COVER. staff_shift_covers already models "somebody else works my shift"
-- (one shift, one substitute), which is what a holiday produces. A swap is a two-sided
-- exchange: my shift becomes yours AND yours becomes mine. Modelling it as two cover rows
-- would lose the fact that the two halves stand or fall together.
--
-- requested_shift_id is the swap initiator's own shift; offered_shift_id is the other person's.
-- offered_shift_id NULL means "please cover this for me" — a one-sided ask, which is how most
-- of the sheet's notes actually read.

CREATE TABLE IF NOT EXISTS public.staff_shift_swaps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_shift_id  UUID NOT NULL REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
  offered_shift_id    UUID REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
  requested_by        UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  counterparty_id     UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  -- requested -> accepted -> approved -> applied, or declined/cancelled at any point before.
  -- 'applied' is set only once the shifts have actually moved, so a crash between approval and
  -- the move is visible rather than silently complete.
  status              TEXT NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested','accepted','declined','approved','applied','cancelled')),
  reason              TEXT,
  accepted_at         TIMESTAMPTZ,
  approved_by         UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  applied_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- You cannot swap a shift with itself, and you cannot swap with yourself.
  CONSTRAINT staff_shift_swaps_distinct_shifts
    CHECK (offered_shift_id IS NULL OR offered_shift_id <> requested_shift_id),
  CONSTRAINT staff_shift_swaps_distinct_people
    CHECK (counterparty_id <> requested_by)
);

CREATE INDEX IF NOT EXISTS idx_staff_shift_swaps_status ON public.staff_shift_swaps(status);
CREATE INDEX IF NOT EXISTS idx_staff_shift_swaps_counterparty ON public.staff_shift_swaps(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_staff_shift_swaps_requested_by ON public.staff_shift_swaps(requested_by);

DROP TRIGGER IF EXISTS update_staff_shift_swaps_updated_at ON public.staff_shift_swaps;
CREATE TRIGGER update_staff_shift_swaps_updated_at
  BEFORE UPDATE ON public.staff_shift_swaps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.staff_shift_swaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage all swaps" ON public.staff_shift_swaps;
CREATE POLICY "Admins manage all swaps" ON public.staff_shift_swaps
  FOR ALL USING (
    get_staff_role(auth.uid()) IN ('super_admin', 'admin', 'call_centre_supervisor')
  );

-- A swap is between two people; both sides must see it, and nobody else.
DROP POLICY IF EXISTS "Staff view own swaps" ON public.staff_shift_swaps;
CREATE POLICY "Staff view own swaps" ON public.staff_shift_swaps
  FOR SELECT USING (
    requested_by    = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
    OR counterparty_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
  );

-- You may ask, but only in your own name and only for a shift that is actually yours.
DROP POLICY IF EXISTS "Staff request own swaps" ON public.staff_shift_swaps;
CREATE POLICY "Staff request own swaps" ON public.staff_shift_swaps
  FOR INSERT WITH CHECK (
    requested_by = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
    AND EXISTS (
      SELECT 1 FROM public.staff_shifts ss
      WHERE ss.id = requested_shift_id
        AND ss.staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- The counterparty may accept or decline — and NOTHING ELSE. They cannot approve their own
-- swap, cannot mark it applied, and cannot move the shifts: that is the supervisor's step, and
-- it is why `approved` and `applied` are absent from this WITH CHECK.
DROP POLICY IF EXISTS "Counterparty accepts or declines" ON public.staff_shift_swaps;
CREATE POLICY "Counterparty accepts or declines" ON public.staff_shift_swaps
  FOR UPDATE USING (
    counterparty_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
    AND status = 'requested'
  ) WITH CHECK (
    status IN ('accepted', 'declined')
  );

-- The requester may withdraw while it is still undecided.
DROP POLICY IF EXISTS "Requester cancels own swap" ON public.staff_shift_swaps;
CREATE POLICY "Requester cancels own swap" ON public.staff_shift_swaps
  FOR UPDATE USING (
    requested_by = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
    AND status IN ('requested', 'accepted')
  ) WITH CHECK (
    status = 'cancelled'
  );

-- ============================================================
-- 3. generate_rota(from_date, to_date) — extend the six-day cycle
-- ============================================================
--
-- THE CYCLE, and why it can be generated at all. Three operators run a strict six-day pattern
-- that is unbroken across all 365 days of 2026 (ROTA_MODEL.md §1 proves it: of 65 days that
-- differ from the pattern, 54 are the person's own holiday and 11 are Carmen moving onto Mary's
-- morning to cover hers — nothing unexplained). Travis works every night.
--
--   phase   0   1   2   3   4   5
--   Albert  A   O   O   A   A   A
--   Carmen  M   A   A   O   O   M
--   Mary    O   M   M   M   M   O
--
-- Phase is anchored on 2026-12-31 = phase 5 (Albert afternoon, Carmen morning, Mary OFF), the
-- last row of the sheet, so the first generated day continues it with no seam.
--
-- WHAT IT DOES NOT DO, ON PURPOSE
--   * It never overwrites. Every insert is guarded, so a hand-made swap inside the range
--     survives, and re-running over an already-generated quarter inserts nothing.
--   * It generates the CYCLE, not the exceptions — no holidays, no covers. A generated quarter
--     is the default rota, which humans then bend.
--   * It does not refuse a long day. It RETURNS the warnings (see below) rather than raising:
--     a function that declines to generate December because one day in it doubles Travis is a
--     function nobody will run. Lee's decision, ROTA_MODEL.md §2-A.
--   * It does NOT write shift_escalation_chain. That table is what sos-escalation-runner
--     actually reads, and it is on the SOS path — reported in ROTA_MODEL.md §6, not touched.
--
-- SECURITY DEFINER with a hard role check inside. It writes staff_shifts for four different
-- people, so it cannot run as the caller under RLS; the role check is therefore the whole
-- access control and is the first thing it does.

CREATE OR REPLACE FUNCTION public.generate_rota(
  p_from_date DATE,
  p_to_date   DATE
)
RETURNS TABLE (
  shifts_created   INTEGER,
  days_covered     INTEGER,
  long_day_warning TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $generate_rota$
DECLARE
  -- The cycle, as data. phase -> (morning, afternoon) by email; the third operator is OFF.
  v_anchor      DATE := DATE '2026-12-31';   -- phase 5
  v_created     INTEGER := 0;
  v_inserted    INTEGER;
  v_day         DATE;
  v_phase       INTEGER;
  v_morning     TEXT;
  v_afternoon   TEXT;
  v_long_days   INTEGER := 0;
  v_night_email TEXT := 'travis@icealarm.es';
BEGIN
  IF NOT (get_staff_role(auth.uid()) IN ('super_admin', 'admin', 'call_centre_supervisor')) THEN
    RAISE EXCEPTION 'generate_rota requires admin or call_centre_supervisor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_to_date < p_from_date THEN
    RAISE EXCEPTION 'generate_rota: to_date (%) is before from_date (%)', p_to_date, p_from_date
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- A whole year at a time is fine; a decade is a mistake, and silently generating 3650 days
  -- of rota is not a thing anyone meant to click.
  IF p_to_date - p_from_date > 400 THEN
    RAISE EXCEPTION 'generate_rota: range of % days exceeds 400; generate a quarter at a time',
      p_to_date - p_from_date USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_day := p_from_date;
  WHILE v_day <= p_to_date LOOP
    -- Postgres % on a negative left operand returns a negative; force it non-negative so dates
    -- BEFORE the anchor phase correctly too.
    v_phase := ((v_day - v_anchor) % 6 + 6) % 6;
    v_phase := (v_phase + 5) % 6;   -- anchor itself is phase 5

    v_morning := CASE v_phase
                   WHEN 0 THEN 'cnicolas@icealarm.es'
                   WHEN 5 THEN 'cnicolas@icealarm.es'
                   ELSE      'mbonner@icealarm.es'
                 END;
    v_afternoon := CASE v_phase
                     WHEN 1 THEN 'cnicolas@icealarm.es'
                     WHEN 2 THEN 'cnicolas@icealarm.es'
                     ELSE      'asoares@icealarm.es'
                   END;

    -- Morning, afternoon, night. Guarded, so nothing existing is touched.
    INSERT INTO public.staff_shifts (staff_id, shift_date, shift_type, start_time, end_time, is_confirmed)
    SELECT s.id, v_day, x.shift_type, x.start_time, x.end_time, false
    FROM (VALUES
            (v_morning,     'morning',   TIME '07:00', TIME '15:00'),
            (v_afternoon,   'afternoon', TIME '15:00', TIME '23:00'),
            (v_night_email, 'night',     TIME '23:00', TIME '07:00')
         ) AS x(email, shift_type, start_time, end_time)
    JOIN public.staff s ON lower(s.email) = lower(x.email)
    -- The guard is on the SLOT (date, type), not on (person, date, type).
    --
    -- This is the difference between "never overwrites" and "never breaks the rota", and the
    -- first draft got it wrong. Guarding per-person let the generator add Mary's morning to a
    -- day where a hand-made swap had already given that morning to Albert: nothing was
    -- overwritten, and the day ended up with TWO mornings. A filled slot is somebody's
    -- decision, so it is left exactly as it is and the cycle's candidate for it is dropped.
    WHERE NOT EXISTS (
      SELECT 1 FROM public.staff_shifts ex
      WHERE ex.shift_date = v_day AND ex.shift_type = x.shift_type
    );

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_created := v_created + v_inserted;

    -- A generated day cannot itself double anyone (one morning, one afternoon, one night, three
    -- different people) — but it can land next to an existing hand-made shift that does. Count
    -- the days where anybody now holds more than one shift, and report.
    IF EXISTS (
      SELECT 1 FROM public.staff_shifts
      WHERE shift_date = v_day
      GROUP BY staff_id
      HAVING count(*) > 1
    ) THEN
      v_long_days := v_long_days + 1;
    END IF;

    v_day := v_day + 1;
  END LOOP;

  RETURN QUERY SELECT
    v_created,
    (p_to_date - p_from_date + 1)::INTEGER,
    CASE WHEN v_long_days = 0 THEN NULL
         ELSE format('%s day(s) in this range give one person more than one shift. '
                     || 'Review before publishing.', v_long_days)
    END;
END
$generate_rota$;

COMMENT ON FUNCTION public.generate_rota(date, date) IS
  'Extends the six-day operator cycle plus Travis nights into [from,to]. Never overwrites an '
  'existing shift; re-running is a no-op. Returns a long-day warning rather than refusing. '
  'Does NOT write shift_escalation_chain (SOS path — see ROTA_MODEL.md §6).';

REVOKE ALL ON FUNCTION public.generate_rota(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_rota(date, date) TO authenticated;

-- ============================================================
-- 4. seed_rota_2026() — the import, as a callable, idempotent function
-- ============================================================
--
-- Counts, all recomputed from docs/rota/rota_2026_clean.csv (ROTA_MODEL.md §3):
--   staff_shifts        339   (113 days x 3; Mary 72, Albert 73, Carmen 66, Travis 128)
--   staff_holidays        9   (Albert 1 range/4 days, Mary 1/4, Carmen 7 ranges/9 days)
--   staff_shift_covers   17   (15 holiday cover, 2 knock-on with holiday_id NULL)
--   bank_holidays        14   (the whole 2026 calendar, not just the 6 inside the window)
--
-- The shift belongs to WHOEVER WORKED IT, not to whoever it nominally belonged to. The cover
-- row records whose it was. That is why Travis has 128 shifts and not 113.
--
-- `notes` is the CSV row's note, which is a DAY-level note, so it lands on all three shifts of
-- that date — 7 notes, 21 rows. That is the brief's instruction and nothing is lost by it, but
-- it is worth naming: a note reading "Carmen morning shift" sitting on Travis's night shift is
-- noise. staff_shift_swaps (§2) is what replaces free-text notes going forward.
--
-- WHY A FUNCTION AND NOT A BARE DO BLOCK
-- Three reasons, and the first is the one that matters:
--
--   1. The RLS harness applies this migration to an EMPTY database, where none of the four
--      operators exists. A bare DO block that raised on a missing staff row would fail the
--      apply and the harness would report "the migrations would not apply" — a fail-safe firing
--      for the wrong reason. As a function, the migration can call it, get "nothing to do", and
--      the harness can then create the four staff rows and call it itself to prove the counts.
--   2. Lee can re-run it. If the staff records are created AFTER the push, the seed is one
--      `SELECT public.seed_rota_2026();` away instead of a migration edit.
--   3. Idempotence becomes testable rather than asserted: call it twice, second call returns
--      zeros.
--
-- NONE PRESENT vs SOME PRESENT — the distinction is deliberate.
--   * NO operator email resolves  -> this is not the production database (a fresh CI database,
--     a scratch clone). Return zeros and say so. Seeding nothing is correct.
--   * SOME resolve but not all    -> this IS production and it is missing somebody. RAISE.
--     A rota seeded for three of four operators is worse than a push that stops and names the
--     email it could not find: the gap would be invisible on the grid and would silently mean
--     "nobody is on that shift".
--
-- NOT granted to `authenticated`. It writes shifts for four different people, so it runs as the
-- owner; the only callers are this migration and a human in the SQL editor. Withholding the
-- grant is tighter than a role check inside.

CREATE OR REPLACE FUNCTION public.seed_rota_2026()
RETURNS TABLE (
  shifts_inserted   INTEGER,
  holidays_inserted INTEGER,
  covers_inserted   INTEGER,
  banks_inserted    INTEGER,
  outcome           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $seed_rota$
DECLARE
  v_emails   TEXT[] := ARRAY['asoares@icealarm.es','cnicolas@icealarm.es',
                             'mbonner@icealarm.es','travis@icealarm.es'];
  v_found    INTEGER;
  v_missing  TEXT;
  v_reviewer UUID;
  v_shifts   INTEGER := 0;
  v_holidays INTEGER := 0;
  v_covers   INTEGER := 0;
  v_banks    INTEGER := 0;
  v_conflicts INTEGER := 0;
BEGIN
  SELECT count(*) INTO v_found
  FROM public.staff s
  WHERE lower(s.email) = ANY (SELECT lower(unnest(v_emails)));

  IF v_found = 0 THEN
    RETURN QUERY SELECT 0, 0, 0, 0,
      'skipped: none of the four operator emails exist in public.staff, so this is not the '
      || 'production database. Create the staff records and call seed_rota_2026() again.';
    RETURN;
  END IF;

  IF v_found < array_length(v_emails, 1) THEN
    SELECT string_agg(e, ', ') INTO v_missing
    FROM unnest(v_emails) AS e
    WHERE NOT EXISTS (SELECT 1 FROM public.staff s WHERE lower(s.email) = lower(e));

    -- The format string of RAISE must be a single literal, not a concatenation.
    RAISE EXCEPTION 'rota seed: public.staff has some operators but not %s. Create the missing staff record(s) first — a rota seeded for three of four operators silently means "nobody is on that shift".', v_missing
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- ---------- staged source data ----------
  CREATE TEMP TABLE _rota_shift_seed (
    shift_date     DATE    NOT NULL,
    shift_type     TEXT    NOT NULL,
    worked_email   TEXT    NOT NULL,
    original_email TEXT,
    is_moved       BOOLEAN NOT NULL,
    note           TEXT
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _rota_holiday_seed (
    email      TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    reason     TEXT
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _rota_bank_seed (
    holiday_date DATE NOT NULL,
    name         TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _rota_shift_seed (shift_date, shift_type, worked_email, original_email, is_moved, note) VALUES
  ('2026-09-10'::date, 'morning', 'cnicolas@icealarm.es', 'mbonner@icealarm.es', false, 'in Dublin - short notice cannot be helped  - Carmen morning shift'),
  ('2026-09-10'::date, 'afternoon', 'travis@icealarm.es', 'cnicolas@icealarm.es', true, 'in Dublin - short notice cannot be helped  - Carmen morning shift'),
  ('2026-09-10'::date, 'night', 'travis@icealarm.es', NULL, false, 'in Dublin - short notice cannot be helped  - Carmen morning shift'),
  ('2026-09-11'::date, 'morning', 'cnicolas@icealarm.es', 'mbonner@icealarm.es', false, 'in Dublin - short notice cannot be helped -  Carmen morning shift'),
  ('2026-09-11'::date, 'afternoon', 'travis@icealarm.es', 'cnicolas@icealarm.es', true, 'in Dublin - short notice cannot be helped -  Carmen morning shift'),
  ('2026-09-11'::date, 'night', 'travis@icealarm.es', NULL, false, 'in Dublin - short notice cannot be helped -  Carmen morning shift'),
  ('2026-09-12'::date, 'morning', 'travis@icealarm.es', 'mbonner@icealarm.es', false, 'in Dublin - short notice cannot be helped'),
  ('2026-09-12'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, 'in Dublin - short notice cannot be helped'),
  ('2026-09-12'::date, 'night', 'travis@icealarm.es', NULL, false, 'in Dublin - short notice cannot be helped'),
  ('2026-09-13'::date, 'morning', 'travis@icealarm.es', 'mbonner@icealarm.es', false, 'in Dublin - short notice cannot be helped'),
  ('2026-09-13'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, 'in Dublin - short notice cannot be helped'),
  ('2026-09-13'::date, 'night', 'travis@icealarm.es', NULL, false, 'in Dublin - short notice cannot be helped'),
  ('2026-09-14'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-14'::date, 'afternoon', 'travis@icealarm.es', 'asoares@icealarm.es', false, NULL),
  ('2026-09-14'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-15'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-15'::date, 'afternoon', 'travis@icealarm.es', 'asoares@icealarm.es', false, NULL),
  ('2026-09-15'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-16'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-09-16'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-16'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-17'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-09-17'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-17'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-18'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-09-18'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-09-18'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-19'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-09-19'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-09-19'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-20'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-20'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-09-20'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-21'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-21'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-09-21'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-22'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-09-22'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-22'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-23'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-09-23'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-23'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-24'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-09-24'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-09-24'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-25'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-09-25'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-09-25'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-26'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-26'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-09-26'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-27'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-27'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-09-27'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-28'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-09-28'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-28'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-29'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-09-29'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-09-29'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-09-30'::date, 'morning', 'mbonner@icealarm.es', NULL, false, '****** swap - Carmen afternoon shit'),
  ('2026-09-30'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, '****** swap - Carmen afternoon shit'),
  ('2026-09-30'::date, 'night', 'travis@icealarm.es', NULL, false, '****** swap - Carmen afternoon shit'),
  ('2026-10-01'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-01'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-01'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-02'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-02'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-02'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-03'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-03'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-03'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-04'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-04'::date, 'afternoon', 'travis@icealarm.es', 'cnicolas@icealarm.es', false, NULL),
  ('2026-10-04'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-05'::date, 'morning', 'mbonner@icealarm.es', NULL, false, '******* swap - Albert afternoon shit'),
  ('2026-10-05'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, '******* swap - Albert afternoon shit'),
  ('2026-10-05'::date, 'night', 'travis@icealarm.es', NULL, false, '******* swap - Albert afternoon shit'),
  ('2026-10-06'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-06'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-06'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-07'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-07'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-07'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-08'::date, 'morning', 'travis@icealarm.es', 'cnicolas@icealarm.es', false, NULL),
  ('2026-10-08'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-08'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-09'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-09'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-09'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-10'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-10'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-10'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-11'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-11'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-11'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-12'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-12'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-12'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-13'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-13'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-13'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-14'::date, 'morning', 'travis@icealarm.es', 'cnicolas@icealarm.es', false, NULL),
  ('2026-10-14'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-14'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-15'::date, 'morning', 'travis@icealarm.es', 'cnicolas@icealarm.es', false, NULL),
  ('2026-10-15'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-15'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-16'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-16'::date, 'afternoon', 'travis@icealarm.es', 'cnicolas@icealarm.es', false, NULL),
  ('2026-10-16'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-17'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-17'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-17'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-18'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-18'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-18'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-19'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-19'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-19'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-20'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-20'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-20'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-21'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-21'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-21'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-22'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-22'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-22'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-23'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-23'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-23'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-24'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-24'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-24'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-25'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-25'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-25'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-26'::date, 'morning', 'travis@icealarm.es', 'cnicolas@icealarm.es', false, NULL),
  ('2026-10-26'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-26'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-27'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-27'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-27'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-28'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-28'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-28'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-29'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-29'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-10-29'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-30'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-30'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-30'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-10-31'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-10-31'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-10-31'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-01'::date, 'morning', 'travis@icealarm.es', 'cnicolas@icealarm.es', false, '*'),
  ('2026-11-01'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, '*'),
  ('2026-11-01'::date, 'night', 'travis@icealarm.es', NULL, false, '*'),
  ('2026-11-02'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-02'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-02'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-03'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-03'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-03'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-04'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-04'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-04'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-05'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-05'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-05'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-06'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-06'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-06'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-07'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-07'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-07'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-08'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-08'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-08'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-09'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-09'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-09'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-10'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-10'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-10'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-11'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-11'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-11'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-12'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-12'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-12'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-13'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-13'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-13'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-14'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-14'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-14'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-15'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-15'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-15'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-16'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-16'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-16'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-17'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-17'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-17'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-18'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-18'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-18'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-19'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-19'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-19'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-20'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-20'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-20'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-21'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-21'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-21'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-22'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-22'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-22'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-23'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-23'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-23'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-24'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-24'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-24'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-25'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-25'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-25'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-26'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-26'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-26'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-27'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-27'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-27'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-28'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-28'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-11-28'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-29'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-29'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-29'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-11-30'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-11-30'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-11-30'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-01'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-01'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-01'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-02'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-02'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-02'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-03'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-03'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-03'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-04'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-04'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-04'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-05'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-05'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-05'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-06'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-06'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-06'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-07'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-07'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-07'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-08'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-08'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-08'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-09'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-09'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-09'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-10'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-10'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-10'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-11'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-11'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-11'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-12'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-12'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-12'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-13'::date, 'morning', 'travis@icealarm.es', 'cnicolas@icealarm.es', false, NULL),
  ('2026-12-13'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-13'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-14'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-14'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-14'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-15'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-15'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-15'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-16'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-16'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-16'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-17'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-17'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-17'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-18'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-18'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-18'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-19'::date, 'morning', 'travis@icealarm.es', 'cnicolas@icealarm.es', false, NULL),
  ('2026-12-19'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-19'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-20'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-20'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-20'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-21'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-21'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-21'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-22'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-22'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-22'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-23'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-23'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-23'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-24'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-24'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-24'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-25'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-25'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-25'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-26'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-26'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-26'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-27'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-27'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-27'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-28'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-28'::date, 'afternoon', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-28'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-29'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-29'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-29'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-30'::date, 'morning', 'mbonner@icealarm.es', NULL, false, NULL),
  ('2026-12-30'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-30'::date, 'night', 'travis@icealarm.es', NULL, false, NULL),
  ('2026-12-31'::date, 'morning', 'cnicolas@icealarm.es', NULL, false, NULL),
  ('2026-12-31'::date, 'afternoon', 'asoares@icealarm.es', NULL, false, NULL),
  ('2026-12-31'::date, 'night', 'travis@icealarm.es', NULL, false, NULL)  ;

  INSERT INTO _rota_holiday_seed (email, start_date, end_date, reason) VALUES
  ('asoares@icealarm.es', '2026-09-14'::date, '2026-09-17'::date, NULL),
  ('cnicolas@icealarm.es', '2026-10-04'::date, '2026-10-04'::date, NULL),
  ('cnicolas@icealarm.es', '2026-10-08'::date, '2026-10-08'::date, NULL),
  ('cnicolas@icealarm.es', '2026-10-14'::date, '2026-10-16'::date, NULL),
  ('cnicolas@icealarm.es', '2026-10-26'::date, '2026-10-26'::date, NULL),
  ('cnicolas@icealarm.es', '2026-11-01'::date, '2026-11-01'::date, NULL),
  ('cnicolas@icealarm.es', '2026-12-13'::date, '2026-12-13'::date, NULL),
  ('cnicolas@icealarm.es', '2026-12-19'::date, '2026-12-19'::date, NULL),
  ('mbonner@icealarm.es', '2026-09-10'::date, '2026-09-13'::date, 'in Dublin - short notice cannot be helped')  ;

  INSERT INTO _rota_bank_seed (holiday_date, name) VALUES
  ('2026-01-01'::date, 'Año Nuevo'),
  ('2026-01-06'::date, 'Epifanía del Señor'),
  ('2026-02-28'::date, 'Día de Andalucía'),
  ('2026-04-02'::date, 'Jueves Santo'),
  ('2026-04-03'::date, 'Viernes Santo'),
  ('2026-05-01'::date, 'Día del Trabajo'),
  ('2026-07-16'::date, 'Virgen del Carmen'),
  ('2026-08-15'::date, 'Asunción de la Virgen'),
  ('2026-09-29'::date, 'San Miguel'),
  ('2026-10-12'::date, 'Fiesta Nacional de España'),
  ('2026-11-02'::date, 'Todos los Santos (trasladado)'),
  ('2026-12-07'::date, 'Día de la Constitución (trasladado)'),
  ('2026-12-08'::date, 'Inmaculada Concepción'),
  ('2026-12-25'::date, 'Navidad')  ;

  -- The reviewer of the imported holidays, resolved BY ROLE rather than by name: CLAUDE.md
  -- forbids per-entity one-off code, and hardcoding an email here would rot the day Lee's
  -- address changes. NULL is acceptable — reviewed_by is nullable — and only means the import
  -- does not claim a named human approved these.
  SELECT id INTO v_reviewer
  FROM public.staff
  WHERE role = 'super_admin' AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  -- ---------- bank holidays ----------
  INSERT INTO public.bank_holidays (holiday_date, name)
  SELECT b.holiday_date, b.name
  FROM _rota_bank_seed b
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bank_holidays x WHERE x.holiday_date = b.holiday_date
  );
  GET DIAGNOSTICS v_banks = ROW_COUNT;

  -- ---------- shifts ----------
  INSERT INTO public.staff_shifts
    (staff_id, shift_date, shift_type, start_time, end_time, is_confirmed, notes)
  SELECT
    s.id,
    z.shift_date,
    z.shift_type,
    CASE z.shift_type WHEN 'morning'   THEN TIME '07:00'
                      WHEN 'afternoon' THEN TIME '15:00'
                      ELSE                  TIME '23:00' END,
    CASE z.shift_type WHEN 'morning'   THEN TIME '15:00'
                      WHEN 'afternoon' THEN TIME '23:00'
                      ELSE                  TIME '07:00' END,
    true,
    z.note
  FROM _rota_shift_seed z
  JOIN public.staff s ON lower(s.email) = lower(z.worked_email)
  -- Slot-level guard, same reasoning as generate_rota: a (date, type) that is already filled is
  -- left alone, so the seed can never produce a day with two mornings.
  WHERE NOT EXISTS (
    SELECT 1 FROM public.staff_shifts ex
    WHERE ex.shift_date = z.shift_date AND ex.shift_type = z.shift_type
  );
  GET DIAGNOSTICS v_shifts = ROW_COUNT;

  -- Skipping silently would be wrong the one time it matters. If a slot inside the import
  -- window is already held by SOMEBODY ELSE, the sheet and the database disagree about who
  -- worked it, and a human has to decide — so it is counted and reported rather than
  -- overwritten (which would destroy a real record) or ignored (which would hide the conflict).
  SELECT count(*) INTO v_conflicts
  FROM _rota_shift_seed z
  JOIN public.staff want ON lower(want.email) = lower(z.worked_email)
  JOIN public.staff_shifts ex
    ON ex.shift_date = z.shift_date AND ex.shift_type = z.shift_type
  WHERE ex.staff_id <> want.id;

  -- ---------- holidays ----------
  INSERT INTO public.staff_holidays
    (staff_id, start_date, end_date, reason, status, reviewed_by, reviewed_at)
  SELECT s.id, h.start_date, h.end_date, h.reason, 'approved', v_reviewer, now()
  FROM _rota_holiday_seed h
  JOIN public.staff s ON lower(s.email) = lower(h.email)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.staff_holidays ex
    WHERE ex.staff_id = s.id AND ex.start_date = h.start_date AND ex.end_date = h.end_date
  );
  GET DIAGNOSTICS v_holidays = ROW_COUNT;

  -- ---------- covers ----------
  -- holiday_id links the cover to the absence that caused it — but ONLY when the original
  -- person was actually on holiday that day. The two "(moved)" rows are Carmen vacating her own
  -- afternoon to cover Mary's morning; Carmen is not on holiday, so those get holiday_id NULL.
  -- Inferring a holiday there would invent an absence that never happened (ROTA_MODEL.md §2-B).
  --
  -- HONESTY ABOUT `z.is_moved = false`: for the 2026 data it is REDUNDANT. Carmen has no
  -- holiday range covering 09-10 or 09-11, so the date-overlap condition alone already fails
  -- and holiday_id would be NULL without it — deleting the line leaves the suite green. It is
  -- kept because it states the actual rule (a shift somebody MOVED off is not evidence they
  -- were absent) rather than relying on a coincidence in one year's sheet. The harness proves
  -- the semantic rather than the line: injecting a Carmen holiday across 09-10..11 and removing
  -- this condition turns the "exactly 2 covers with holiday_id NULL" assertion red.
  INSERT INTO public.staff_shift_covers
    (shift_id, holiday_id, original_staff_id, cover_staff_id, status, requested_by, responded_at)
  SELECT sh.id, hol.id, orig.id, cov.id, 'accepted', v_reviewer, now()
  FROM _rota_shift_seed z
  JOIN public.staff cov  ON lower(cov.email)  = lower(z.worked_email)
  JOIN public.staff orig ON lower(orig.email) = lower(z.original_email)
  JOIN public.staff_shifts sh
    ON sh.staff_id = cov.id AND sh.shift_date = z.shift_date AND sh.shift_type = z.shift_type
  LEFT JOIN public.staff_holidays hol
    ON hol.staff_id = orig.id
   AND z.shift_date BETWEEN hol.start_date AND hol.end_date
   AND z.is_moved = false
  WHERE z.original_email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_shift_covers ex
      WHERE ex.shift_id = sh.id AND ex.original_staff_id = orig.id
    );
  GET DIAGNOSTICS v_covers = ROW_COUNT;

  DROP TABLE _rota_shift_seed;
  DROP TABLE _rota_holiday_seed;
  DROP TABLE _rota_bank_seed;

  RETURN QUERY SELECT v_shifts, v_holidays, v_covers, v_banks,
    format('seeded (0s on a re-run): %s shifts, %s holidays, %s covers, %s bank holidays%s',
           v_shifts, v_holidays, v_covers, v_banks,
           CASE WHEN v_conflicts > 0
                THEN format('. WARNING: %s slot(s) in the window are held by someone other '
                            || 'than the sheet says; left untouched, review by hand.', v_conflicts)
                ELSE '' END);
END
$seed_rota$;

COMMENT ON FUNCTION public.seed_rota_2026() IS
  'Idempotent import of 2026-09-10..2026-12-31 from docs/rota/rota_2026_clean.csv. Returns '
  'zeros and an explanation when the operator staff rows do not exist; raises when only some '
  'of them do. Not granted to authenticated — owner and SQL editor only.';

REVOKE ALL ON FUNCTION public.seed_rota_2026() FROM PUBLIC;

-- Run it now. On a fresh/CI database this is a no-op that says so.
DO $run_seed$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.seed_rota_2026();
  RAISE NOTICE 'rota seed: %', r.outcome;
END
$run_seed$;
