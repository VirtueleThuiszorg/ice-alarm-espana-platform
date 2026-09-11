-- WHEN SANTANDER TAKES A LEGACY MEMBER'S MONEY.
--
-- 431 imported members pay outside Stripe — a standing order or an office-collected debit, on a
-- day of the month each of them has had for years. This platform has never known that day, so
-- nothing could time a switch link to it, and a switch link on the wrong day is not a cosmetic
-- problem: send it before Santander collects and the member pays twice that month; send it after
-- their renewal has passed and they have already paid for a month Stripe is about to bill again.
--
-- These two columns are what the migration runner reads to decide who to write to this week.
--
--   legacy_billing_day    1–31, the day of the month. The DAY, not a date — it repeats.
--   legacy_next_renewal   the next date money is actually due, clamped for short months.
--
-- ── WHY THE DAY IS NEVER CLAMPED IN STORAGE ───────────────────────────────────
--
-- A member whose day is the 31st has no debit on 31 February; Santander takes it on the last day
-- of the month. `legacy_next_renewal` therefore holds 28 (or 29) February for them — but
-- `legacy_billing_day` still holds 31, because clamping on write would turn them into a 28th
-- member forever after one February. The clamp lives in `src/lib/legacyBillingSchedule.ts`, which
-- is the one implementation of the rule; there is deliberately no second copy of it in SQL.
--
-- ── AND THERE IS DELIBERATELY NO BACKFILL ─────────────────────────────────────
--
-- `subscriptions.monthly_payment_date` holds Karma's column verbatim as TEXT ("15", "15th",
-- "15/03/2019", "monthly", ""). Parsing that in SQL would be a SECOND implementation of the date
-- rule, and the two would disagree on exactly the rows nobody checks. Instead:
--
--   * the CRM import derives both columns as it writes (it patches existing members, so a
--     re-run fills them for anybody already imported), and
--   * everybody it cannot work out appears in the members list under "Needs a billing date",
--     which is a queue for a human rather than an error state.
--
-- A wrong date here costs a member a double payment. A missing one costs an office phone call.
--
-- ── AND A MEMBER MAY NOT WRITE THEIR OWN ──────────────────────────────────────
--
-- `Members can update own profile` is an UPDATE policy with no column list, so a member reaching
-- PostgREST directly could write any column on their own row that no trigger defends. For these
-- it matters: pushing your own `legacy_next_renewal` out a year is a year of monitoring nobody
-- is billing for, and flipping your own `billing_source` to `legacy` exempts you from renewal and
-- payment-failed chasing entirely — golden rule 3's reasoning ("no client-writable tiers")
-- applied to the columns that decide who gets charged. Staff and service_role are unaffected.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS guard_member_billing_self_write ON public.members;
--   DROP FUNCTION IF EXISTS public.guard_member_billing_self_write();
--   DROP INDEX IF EXISTS public.members_legacy_renewal_idx;
--   DROP INDEX IF EXISTS public.members_legacy_needs_date_idx;
--   ALTER TABLE public.members DROP COLUMN IF EXISTS legacy_next_renewal;
--   ALTER TABLE public.members DROP COLUMN IF EXISTS legacy_billing_day;

-- ── 1. the columns ────────────────────────────────────────────────────────────
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS legacy_billing_day  integer,
  ADD COLUMN IF NOT EXISTS legacy_next_renewal date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_legacy_billing_day_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_legacy_billing_day_check
      CHECK (legacy_billing_day IS NULL OR (legacy_billing_day BETWEEN 1 AND 31));
  END IF;
END $$;

COMMENT ON COLUMN public.members.legacy_billing_day IS
  'Day of the month (1-31) Santander collects from this legacy member. NULL means nobody has '
  'worked it out yet, which is a queue for staff, not an error. Never clamped on write: a 31st '
  'member keeps 31 through February, and the clamp is applied when computing the next date.';

COMMENT ON COLUMN public.members.legacy_next_renewal IS
  'The next date money is due from this legacy member, clamped to the last day of a short month. '
  'The billing-migration runner reads this to time the switch link; it is meaningless for a '
  'member Stripe bills, whose dates live on subscriptions.renewal_date.';

-- ── 2. the two ways the runner and the screens read them ──────────────────────
--
-- The runner asks "who is due in the next N days", every day, for legacy members only — so the
-- index carries the predicate rather than making Postgres walk every Stripe member to find out.
CREATE INDEX IF NOT EXISTS members_legacy_renewal_idx
  ON public.members (legacy_next_renewal)
  WHERE billing_source = 'legacy';

-- "Needs a billing date" is the other half of the same screen, and it is the rows this index is
-- smallest for: the ones still missing a day.
CREATE INDEX IF NOT EXISTS members_legacy_needs_date_idx
  ON public.members (billing_source)
  WHERE billing_source = 'legacy' AND legacy_billing_day IS NULL;

-- ── 3. a member may not bill themselves ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_member_billing_self_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $guard$
BEGIN
  IF NEW.billing_source     IS NOT DISTINCT FROM OLD.billing_source
 AND NEW.legacy_billing_day IS NOT DISTINCT FROM OLD.legacy_billing_day
 AND NEW.legacy_next_renewal IS NOT DISTINCT FROM OLD.legacy_next_renewal THEN
    RETURN NEW;
  END IF;

  -- service_role: the payment webhook, the import, the runner, a migration. No auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Staff correct these by hand — that is the whole point of the editable card — and every such
  -- edit is written to activity_logs by the caller.
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'members.billing_source, legacy_billing_day and legacy_next_renewal are not self-writable (member %)', NEW.id
    USING ERRCODE = 'insufficient_privilege';
END
$guard$;

COMMENT ON FUNCTION public.guard_member_billing_self_write() IS
  'Refuses a member writing the columns that decide whether and when they are billed. Staff and '
  'service_role pass through; an authenticated non-staff write to billing_source, '
  'legacy_billing_day or legacy_next_renewal is refused regardless of the row-level policy.';

DROP TRIGGER IF EXISTS guard_member_billing_self_write ON public.members;
CREATE TRIGGER guard_member_billing_self_write
  BEFORE UPDATE OF billing_source, legacy_billing_day, legacy_next_renewal ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_member_billing_self_write();
