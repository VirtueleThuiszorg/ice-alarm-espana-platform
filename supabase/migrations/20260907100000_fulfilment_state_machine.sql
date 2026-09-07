-- WP2 increments 3 and 4 — the fulfilment state machine, and readiness's second condition.
--
-- Design and reasoning: FULFILMENT_MODEL.md (§2 the six states, §3 why a new column, §4 the
-- commission hazard, §5 the readiness change, §6 this increment, §7 the negative assertions).
-- Lee's rulings on §9, 2026-09-07: Q1 operator-confirmed only (no member self-report);
-- Q2 YES — a replaced or faulty pendant drops readiness until re-tested; Q3 REFUSE a backward
-- move out of `delivered` once the commission is released or paid; Q4 (re-test cadence) parked.
--
-- WHY A TRIGGER AND NOT APPLICATION CODE. `useOrderActions.updateOrderStatus` writes a status
-- without looking at the previous one, without checking who is asking, and without any ordering.
-- RLS decides WHETHER you may write the row, never WHICH VALUE you may write — so D9 ("only
-- call_centre_supervisor, admin and super_admin may move backwards") cannot live in a React
-- hook. Anyone with a session and the anon key can PATCH /rest/v1/orders?id=eq.… with any value
-- in the enum. A rule you can go around is not a rule. FULFILMENT_MODEL.md §1-E.
--
-- ROLLBACK (reversible, in this order):
--   DROP TRIGGER IF EXISTS trg_orders_fulfilment_state ON public.orders;
--   DROP FUNCTION IF EXISTS public.enforce_fulfilment_state();
--   DROP FUNCTION IF EXISTS public.fulfilment_state_rank(public.fulfilment_state);
--   DROP FUNCTION IF EXISTS public.may_reverse_fulfilment();
--   DROP FUNCTION IF EXISTS public.get_staff_id(uuid);
--   ALTER TABLE public.orders
--     DROP COLUMN fulfilment_state, DROP COLUMN allocated_at, DROP COLUMN programmed_at,
--     DROP COLUMN programmed_by, DROP COLUMN tested_at, DROP COLUMN tested_by;
--   DROP TYPE IF EXISTS public.fulfilment_state;
--   -- then re-create the previous readiness view from 20260904120000.
-- Drops no pre-existing data: every column and the type are new here. `orders.status`,
-- which is load-bearing for the €50 commission, is not touched (§3).

-- ── the states ─────────────────────────────────────────────────────────────
CREATE TYPE public.fulfilment_state AS ENUM
  ('paid', 'allocated', 'programmed', 'dispatched', 'delivered', 'tested');

COMMENT ON TYPE public.fulfilment_state IS
  'Physical fulfilment of a pendant order, separate from orders.status (which is load-bearing '
  'for partner commission). `tested` means a person pressed the button in the home they will '
  'use it in and an operator answered. FULFILMENT_MODEL.md §2.';

-- ── the columns ────────────────────────────────────────────────────────────
-- DEFAULT 'paid' and NOT NULL: every existing order is at least paid, and the backfill is
-- therefore honest rather than invented. Nothing is backfilled to `tested` — that would be
-- fabricating evidence that somebody pressed a button (FULFILMENT_MODEL.md §5).
ALTER TABLE public.orders
  ADD COLUMN fulfilment_state public.fulfilment_state NOT NULL DEFAULT 'paid',
  ADD COLUMN allocated_at  timestamptz,
  ADD COLUMN programmed_at timestamptz,
  -- ON DELETE SET NULL on both staff references, for the reason argued in #176: these are
  -- audit columns. Losing WHO is recoverable; losing WHETHER is not.
  ADD COLUMN programmed_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN tested_at     timestamptz,
  ADD COLUMN tested_by     uuid REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_fulfilment_state ON public.orders(fulfilment_state);
-- The readiness view asks "has this member an order in `tested`" per member.
CREATE INDEX idx_orders_member_fulfilment ON public.orders(member_id, fulfilment_state);

COMMENT ON COLUMN public.orders.fulfilment_state IS
  'Where this order is in the physical fulfilment sequence. Moved only through '
  'enforce_fulfilment_state(); see FULFILMENT_MODEL.md §2.';
COMMENT ON COLUMN public.orders.tested_at IS
  'When an operator confirmed a successful in-home test. Q1 (Lee, 2026-09-07): operator-'
  'confirmed only — a member cannot self-report a test.';

-- ── rank, so "one step" and "backwards" are arithmetic, not string comparison ──
CREATE OR REPLACE FUNCTION public.fulfilment_state_rank(s public.fulfilment_state)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'paid'       THEN 1
    WHEN 'allocated'  THEN 2
    WHEN 'programmed' THEN 3
    WHEN 'dispatched' THEN 4
    WHEN 'delivered'  THEN 5
    WHEN 'tested'     THEN 6
  END
$$;

-- ── D9: who may correct a state backwards ──────────────────────────────────
-- auth.uid() IS NULL means no end-user JWT: the service role (post-payment.ts, which owns
-- `paid → allocated`) or a migration. Those are allowed. It is deliberately NOT enough to be
-- unauthenticated: `current_user` must not be one of PostgREST's request roles, so an anon or
-- authenticated request with no `sub` claim cannot slip through this branch.
CREATE OR REPLACE FUNCTION public.may_reverse_fulfilment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (auth.uid() IS NULL AND current_user NOT IN ('authenticated', 'anon'))
    OR public.get_staff_role(auth.uid())
         IN ('call_centre_supervisor', 'admin', 'super_admin')
$$;

COMMENT ON FUNCTION public.may_reverse_fulfilment() IS
  'D9: only call_centre_supervisor, admin and super_admin may move a fulfilment state '
  'backwards. The service role may too, since it has no JWT and owns paid → allocated.';

-- ── who is acting ──────────────────────────────────────────────────────────
-- The mirror of the existing get_member_id(). Needed because the stamping below records the
-- staff row, not the auth user: `tested_by` is the evidence that a NAMED OPERATOR answered,
-- and staff.id is what every other audit column in this schema points at.
CREATE OR REPLACE FUNCTION public.get_staff_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.staff WHERE user_id = _user_id AND is_active = true LIMIT 1
$$;

-- ── the rule ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_fulfilment_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_rank integer := public.fulfilment_state_rank(OLD.fulfilment_state);
  new_rank integer := public.fulfilment_state_rank(NEW.fulfilment_state);
  blocking_status public.commission_status;
BEGIN
  IF NEW.fulfilment_state = OLD.fulfilment_state THEN
    RETURN NEW;
  END IF;

  IF new_rank > old_rank THEN
    -- Forward, one step only. Skipping is refused because each state is a claim somebody
    -- could check (§2); allowing paid → dispatched asserts three of them at once with
    -- evidence for none.
    IF new_rank <> old_rank + 1 THEN
      RAISE EXCEPTION
        'fulfilment_state cannot skip: % → % is % steps. Move one state at a time.',
        OLD.fulfilment_state, NEW.fulfilment_state, new_rank - old_rank
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NOT public.may_reverse_fulfilment() THEN
      RAISE EXCEPTION
        'fulfilment_state cannot be moved backwards (% → %) by this role. D9: '
        'call_centre_supervisor, admin or super_admin only.',
        OLD.fulfilment_state, NEW.fulfilment_state
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- §4 — THE HAZARD. `delivered` is what creates the €50 partner commission, and
    -- process-commissions cancels a pending_release commission ONLY if the order reads
    -- `cancelled`. An order corrected out of `delivered` is not cancelled — it is simply not
    -- delivered — so without this the €50 releases seven days later and is paid for a
    -- delivery that never happened.
    IF OLD.fulfilment_state = 'delivered' THEN
      -- Q3 (Lee, 2026-09-07): once the money has moved, refuse the correction rather than
      -- silently reversing it. Reversing a released or paid commission is a finance decision,
      -- not a data correction.
      SELECT pc.status INTO blocking_status
      FROM public.partner_commissions pc
      WHERE pc.order_id = NEW.id
        AND pc.status IN ('approved', 'paid')
      LIMIT 1;

      IF blocking_status IS NOT NULL THEN
        RAISE EXCEPTION
          'cannot move order out of delivered: its partner commission is already %. '
          'Reversing a commission that has been released or paid is a finance decision. '
          'Cancel or claw back the commission first.',
          blocking_status
          USING ERRCODE = 'check_violation';
      END IF;

      -- A partial correction that leaves the money moving is worse than refusing the
      -- correction, so this happens in the same transaction as the state change.
      UPDATE public.partner_commissions
         SET status = 'cancelled',
             cancel_reason = format(
               'order moved out of delivered (%s → %s) at %s',
               OLD.fulfilment_state, NEW.fulfilment_state, now())
       WHERE order_id = NEW.id
         AND status = 'pending_release';
    END IF;
  END IF;

  -- ── stamping, server-side ────────────────────────────────────────────────
  -- These moved out of useOrderActions: a timestamp written by the client is a timestamp the
  -- client can lie about, and `tested_by` in particular is the evidence that a named operator
  -- answered. COALESCE so a supervisor correcting a state does not erase the original stamp
  -- unless the state genuinely re-enters.
  IF NEW.fulfilment_state = 'allocated' THEN
    NEW.allocated_at := COALESCE(NEW.allocated_at, now());
  ELSIF NEW.fulfilment_state = 'programmed' THEN
    NEW.programmed_at := COALESCE(NEW.programmed_at, now());
    NEW.programmed_by := COALESCE(NEW.programmed_by, public.get_staff_id(auth.uid()));
  ELSIF NEW.fulfilment_state = 'dispatched' THEN
    NEW.shipped_at := COALESCE(NEW.shipped_at, now());
  ELSIF NEW.fulfilment_state = 'delivered' THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, now());
  ELSIF NEW.fulfilment_state = 'tested' THEN
    NEW.tested_at := COALESCE(NEW.tested_at, now());
    NEW.tested_by := COALESCE(NEW.tested_by, public.get_staff_id(auth.uid()));
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_orders_fulfilment_state
  BEFORE UPDATE OF fulfilment_state ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_fulfilment_state();
