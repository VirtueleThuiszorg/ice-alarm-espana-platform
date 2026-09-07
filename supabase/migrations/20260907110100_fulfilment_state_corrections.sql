-- WP2 corrections 2-4 — three things #180 got wrong, found by reading CC_MASTER_BRIEF.md.
--
-- The bundle in #180 was built from FULFILMENT_MODEL.md because the brief was not in the repo.
-- The design doc is a faithful design; it is not the instruction. Three requirements live only
-- in the brief:
--
--   WP2  "Backward moves: D9 roles only, REQUIRE A REASON, write activity_logs."
--        #180 enforced the roles and neither of the other two.
--   WP2  "tested … records who and when" / "TESTED REQUIRES A STAFF ID."
--        #180 stamped tested_by opportunistically via COALESCE, so a write with no resolvable
--        staff could land `tested` with tested_by NULL — the state whose entire content is
--        that a named person answered.
--   WP2  "Migrate existing rows: pending->paid where a subscription exists,
--        processing->allocated, shipped->dispatched, delivered stays."
--        #180 defaulted EVERY existing order to 'paid'. That is live wrong data right now: an
--        order that was shipped reads `paid`, and the one-step-forward rule means staff would
--        have to walk it back up by hand.
--
-- ROLLBACK:
--   ALTER TABLE public.orders DROP COLUMN fulfilment_state_reason;
--   -- then re-create enforce_fulfilment_state() from 20260907100000 verbatim.
--   The backfill is NOT reversed: it replaces wrong values with right ones, and restoring
--   'paid' everywhere would be restoring the defect.

-- ── the reason a correction was made ───────────────────────────────────────
-- A column rather than a session GUC, because the caller is PostgREST: a client PATCHes
-- {fulfilment_state, fulfilment_state_reason} in one request and the trigger sees both. A GUC
-- would need a SET LOCAL the REST layer has no way to send.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfilment_state_reason text;

COMMENT ON COLUMN public.orders.fulfilment_state_reason IS
  'Why a fulfilment state was moved BACKWARDS or to cancelled. Required by '
  'enforce_fulfilment_state() for those moves, and must differ from the previous reason so a '
  'correction cannot ride on an older one. The durable record is in activity_logs.';

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
  is_correction boolean;
BEGIN
  IF NEW.fulfilment_state = OLD.fulfilment_state THEN
    RETURN NEW;
  END IF;

  -- `cancelled` is not a place in the sequence, so it has no rank. It is reachable from any
  -- state and leaving it is a correction like any other backward move. Handled before the
  -- rank arithmetic, which would otherwise compare against NULL and silently allow anything.
  is_correction := NEW.fulfilment_state = 'cancelled'
                   OR OLD.fulfilment_state = 'cancelled'
                   OR new_rank < old_rank;

  IF NOT is_correction THEN
    IF new_rank <> old_rank + 1 THEN
      RAISE EXCEPTION
        'fulfilment_state cannot skip: % → % is % steps. Move one state at a time.',
        OLD.fulfilment_state, NEW.fulfilment_state, new_rank - old_rank
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NOT public.may_reverse_fulfilment() THEN
      RAISE EXCEPTION
        'fulfilment_state cannot be moved backwards or to cancelled (% → %) by this role. '
        'D9: call_centre_supervisor, admin or super_admin only.',
        OLD.fulfilment_state, NEW.fulfilment_state
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- CORRECTION 2 — the brief requires a reason, and #180 did not ask for one.
    -- Distinct from the old value as well as non-blank: without that, a second correction
    -- inherits the first one's reason and the log records a sentence about a different event.
    IF NEW.fulfilment_state_reason IS NULL
       OR btrim(NEW.fulfilment_state_reason) = ''
       OR NEW.fulfilment_state_reason IS NOT DISTINCT FROM OLD.fulfilment_state_reason THEN
      RAISE EXCEPTION
        'moving % → % is a correction and needs a NEW fulfilment_state_reason: a state '
        'somebody undid without saying why is not a correction, it is a discrepancy',
        OLD.fulfilment_state, NEW.fulfilment_state
        USING ERRCODE = 'check_violation';
    END IF;

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

    -- CORRECTION 2b — the brief says these "write activity_logs", and #180 wrote nothing.
    -- A reason held only in a column is overwritten by the next correction; the log is what
    -- survives. entity_type='order' and member_action NULL, so the WP7 attribution guard
    -- (20260907100500) treats this as an ordinary log row and does not demand its shape.
    INSERT INTO public.activity_logs
      (staff_id, action, entity_type, entity_id, old_values, new_values, reason)
    VALUES
      (acting_staff, 'fulfilment_state_corrected', 'order', NEW.id,
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

    -- CORRECTION 3 — "tested requires a staff id". #180 stamped it if one happened to be
    -- resolvable and shrugged if not. `tested` means A NAMED OPERATOR ANSWERED, and it is the
    -- second half of monitoring readiness (D4) — an anonymous one is not evidence, it is an
    -- assertion. No automated path to this state exists by definition, so the service role is
    -- refused here too rather than exempted.
    IF NEW.tested_by IS NULL THEN
      RAISE EXCEPTION
        'fulfilment_state=tested requires tested_by: the state means a named operator '
        'answered a real test call, and nobody is named here'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ── CORRECTION 4 — the backfill #180 never did ─────────────────────────────
-- Mapping is the brief's, exactly.
--
-- THE TRIGGER IS DISABLED FOR THIS BLOCK, DELIBERATELY. A backfill is not a transition: nobody
-- dispatched these orders just now, and `paid → delivered` is a two-step move the trigger would
-- correctly refuse as a skip. Routing history through a rule written for live human actions
-- would mean either fabricating per-row "reasons" for corrections nobody made, or writing
-- activity_logs entries claiming a staff member acted today on an order shipped in March. Both
-- would be inventing evidence. The trigger is re-enabled immediately after, and the assertions
-- in scripts/rls/isolation.sql prove it still bites.
--
-- Guarded by `fulfilment_state = 'paid'` throughout, so this only ever moves rows still sitting
-- on the DEFAULT: if staff corrected an order by hand between #180 landing and this running,
-- their work is not overwritten by a migration replaying history.

ALTER TABLE public.orders DISABLE TRIGGER trg_orders_fulfilment_state;

UPDATE public.orders SET fulfilment_state = 'allocated'
 WHERE status = 'processing' AND fulfilment_state = 'paid';

UPDATE public.orders SET fulfilment_state = 'dispatched'
 WHERE status = 'shipped' AND fulfilment_state = 'paid';

UPDATE public.orders SET fulfilment_state = 'delivered'
 WHERE status = 'delivered' AND fulfilment_state = 'paid';

UPDATE public.orders SET fulfilment_state = 'cancelled'
 WHERE status = 'cancelled' AND fulfilment_state = 'paid';

-- `pending` -> `paid` ONLY WHERE A SUBSCRIPTION EXISTS, per the brief. A pending order with no
-- subscription was never paid, and there is no state below `paid` to put it in — so it is left
-- on the default rather than quietly mapped, which would assert a payment that did not happen
-- (golden rule 4). This UPDATE is therefore a no-op by construction (the column already reads
-- 'paid'); it is written out because the brief names the rule, and a reader should see that the
-- condition was considered rather than skipped. PENDING_FOR_LEE.md carries the query that finds
-- any such row, because those need a human, not a default.
UPDATE public.orders o
   SET fulfilment_state = 'paid'
 WHERE o.status = 'pending'
   AND o.fulfilment_state = 'paid'
   AND EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.member_id = o.member_id);

ALTER TABLE public.orders ENABLE TRIGGER trg_orders_fulfilment_state;
