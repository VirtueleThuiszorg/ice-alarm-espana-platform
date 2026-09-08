-- Join-path schema, part 5 of the held bundle: wiring `awaiting_payment` in (item 7, F14).
--
-- Three things, in this order: the rank, the default, and the backfill. Plus one rule the state
-- makes possible for the first time.
--
-- WHY ENTERING `paid` NOW NEEDS AUTHORITY AND A REASON. Until this migration there was nothing
-- below `paid`, so "entering paid" did not exist as a move — an order started there. Now it does
-- exist, and it is a CLAIM THAT MONEY ARRIVED. Left ungoverned, a staff member could walk an
-- abandoned checkout from `awaiting_payment` to `paid` and on through fulfilment, which is a free
-- membership granted by a dropdown. So the move is folded into the same machinery as a
-- correction: a D9 role (or the service role, which has no JWT) and a NEW reason, with an
-- activity_logs row. `post-payment.ts` supplies both — its reason names the payment — so the
-- audit trail gains a line saying which payment moved which order, which it did not have before.
--
-- The UI mirror in src/lib/fulfilmentState.ts is updated in the same PR, with a contract test
-- asserting the two agree. A screen that thinks a move is free while the trigger demands a
-- reason is a database error shown to an operator mid-shift.
--
-- ROLLBACK:
--   ALTER TABLE public.orders ALTER COLUMN fulfilment_state SET DEFAULT 'paid';
--   -- then re-create fulfilment_state_rank() and enforce_fulfilment_state() from
--   -- 20260907100000 / 20260907110100 verbatim.
--   The backfill is NOT reversed: it replaces a state that asserts a payment nobody made with
--   one that does not, and restoring 'paid' everywhere would be restoring the defect.

-- ── the rank ───────────────────────────────────────────────────────────────
-- RENUMBERED 1-7 rather than slotting the new state in at 0.
--
-- The trigger only ever compares ranks to each other (`new_rank = old_rank + 1`), so 0 would
-- have worked and left the six existing numbers untouched. What it would NOT have left alone is
-- the mirror: `fulfilmentRank()` in src/lib/fulfilmentState.ts is `FULFILMENT_SEQUENCE.indexOf()
-- + 1`, and src/test/fulfilmentStateContract.test.ts asserts the two agree NUMERICALLY, WHEN by
-- WHEN, against this function's text. A 0 here makes every number in the mirror disagree by one
-- — which the contract test caught immediately, and which is exactly the drift it exists to stop.
-- Keeping both 1-based costs a six-line edit and keeps the mirror literal.
CREATE OR REPLACE FUNCTION public.fulfilment_state_rank(s public.fulfilment_state)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'awaiting_payment' THEN 1
    WHEN 'paid'       THEN 2
    WHEN 'allocated'  THEN 3
    WHEN 'programmed' THEN 4
    WHEN 'dispatched' THEN 5
    WHEN 'delivered'  THEN 6
    WHEN 'tested'     THEN 7
  END
$$;

COMMENT ON FUNCTION public.fulfilment_state_rank(public.fulfilment_state) IS
  'Position in the fulfilment sequence. NULL for `cancelled`, which is not a place on the line. '
  '`awaiting_payment` is 1: an order exists there before any money has arrived. The numbers are '
  'only ever compared to each other, but they are kept in step with fulfilmentRank() in '
  'src/lib/fulfilmentState.ts, which a contract test asserts WHEN by WHEN.';

-- ── the default ────────────────────────────────────────────────────────────
ALTER TABLE public.orders ALTER COLUMN fulfilment_state SET DEFAULT 'awaiting_payment';

COMMENT ON COLUMN public.orders.fulfilment_state IS
  'Where this order is in the physical fulfilment sequence. Starts at `awaiting_payment` — an '
  'order exists from the moment the wizard is submitted, which is before the customer has paid. '
  'The payment path moves it to `paid`. Moved only through enforce_fulfilment_state().';

-- ── the rule ───────────────────────────────────────────────────────────────
-- Whole-function replace rather than a patch: this is the fourth revision of this trigger and a
-- reader needs one authoritative copy, not three overlaid. The only changes from
-- 20260907110100 are `needs_authority` (was `is_correction`) gaining the `→ paid` clause, and
-- the messages that mention it.
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
  acting_staff uuid := public.get_staff_id(auth.uid());
  needs_authority boolean;
BEGIN
  IF NEW.fulfilment_state = OLD.fulfilment_state THEN
    RETURN NEW;
  END IF;

  -- `cancelled` is not a place in the sequence, so it has no rank. It is reachable from any
  -- state and leaving it is a correction like any other backward move. Handled before the rank
  -- arithmetic, which would otherwise compare against NULL and silently allow anything.
  --
  -- `paid` joins that list here, and not because it is backwards: it is the one forward move
  -- that ASSERTS SOMETHING ABOUT MONEY. Everything else in the sequence asserts something about
  -- a device, which a person can check by looking at it.
  needs_authority := NEW.fulfilment_state = 'cancelled'
                     OR OLD.fulfilment_state = 'cancelled'
                     OR NEW.fulfilment_state = 'paid'
                     OR new_rank < old_rank;

  IF NOT needs_authority THEN
    IF new_rank <> old_rank + 1 THEN
      RAISE EXCEPTION
        'fulfilment_state cannot skip: % → % is % steps. Move one state at a time.',
        OLD.fulfilment_state, NEW.fulfilment_state, new_rank - old_rank
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NOT public.may_reverse_fulfilment() THEN
      RAISE EXCEPTION
        'fulfilment_state cannot be moved to % (from %) by this role. D9: '
        'call_centre_supervisor, admin or super_admin only. Moving an order INTO `paid` is a '
        'claim that money arrived, which is why it is on this list.',
        NEW.fulfilment_state, OLD.fulfilment_state
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Distinct from the old value as well as non-blank: without that, a second correction
    -- inherits the first one's reason and the log records a sentence about a different event.
    IF NEW.fulfilment_state_reason IS NULL
       OR btrim(NEW.fulfilment_state_reason) = ''
       OR NEW.fulfilment_state_reason IS NOT DISTINCT FROM OLD.fulfilment_state_reason THEN
      RAISE EXCEPTION
        'moving % → % needs a NEW fulfilment_state_reason: a state somebody changed without '
        'saying why is not a correction, it is a discrepancy',
        OLD.fulfilment_state, NEW.fulfilment_state
        USING ERRCODE = 'check_violation';
    END IF;

    -- §4 — THE HAZARD. `delivered` is what creates the €50 partner commission, and
    -- process-commissions cancels a pending_release commission ONLY if the order reads
    -- `cancelled`. An order corrected out of `delivered` is not cancelled — it is simply not
    -- delivered — so without this the €50 releases seven days later for a delivery that never
    -- happened.
    IF OLD.fulfilment_state = 'delivered' THEN
      SELECT pc.status INTO blocking_status
      FROM public.partner_commissions pc
      WHERE pc.order_id = NEW.id AND pc.status IN ('approved', 'paid')
      LIMIT 1;

      IF blocking_status IS NOT NULL THEN
        RAISE EXCEPTION
          'cannot move order out of delivered: its partner commission is already %. '
          'Reversing a commission that has been released or paid is a finance decision.',
          blocking_status
          USING ERRCODE = 'check_violation';
      END IF;

      UPDATE public.partner_commissions
         SET status = 'cancelled',
             cancel_reason = format('order moved out of delivered (%s → %s) at %s',
                                    OLD.fulfilment_state, NEW.fulfilment_state, now())
       WHERE order_id = NEW.id AND status = 'pending_release';
    END IF;

    -- A reason held only in a column is overwritten by the next correction; the log survives.
    -- entity_type='order' and member_action NULL, so the WP7 attribution guard (20260907100500)
    -- treats this as an ordinary log row and does not demand its shape. staff_id is NULL for the
    -- service role, which is the honest record of "the payment path did this, not a person".
    INSERT INTO public.activity_logs
      (staff_id, action, entity_type, entity_id, old_values, new_values, reason)
    VALUES
      (acting_staff,
       CASE WHEN NEW.fulfilment_state = 'paid' AND OLD.fulfilment_state = 'awaiting_payment'
            THEN 'fulfilment_payment_recorded'
            ELSE 'fulfilment_state_corrected' END,
       'order', NEW.id,
       jsonb_build_object('fulfilment_state', OLD.fulfilment_state),
       jsonb_build_object('fulfilment_state', NEW.fulfilment_state),
       NEW.fulfilment_state_reason);
  END IF;

  IF NEW.fulfilment_state = 'allocated' THEN
    NEW.allocated_at := COALESCE(NEW.allocated_at, now());
  ELSIF NEW.fulfilment_state = 'programmed' THEN
    NEW.programmed_at := COALESCE(NEW.programmed_at, now());
    NEW.programmed_by := COALESCE(NEW.programmed_by, acting_staff);
  ELSIF NEW.fulfilment_state = 'dispatched' THEN
    NEW.shipped_at := COALESCE(NEW.shipped_at, now());
  ELSIF NEW.fulfilment_state = 'delivered' THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, now());
  ELSIF NEW.fulfilment_state = 'tested' THEN
    NEW.tested_at := COALESCE(NEW.tested_at, now());
    NEW.tested_by := COALESCE(NEW.tested_by, acting_staff);

    -- `tested` means A NAMED OPERATOR ANSWERED, and it is the second half of monitoring
    -- readiness (D4) — an anonymous one is not evidence, it is an assertion. No automated path
    -- to this state exists by definition, so the service role is refused here too.
    IF NEW.tested_by IS NULL THEN
      RAISE EXCEPTION
        'fulfilment_state=tested requires tested_by: the state means a named operator '
        'answered a real test call, and nobody is named here'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ── the backfill ───────────────────────────────────────────────────────────
-- An order sitting on the old default with NO COMPLETED PAYMENT was never paid. That is exactly
-- the set 20260907110100 had to leave alone for want of a state to put it in.
--
-- THE TRIGGER IS DISABLED FOR THIS BLOCK, for the reason that migration gives: a backfill is not
-- a transition. `paid → awaiting_payment` is backwards, so the rule would demand a per-row
-- "reason" for a correction nobody made and write activity_logs rows claiming a staff member
-- acted today. Both would be inventing evidence. It is re-enabled immediately after, and the
-- assertions in scripts/rls/isolation.sql prove it still bites.
--
-- Guarded to `fulfilment_state = 'paid'`, so nothing further along the sequence is touched: an
-- order that has been allocated or dispatched is not moved backwards by a migration whatever its
-- payment rows say. Those are a discrepancy for a person to look at, and PENDING_FOR_LEE.md
-- carries the query that finds them.
ALTER TABLE public.orders DISABLE TRIGGER trg_orders_fulfilment_state;

UPDATE public.orders o
   SET fulfilment_state = 'awaiting_payment'
 WHERE o.fulfilment_state = 'paid'
   AND NOT EXISTS (
     SELECT 1 FROM public.payments p
      WHERE p.order_id = o.id AND p.status = 'completed'
   );

ALTER TABLE public.orders ENABLE TRIGGER trg_orders_fulfilment_state;
