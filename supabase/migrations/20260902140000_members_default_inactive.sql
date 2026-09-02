-- ═══════════════════════════════════════════════════════════════════════════
-- members.status must default to 'inactive', not 'active'
--
-- Golden rule #4: a member is activated by the payment webhook and by nothing
-- else. The column has defaulted to 'active' since the first migration
-- (20260121143325), which means any INSERT that simply forgets to name the
-- column creates a fully active member — monitored, billable, and never paid
-- for. The rule was being enforced in application code while the schema quietly
-- disagreed with it.
--
-- SAFE: nothing relies on the old default today. Verified across the tree:
--   * submit_registration_atomic names the column explicitly and inserts
--     'inactive' for the primary member and the partner member; test mode and
--     the payment webhook are what later UPDATE it to 'active'. Unchanged.
--   * The only other INSERT into members is the partner ResidentialDashboard's
--     "add resident", which named 'active' explicitly. That literal is removed
--     in the same commit, so it now inherits this default and fails safe. (The
--     broader partner→member design is still open — see clientWriteSweep.)
--
-- This changes the DEFAULT only. No existing row is touched: every member who
-- is active today stays active. A backfill here would be the opposite of the
-- point — it would deactivate paying members.
--
-- Reversal, if it is ever wanted:
--   ALTER TABLE public.members ALTER COLUMN status SET DEFAULT 'active';
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.members
  ALTER COLUMN status SET DEFAULT 'inactive';

COMMENT ON COLUMN public.members.status IS
  'Lifecycle state. Defaults to inactive: activation is the payment webhook''s job '
  '(golden rule #4). Never default this to active — an INSERT that omits the '
  'column would then create a monitored, billable member nobody paid for.';

DO $$
DECLARE
  d text;
BEGIN
  SELECT column_default INTO d
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'status';

  IF d IS NULL OR d NOT LIKE '%inactive%' THEN
    RAISE EXCEPTION 'members.status default did not take: %', COALESCE(d, '<null>');
  END IF;

  RAISE NOTICE 'members.status now defaults to inactive (%)', d;
END
$$;
