-- Spanish holiday-law compliance (Estatuto de los Trabajadores, art. 38):
-- statutory minimum is 30 NATURAL (calendar) days of holiday per year.
-- Our allowance was defaulting to 22 while deduction is calendar-day based
-- (holiday total_days = end_date - start_date + 1, a GENERATED column in
-- 20260301153008) — 22 natural days is below the legal minimum.
--
-- 1. New staff default: 30.
ALTER TABLE public.staff
  ALTER COLUMN annual_holiday_days SET DEFAULT 30;

-- 2. Existing rows: only those still on the old DEFAULT (22) or never set
--    (NULL). Anyone manually set to another value (convenio/seniority
--    extras, part-time proration) is deliberately untouched.
UPDATE public.staff
  SET annual_holiday_days = 30
  WHERE annual_holiday_days = 22 OR annual_holiday_days IS NULL;

-- NOTE: the deduction model stays natural-day based on purpose — días
-- naturales is exactly what art. 38 prescribes. Do NOT convert to working
-- days without legal review.
--
-- Rollback: ALTER TABLE public.staff ALTER COLUMN annual_holiday_days SET DEFAULT 22;
-- (Row values are not automatically revertible — the 22→30 rows are not
-- distinguishable from genuine 30s afterwards; reverting the default alone
-- restores prior behaviour for new rows.)
