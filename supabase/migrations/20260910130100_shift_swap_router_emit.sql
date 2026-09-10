-- A shift swap reaches the ROUTER, so the push actually leaves the building.
--
-- SEPARATE FILE, AND THAT IS THE POINT — the same reason 20260909130000 is its own file. This
-- needs `pg_net`, which cannot be installed on a stock PostgreSQL, so `scripts/rls/run.sh` skips
-- migrations that use it. Putting this statement in 20260910130000 would take the whole swap
-- schema with it: `apply_shift_swap`, the bell trigger, the route rows and the 30-odd assertions
-- that exercise them would never be applied in a harness run, and the suite would report green
-- having tested none of it. So the verifiable part lives in a file the harness applies, and the
-- one statement that needs pg_net lives here.
--
-- WHY A TRIGGER AND NOT A CALL FROM THE APP, which is the shape the UI would prefer. Two hard
-- reasons, not a preference:
--
--   1. AN OPERATOR CANNOT CALL `notify-staff`. `NOTIFY_CALLER_ROLES` is ["admin","super_admin"]
--      plus the service role, by design — the router can text everybody, so it is not something
--      a call-centre login may invoke. But the person asking for a swap IS an operator, and they
--      are exactly who has to be able to raise this.
--   2. A notification raised by the browser is lost when the tab closes mid-request, and the
--      request that matters most here is the last one somebody makes before going home.
--
-- A trigger also covers every route into the table, including a supervisor fixing a swap by hand
-- in the SQL editor.
--
-- THE BELL IS ALREADY WRITTEN, by `bell_on_shift_swap` in 20260910130000, targeted at the exact
-- people each transition concerns. So every event here carries `bellWrittenElsewhere: true` and
-- the router adds only the other channels — push, per Lee's ruling; SMS, WhatsApp and email are
-- routed off for these three events. Without that flag every swap would appear twice in the bell.
--
-- WHO IS TOLD, per transition — the same three answers as the bell, and deliberately so:
--   requested  the counterparty, by staff id. A question between two people.
--   accepted   the requester, plus the roles that can approve it. It is now waiting on them.
--   applied    both people, by staff id. The rota they turn up to has changed.
-- 'declined' is not a router event: it is a private no between two people, and the bell tells
-- the requester. A push for it was not asked for and is not invented here.
--
-- FAILURE IS NEVER THE SWAP'S PROBLEM. `net.http_post` is queued, not awaited, so a slow or dead
-- function cannot make the write wait, and every branch returns without raising. Losing
-- somebody's swap is strictly worse than not announcing it — the same rule as the bell, and for
-- the same reason.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS emit_shift_swap_to_router ON public.staff_shift_swaps;
--   DROP FUNCTION IF EXISTS public.emit_shift_swap_to_router();
--   The bell trigger is untouched and keeps working on its own.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.emit_shift_swap_to_router()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key        text;
  v_event      text;
  v_title      text;
  v_body       text;
  v_audience   jsonb;
  v_requester  RECORD;
  v_counter    RECORD;
  v_shift      RECORD;
BEGIN
  -- Decide WHAT this is before spending a Vault read on it. Most UPDATEs on this table are not
  -- transitions anybody needs telling about.
  IF TG_OP = 'INSERT' THEN
    v_event := 'shift.swap_requested';
  ELSIF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    v_event := 'shift.swap_accepted';
  ELSIF NEW.status = 'applied' AND OLD.status IS DISTINCT FROM 'applied' THEN
    v_event := 'shift.swap_approved';
  ELSE
    RETURN NEW;
  END IF;

  -- The service-role key lives in Vault, exactly as the two cron jobs and the lead emit read it.
  -- Absent means "not configured yet": a WARNING, not a failure. The swap is saved and the bell
  -- has already rung.
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF v_key IS NULL THEN
    RAISE WARNING 'shift swap % saved and belled, but service_role_key is missing from Vault so '
                  'the router was not called', NEW.id;
    RETURN NEW;
  END IF;

  SELECT first_name, last_name INTO v_requester FROM public.staff WHERE id = NEW.requested_by;
  SELECT first_name, last_name INTO v_counter FROM public.staff WHERE id = NEW.counterparty_id;
  SELECT shift_date, shift_type INTO v_shift
  FROM public.staff_shifts WHERE id = NEW.requested_shift_id;

  IF v_event = 'shift.swap_requested' THEN
    -- `wants_exchange`, NOT `offered_shift_id`: nothing is offered until the counterparty
    -- answers, so deciding from the offered shift titled every request "cover", including the
    -- swaps. Same fix as the bell trigger's message in 20260910130000.
    v_title := CASE WHEN NEW.wants_exchange
                    THEN 'Somebody has asked you to swap a shift'
                    ELSE 'Somebody has asked you to cover a shift' END;
    v_body := format('%s %s — %s %s. Open My shifts to answer.',
                     v_requester.first_name, v_requester.last_name,
                     to_char(v_shift.shift_date, 'FMDay DD Mon'), v_shift.shift_type);
    v_audience := jsonb_build_object('staffIds', jsonb_build_array(NEW.counterparty_id));

  ELSIF v_event = 'shift.swap_accepted' THEN
    v_title := 'A shift swap is waiting for approval';
    v_body := format('%s %s accepted %s %s''s request for %s %s.',
                     v_counter.first_name, v_counter.last_name,
                     v_requester.first_name, v_requester.last_name,
                     to_char(v_shift.shift_date, 'FMDay DD Mon'), v_shift.shift_type);
    -- The requester by id, and everybody who can approve it by role. `call_centre_supervisor`
    -- is in the list because approving a swap is hers (RLS, 20260909120000) — an audience of
    -- admins only would leave the person whose job this is out of it.
    v_audience := jsonb_build_object(
      'staffIds', jsonb_build_array(NEW.requested_by),
      'roles', jsonb_build_array('call_centre_supervisor', 'admin', 'super_admin'));

  ELSE
    v_title := 'Your shift swap was approved';
    v_body := format('%s %s and %s %s have swapped. Check My shifts for the new dates.',
                     v_requester.first_name, v_requester.last_name,
                     v_counter.first_name, v_counter.last_name);
    v_audience := jsonb_build_object(
      'staffIds', jsonb_build_array(NEW.requested_by, NEW.counterparty_id));
  END IF;

  PERFORM net.http_post(
    url := 'https://crpsuhoixfdhjugprbuc.supabase.co/functions/v1/notify-staff',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'event', jsonb_build_object(
        'type', v_event,
        'title', v_title,
        'body', v_body,
        'link', '/call-centre/my-shifts',
        'entity', jsonb_build_object('type', 'staff_shift_swap', 'id', NEW.id),
        -- The bell rows exist already; see the header.
        'bellWrittenElsewhere', true
      ),
      'audience', v_audience
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Belt to the braces above: whatever goes wrong here, the swap is already saved and belled.
  RAISE WARNING 'shift swap % saved and belled, but the router call failed: %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.emit_shift_swap_to_router() IS
  'Queues shift.swap_requested / _accepted / _approved to the notify-staff function as a swap '
  'moves. Carries bellWrittenElsewhere because bell_on_shift_swap has already written the '
  'targeted bell rows. Never raises: losing somebody''s swap is worse than not announcing it.';

DROP TRIGGER IF EXISTS emit_shift_swap_to_router ON public.staff_shift_swaps;
CREATE TRIGGER emit_shift_swap_to_router
  AFTER INSERT OR UPDATE OF status ON public.staff_shift_swaps
  FOR EACH ROW
  EXECUTE FUNCTION public.emit_shift_swap_to_router();
