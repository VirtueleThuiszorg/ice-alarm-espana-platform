-- A new lead reaches the ROUTER, not just the bell.
--
-- SEPARATE FILE, AND THAT IS THE POINT. This needs `pg_net`, which cannot be installed on a
-- stock PostgreSQL — so `scripts/rls/run.sh` skips migrations that use it. Putting this in
-- 20260909120000 would have made the whole notify-staff schema unverifiable by the isolation
-- harness: three tables, nine policies and a seed policy, none of them ever applied in a test
-- run. One extension turns 473 real assertions into zero. So the tables live in a file the
-- harness applies, and the one statement that needs pg_net lives here.
--
-- WHY A TRIGGER AND NOT A CALL FROM THE APP. The contact form submits as `anon` straight into
-- `leads` (WIRING_REGISTER.md, `table:leads`) — there is no server-side step to hang this on,
-- and the previous attempt to have the client announce its own submission is exactly the defect
-- this whole register came from: Lee sent a message and nothing told anybody. A trigger covers
-- every route into the table, including the wizard, the CRM import and a staff member typing
-- one in by hand.
--
-- THE BELL IS ALREADY WRITTEN, by `notify_staff_of_new_lead` (20260908130000), one targeted row
-- per active staff member — broader coverage than this router's audience and proven by
-- scripts/rls/wiring.sql. So the event carries `bellWrittenElsewhere: true` and the router adds
-- SMS, WhatsApp, push and email for the admins whose preferences say so, without doubling every
-- enquiry in the bell.
--
-- FAILURE IS NEVER THE LEAD'S PROBLEM. `net.http_post` is queued, not awaited, so a slow or
-- down function cannot make the INSERT wait — and every branch of this function returns without
-- raising. Losing the enquiry is strictly worse than not announcing it, which is the same rule
-- the bell trigger states and for the same reason.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS emit_lead_new_to_router ON public.leads;
--   DROP FUNCTION IF EXISTS public.emit_lead_new_to_router();
--   The bell trigger is untouched and keeps working on its own.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.emit_lead_new_to_router()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_who text;
  v_what text;
BEGIN
  -- The service-role key lives in Vault, exactly as the two cron jobs read it
  -- (20260723120000). Absent means "not configured yet", which is a WARNING and not a failure:
  -- the lead is saved and the bell has already rung.
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF v_key IS NULL THEN
    RAISE WARNING 'lead % saved and belled, but service_role_key is missing from Vault so the '
                  'router was not called', NEW.id;
    RETURN NEW;
  END IF;

  v_who := NULLIF(TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), '');
  v_what := COALESCE(NULLIF(NEW.enquiry_type, ''), 'general');

  PERFORM net.http_post(
    url := 'https://crpsuhoixfdhjugprbuc.supabase.co/functions/v1/notify-staff',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'event', jsonb_build_object(
        'type', 'lead.new',
        'title', format('New %s enquiry', v_what),
        'body', format('%s%s',
                       COALESCE(v_who, 'Someone who left no name'),
                       CASE WHEN NEW.phone IS NOT NULL THEN ' — ' || NEW.phone ELSE '' END),
        'link', '/admin/leads',
        'entity', jsonb_build_object('type', 'lead', 'id', NEW.id),
        -- The bell rows exist already; see the header.
        'bellWrittenElsewhere', true
      ),
      -- Lee's policy: a new enquiry ALWAYS reaches admins. Operators keep the bell, which is
      -- where they work from, and are not texted about every enquiry.
      'audience', jsonb_build_object('roles', jsonb_build_array('admin', 'super_admin'))
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Belt to the braces above: whatever goes wrong here, the enquiry is already saved and belled.
  RAISE WARNING 'lead % saved and belled, but the router call failed: %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.emit_lead_new_to_router() IS
  'Queues a lead.new event to the notify-staff function after a lead is inserted. Never raises: '
  'the enquiry is saved and the bell has already rung before this runs, and losing an enquiry '
  'is strictly worse than not announcing it.';

DROP TRIGGER IF EXISTS emit_lead_new_to_router ON public.leads;
CREATE TRIGGER emit_lead_new_to_router
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.emit_lead_new_to_router();
