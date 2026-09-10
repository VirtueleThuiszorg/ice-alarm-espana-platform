-- Applying a shift swap: one transaction, and both people told.
--
-- WHAT EXISTS ALREADY. `staff_shift_swaps` (20260909120000) has the table, the six statuses and
-- the RLS: an operator may open a swap only for a shift that is theirs, the counterparty may
-- accept or decline and NOTHING else, and only an admin or supervisor may approve. That much is
-- asserted in scripts/rls/isolation.sql. What has never existed is the step that makes an
-- approved swap true — the shifts moving — and the notifications that tell the two people it
-- happened. This is that step.
--
-- WHY A FUNCTION AND NOT TWO CLIENT UPDATES, which is what the UI would otherwise do:
--
--   UPDATE staff_shifts SET staff_id = <counterparty> WHERE id = <requested>;   -- commits
--   UPDATE staff_shifts SET staff_id = <requester>    WHERE id = <offered>;     -- fails
--
-- leaves one shift moved and one not: at that moment the rota says two people are on the same
-- slot and nobody is on another, and `staff_on_shift_now` — which `staff-shift-monitor` reads
-- to decide who is missing — agrees with it. On a life-safety rota a half-applied swap is worse
-- than a refused one, so it happens in one transaction or not at all. The status only reaches
-- 'applied' after the shifts have actually moved, which is what the table's own comment already
-- promised.
--
-- WHAT IT WRITES, and why each one:
--   staff_shifts        the move itself.
--   staff_shift_covers  one row per moved shift, status 'accepted', holiday_id NULL. NULL is
--                       load-bearing: a shift somebody swapped off is NOT evidence they were
--                       absent, which is the same distinction the 2026 import drew for Carmen's
--                       two "(moved)" rows (ROTA_MODEL.md §2-B). Without the cover row,
--                       `MyShiftsWidget` and My shifts cannot label the shift "covering X" and
--                       it reads as a rota error on a day the cycle says you are off.
--   activity_logs       who approved it, and what moved. The first question after a swap
--                       anybody disputes.
--
-- THE BELL IS WRITTEN HERE, BY A TRIGGER, not by the app. Three reasons: an operator cannot
-- call `notify-staff` (it admits the service role and admins only, by design — see
-- NOTIFY_CALLER_ROLES), a notification raised by the client is lost the moment the tab closes
-- mid-request, and every route into the table is covered this way including a supervisor
-- fixing something by hand in the SQL editor. Same reasoning as `notify_staff_of_new_lead`
-- (20260908130000). The other channels are the router's job; the pg_net emit that reaches it
-- lives in its own file, because pg_net cannot be installed on the stock PostgreSQL the RLS
-- harness runs and one extension would make this whole file unverifiable.
--
-- ROLLBACK:
--   ALTER TABLE public.staff_shift_swaps DROP COLUMN IF EXISTS wants_exchange;
--   DROP TRIGGER IF EXISTS bell_on_shift_swap ON public.staff_shift_swaps;
--   DROP FUNCTION IF EXISTS public.bell_on_shift_swap();
--   DROP FUNCTION IF EXISTS public.apply_shift_swap(uuid);
--   DELETE FROM public.notification_routes WHERE event_type LIKE 'shift.swap_%';
--   ALTER TABLE public.notification_routes DROP CONSTRAINT notification_routes_event_type_check;
--   -- then re-add the constraint from 20260909121500 without the three swap events.

-- ============================================================
-- 1. Was a SWAP asked for, or just cover?
-- ============================================================
--
-- One column, and it exists because of who can see what. `offered_shift_id` is the counterparty's
-- shift that the requester takes in exchange — the INSERT policy pins `requested_shift_id` to a
-- shift of the REQUESTER's own, so the offered one can only be the other person's. And an
-- operator cannot read another operator's shifts at all: RLS gives `call_centre` its own rows
-- only, which scripts/rls/isolation.sql asserts by having Mary fail to see Albert's shift.
--
-- So the person asking CANNOT name the shift they would take. Only the counterparty can, when
-- they answer. Which leaves the request itself unable to say whether it wanted an exchange or
-- simply cover, because `offered_shift_id` is NULL in both cases until somebody answers. That is
-- the difference this column carries, and it is the difference the brief draws: "Request swap"
-- and "Ask for cover" are two different questions, and the answer screen has to ask for a shift
-- back for one of them and not the other.
--
-- NOT ENFORCED, deliberately. A swap request the counterparty answers with plain cover ("I'll
-- just take it") is a real outcome and stays valid; this records what was asked for, not what
-- must happen.

ALTER TABLE public.staff_shift_swaps
  ADD COLUMN IF NOT EXISTS wants_exchange BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff_shift_swaps.wants_exchange IS
  'true = the requester asked for a SWAP (the counterparty nominates one of their own shifts in '
  'exchange when accepting); false = they asked for COVER, nothing back. Records the question, '
  'not a constraint on the answer — offered_shift_id is what actually moved.';

-- ============================================================
-- 2. The router's event list gains the three swap events
-- ============================================================
--
-- Replaced rather than extended: a CHECK constraint cannot be added to, and this is exactly why
-- 20260909121500 chose a CHECK over an enum — `ALTER TYPE … ADD VALUE` cannot run in the same
-- transaction as anything that uses the new value. The list is mirrored in `NOTIFY_EVENTS`
-- (supabase/functions/_shared/notify-staff.ts) and src/test/notifyStaffRouter.test.ts asserts
-- the two agree, so an event the router can emit and this constraint refuses fails the build
-- rather than failing at the log write after the push has gone out.

ALTER TABLE public.notification_routes
  DROP CONSTRAINT IF EXISTS notification_routes_event_type_check;

ALTER TABLE public.notification_routes
  ADD CONSTRAINT notification_routes_event_type_check CHECK (event_type IN (
    'sale.paid',
    'lead.new',
    'payment.failed',
    'subscription.cancelled',
    'sos.opened',
    'sos.unassigned',
    'device.offline',
    'isabella.down',
    'partner.joined',
    'hot.sales',
    'ev07b.alert',
    'shift.no_show',
    'shift.no_coverage',
    'shift.disconnected',
    -- NEW: the swap flow. A swap is between two people and changes who answers an alert at
    -- three in the morning, so both of them and the supervisor hear about it.
    'shift.swap_requested',
    'shift.swap_accepted',
    'shift.swap_approved',
    'system.runner_failure',
    'escalation.call_failed',
    'escalation.no_emergency_contacts',
    'escalation.contacts_not_notified',
    'test'
  ));

-- Bell and push on; SMS, WhatsApp and email off (Lee's ruling). A swap is not worth a per-message
-- bill, and the bell is where an operator works from. The bell is not a row here — it is written
-- unconditionally by the trigger below — so these four rows are the OTHER channels' policy.
INSERT INTO public.notification_routes (event_type, channel, enabled) VALUES
  ('shift.swap_requested', 'sms', false), ('shift.swap_requested', 'whatsapp', false),
  ('shift.swap_requested', 'push', true), ('shift.swap_requested', 'email', false),
  ('shift.swap_accepted', 'sms', false), ('shift.swap_accepted', 'whatsapp', false),
  ('shift.swap_accepted', 'push', true), ('shift.swap_accepted', 'email', false),
  ('shift.swap_approved', 'sms', false), ('shift.swap_approved', 'whatsapp', false),
  ('shift.swap_approved', 'push', true), ('shift.swap_approved', 'email', false)
ON CONFLICT (event_type, channel) DO NOTHING;

-- ============================================================
-- 3. apply_shift_swap(swap_id) — the move, in one transaction
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_shift_swap(p_swap_id UUID)
RETURNS TABLE (
  moved_shifts  INTEGER,
  covers_written INTEGER,
  outcome       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $apply_swap$
DECLARE
  v_role       TEXT;
  v_actor      UUID;
  v_swap       public.staff_shift_swaps;
  v_requested  public.staff_shifts;
  v_offered    public.staff_shifts;
  v_moved      INTEGER := 0;
  v_covers     INTEGER := 0;
  v_written    INTEGER;
BEGIN
  -- SECURITY DEFINER, so the role check is the whole gate and it is checked FIRST. The RLS
  -- policy on the table says the same thing for a direct UPDATE; this says it for the path that
  -- bypasses RLS by definition.
  v_role := public.get_staff_role(auth.uid());
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'call_centre_supervisor') THEN
    RAISE EXCEPTION 'only an admin or a supervisor may apply a shift swap (role: %)',
      COALESCE(v_role, 'none');
  END IF;
  v_actor := public.get_staff_id(auth.uid());

  -- FOR UPDATE: two supervisors approving the same swap at once would otherwise both move the
  -- shifts, and the second move would swap them back.
  SELECT * INTO v_swap FROM public.staff_shift_swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'swap % does not exist', p_swap_id;
  END IF;

  -- Already applied is a NO-OP, not an error: a supervisor double-clicking Approve, or two of
  -- them acting on the same list, must not produce a second move or a failure to explain.
  IF v_swap.status = 'applied' THEN
    RETURN QUERY SELECT 0, 0, 'already applied — nothing moved'::TEXT;
    RETURN;
  END IF;

  IF v_swap.status <> 'accepted' THEN
    RAISE EXCEPTION 'a swap can only be applied once the other person has accepted it '
                    '(status: %)', v_swap.status;
  END IF;

  SELECT * INTO v_requested FROM public.staff_shifts WHERE id = v_swap.requested_shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the shift this swap is about no longer exists';
  END IF;

  -- The shift must still belong to the person who offered it. If the rota moved underneath the
  -- request — a supervisor reassigned it, or another swap applied first — approving this one
  -- would take a shift off somebody who never agreed to give it up.
  IF v_requested.staff_id <> v_swap.requested_by THEN
    RAISE EXCEPTION 'the rota has changed since this was requested: that shift is no longer %',
      (SELECT first_name || ' ' || last_name FROM public.staff WHERE id = v_swap.requested_by);
  END IF;

  IF v_swap.offered_shift_id IS NOT NULL THEN
    SELECT * INTO v_offered FROM public.staff_shifts WHERE id = v_swap.offered_shift_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'the shift offered in exchange no longer exists';
    END IF;
    IF v_offered.staff_id <> v_swap.counterparty_id THEN
      RAISE EXCEPTION 'the rota has changed since this was accepted: the offered shift is no '
                      'longer %',
        (SELECT first_name || ' ' || last_name FROM public.staff WHERE id = v_swap.counterparty_id);
    END IF;
  END IF;

  -- ---------- the move ----------
  UPDATE public.staff_shifts
  SET staff_id = v_swap.counterparty_id
  WHERE id = v_swap.requested_shift_id;
  v_moved := v_moved + 1;

  IF v_swap.offered_shift_id IS NOT NULL THEN
    UPDATE public.staff_shifts
    SET staff_id = v_swap.requested_by
    WHERE id = v_swap.offered_shift_id;
    v_moved := v_moved + 1;
  END IF;

  -- ---------- the covers ----------
  -- holiday_id NULL: a swapped shift is not an absence. See the header.
  INSERT INTO public.staff_shift_covers
    (shift_id, holiday_id, original_staff_id, cover_staff_id, status, requested_by, responded_at)
  SELECT v_swap.requested_shift_id, NULL, v_swap.requested_by, v_swap.counterparty_id,
         'accepted', v_swap.requested_by, COALESCE(v_swap.accepted_at, now())
  WHERE NOT EXISTS (
    SELECT 1 FROM public.staff_shift_covers ex
    WHERE ex.shift_id = v_swap.requested_shift_id
      AND ex.original_staff_id = v_swap.requested_by
      AND ex.cover_staff_id = v_swap.counterparty_id
  );
  -- GET DIAGNOSTICS, because the count is what the supervisor is shown and this asks the
  -- question directly: how many rows did that write?
  --
  -- The honest note, since I first wrote this as `COALESCE((SELECT 1 WHERE FOUND), 0)` and
  -- changed it believing that form was broken: it is NOT. `FOUND` is false after an
  -- INSERT … SELECT whose WHERE NOT EXISTS filtered every row out (checked on PostgreSQL 16,
  -- not inferred), so both forms give the same answer for this statement, and a mutant swapping
  -- one for the other survives the suite. What ROW_COUNT also survives is the statement becoming
  -- multi-row, where `SELECT 1 WHERE FOUND` would silently cap the count at one.
  GET DIAGNOSTICS v_written = ROW_COUNT;
  v_covers := v_covers + v_written;

  IF v_swap.offered_shift_id IS NOT NULL THEN
    INSERT INTO public.staff_shift_covers
      (shift_id, holiday_id, original_staff_id, cover_staff_id, status, requested_by, responded_at)
    SELECT v_swap.offered_shift_id, NULL, v_swap.counterparty_id, v_swap.requested_by,
           'accepted', v_swap.requested_by, COALESCE(v_swap.accepted_at, now())
    WHERE NOT EXISTS (
      SELECT 1 FROM public.staff_shift_covers ex
      WHERE ex.shift_id = v_swap.offered_shift_id
        AND ex.original_staff_id = v_swap.counterparty_id
        AND ex.cover_staff_id = v_swap.requested_by
    );
    GET DIAGNOSTICS v_written = ROW_COUNT;
    v_covers := v_covers + v_written;
  END IF;

  -- ---------- the audit ----------
  INSERT INTO public.activity_logs
    (staff_id, action, entity_type, entity_id, new_values, reason)
  VALUES (
    v_actor,
    'shift_swap_applied',
    'staff_shift_swap',
    v_swap.id,
    jsonb_build_object(
      'requested_shift_id', v_swap.requested_shift_id,
      'offered_shift_id', v_swap.offered_shift_id,
      'requested_by', v_swap.requested_by,
      'counterparty_id', v_swap.counterparty_id,
      'shifts_moved', v_moved,
      'two_sided', v_swap.offered_shift_id IS NOT NULL
    ),
    COALESCE(v_swap.reason, 'shift swap approved')
  );

  -- ---------- and only now is it applied ----------
  UPDATE public.staff_shift_swaps
  SET status = 'applied',
      approved_by = v_actor,
      approved_at = COALESCE(approved_at, now()),
      applied_at = now()
  WHERE id = v_swap.id;

  RETURN QUERY SELECT v_moved, v_covers,
    format('%s shift(s) moved, %s cover row(s) written', v_moved, v_covers)::TEXT;
END
$apply_swap$;

COMMENT ON FUNCTION public.apply_shift_swap(UUID) IS
  'Applies an ACCEPTED shift swap in one transaction: moves staff_shifts, writes '
  'staff_shift_covers (holiday_id NULL — a swap is not an absence) and activity_logs, then sets '
  'status to applied. Admin and call_centre_supervisor only; refuses if the rota has changed '
  'under the request; a second call on an applied swap is a no-op.';

REVOKE ALL ON FUNCTION public.apply_shift_swap(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_shift_swap(UUID) TO authenticated;

-- ============================================================
-- 4. The bell — written by the database, for every route into the table
-- ============================================================

CREATE OR REPLACE FUNCTION public.bell_on_shift_swap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $bell_swap$
DECLARE
  v_event      TEXT;
  v_message    TEXT;
  v_requester  RECORD;
  v_counter    RECORD;
  v_targets    UUID[];
BEGIN
  SELECT s.user_id, s.first_name, s.last_name INTO v_requester
  FROM public.staff s WHERE s.id = NEW.requested_by;
  SELECT s.user_id, s.first_name, s.last_name INTO v_counter
  FROM public.staff s WHERE s.id = NEW.counterparty_id;

  IF TG_OP = 'INSERT' THEN
    -- The person being ASKED. Nobody else needs this yet: it is a question between two people.
    v_event := 'shift.swap_requested';
    v_message := format('%s %s has asked you to %s a shift',
                        v_requester.first_name, v_requester.last_name,
                        -- `wants_exchange`, NOT `offered_shift_id`. This read the offered shift
                        -- and was therefore wrong on every single request: nothing is offered
                        -- until the counterparty answers, so a swap request announced itself as
                        -- "cover" — the exact confusion the column was added to remove. Caught
                        -- by driving a real swap through the triggers, not by reading it.
                        CASE WHEN NEW.wants_exchange THEN 'swap' ELSE 'cover' END);
    v_targets := ARRAY[v_counter.user_id];

  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    -- The person who ASKED, plus everyone who can approve it — the swap is now waiting on them.
    v_event := 'shift.swap_accepted';
    v_message := format('%s %s accepted your shift swap — it needs a supervisor to approve it',
                        v_counter.first_name, v_counter.last_name);
    v_targets := ARRAY[v_requester.user_id] || ARRAY(
      SELECT s.user_id FROM public.staff s
      WHERE s.role IN ('call_centre_supervisor', 'admin', 'super_admin')
        AND s.is_active = true AND s.user_id IS NOT NULL
    );

  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'declined' AND OLD.status <> 'declined' THEN
    -- Declined is not one of the three router events — it is a private no between two people,
    -- and a push saying so is not what the brief asked for. The bell still tells the requester,
    -- because a request that vanishes with no answer is the failure this feature removes.
    v_event := 'shift.swap_requested';
    v_message := format('%s %s cannot take that shift',
                        v_counter.first_name, v_counter.last_name);
    v_targets := ARRAY[v_requester.user_id];

  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'applied' AND OLD.status <> 'applied' THEN
    -- BOTH people, because the rota they turn up to has just changed.
    v_event := 'shift.swap_approved';
    v_message := 'Your shift swap was approved — check My shifts for the new dates';
    v_targets := ARRAY[v_requester.user_id, v_counter.user_id];

  ELSE
    RETURN NEW;
  END IF;

  -- Targeted rows only (admin_user_id NOT NULL): a broadcast row is shared, so one person
  -- marking it read clears it for everybody. Same rule as src/lib/staffNotify.ts.
  INSERT INTO public.notification_log
    (admin_user_id, event_type, entity_type, entity_id, message, status)
  SELECT DISTINCT target, v_event, 'staff_shift_swap', NEW.id, v_message, 'pending'
  FROM unnest(v_targets) AS target
  WHERE target IS NOT NULL;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- The swap itself is the point. A notification that cannot be written must not undo somebody
  -- accepting a shift — but it must not be silent either, which is what the warning is for.
  RAISE WARNING 'shift swap % saved, but the bell could not be written: %', NEW.id, SQLERRM;
  RETURN NEW;
END
$bell_swap$;

COMMENT ON FUNCTION public.bell_on_shift_swap() IS
  'Writes targeted notification_log rows as a swap moves: the counterparty on request, the '
  'requester (and the approvers) on accept, the requester on decline, both people once applied. '
  'Never raises — the swap matters more than the bell, and a warning says so.';

DROP TRIGGER IF EXISTS bell_on_shift_swap ON public.staff_shift_swaps;
CREATE TRIGGER bell_on_shift_swap
  AFTER INSERT OR UPDATE OF status ON public.staff_shift_swaps
  FOR EACH ROW
  EXECUTE FUNCTION public.bell_on_shift_swap();
