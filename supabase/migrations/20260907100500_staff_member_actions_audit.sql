-- WP7 — staff actions on a member's subscription: renew, single↔couple, add pendant, pause,
-- cancel. All of them go through Stripe, and all of them must be attributed with a REASON.
--
-- WHAT THIS DOES AND DOES NOT DO. It does not move money and it does not touch
-- stripe-webhook or create-checkout. It makes the RECORD of these actions possible and
-- mandatory: an enum of the actions, a reason column, and a trigger that refuses to log one
-- of them anonymously or without a reason.
--
-- WHY A REASON IS MANDATORY, in the database rather than in a form. These five actions change
-- what a vulnerable person is paying and what protection they have. "Who cancelled this
-- member, and why?" is the first question anyone will ask afterwards, and a nullable column on
-- a form nobody validated is how it becomes unanswerable. activity_logs already records the
-- actor (staff_id) and the diff (old_values/new_values); what it has never had is WHY, and for
-- an ordinary CRUD edit that is fine. For these five it is not.
--
-- GOLDEN RULE 4 IS NOT WEAKENED. Nothing here activates anybody. The subscription change still
-- happens through Stripe and lands via the webhook; this is the audit trail beside it.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_activity_logs_member_action ON public.activity_logs;
--   DROP FUNCTION IF EXISTS public.enforce_member_action_attribution();
--   ALTER TABLE public.activity_logs
--     DROP COLUMN IF EXISTS reason, DROP COLUMN IF EXISTS member_action;
--   DROP TYPE IF EXISTS public.member_action;
--   Drops no pre-existing data: both columns and the type are new here.

CREATE TYPE public.member_action AS ENUM (
  'renew',
  'switch_to_single',
  'switch_to_couple',
  'add_pendant',
  'pause',
  'cancel'
);

COMMENT ON TYPE public.member_action IS
  'Staff-initiated changes to a member''s subscription. Each goes through Stripe; each is '
  'logged in activity_logs with an actor and a reason. WP7.';

ALTER TABLE public.activity_logs
  -- NULL for every ordinary log row. Non-null marks this row as one of the five, and the
  -- trigger below then demands the rest.
  ADD COLUMN IF NOT EXISTS member_action public.member_action,
  ADD COLUMN IF NOT EXISTS reason text;

CREATE INDEX IF NOT EXISTS idx_activity_logs_member_action
  ON public.activity_logs(member_action, created_at DESC)
  WHERE member_action IS NOT NULL;

COMMENT ON COLUMN public.activity_logs.reason IS
  'Why a staff member took this action. Mandatory for member_action rows, enforced by '
  'enforce_member_action_attribution(). Optional elsewhere.';

-- ── the rule ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_member_action_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.member_action IS NULL THEN
    RETURN NEW;   -- an ordinary log row; nothing extra is demanded of it
  END IF;

  -- A reason that is blank, or a row of spaces, is not a reason. btrim rather than <> '' so
  -- ' ' does not satisfy it.
  IF NEW.reason IS NULL OR btrim(NEW.reason) = '' THEN
    RAISE EXCEPTION
      'activity_logs.reason is required for member_action=%: "who cancelled this member, and '
      'why?" must be answerable from the log alone',
      NEW.member_action
      USING ERRCODE = 'check_violation';
  END IF;

  -- Attribution. The service role has no auth.uid() (a webhook or a migration writing
  -- history), and those rows must still name the staff member on whose behalf they were
  -- written — so staff_id is demanded of everyone, not resolved silently from the JWT.
  IF NEW.staff_id IS NULL THEN
    RAISE EXCEPTION
      'activity_logs.staff_id is required for member_action=%: an unattributed subscription '
      'change is not an audit record',
      NEW.member_action
      USING ERRCODE = 'check_violation';
  END IF;

  -- These are always about a member, so the log must point at one.
  IF NEW.entity_type IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION
      'activity_logs.entity_type must be ''member'' for member_action=% (got %)',
      NEW.member_action, NEW.entity_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_activity_logs_member_action
  BEFORE INSERT OR UPDATE ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_member_action_attribution();
