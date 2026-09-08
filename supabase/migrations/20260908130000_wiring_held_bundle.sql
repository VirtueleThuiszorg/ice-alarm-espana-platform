-- ============================================================================
-- THE HELD WIRING BUNDLE — two classes of wire that reach nobody.
--
-- From the wiring register (WIRING_REGISTER.md). Both halves are schema, so
-- they travel together in one bundle as the brief requires, and both are
-- reversible (rollback at the foot of the file).
--
-- 1. FIVE REALTIME SUBSCRIPTIONS THAT CANNOT FIRE.
--    Five `postgres_changes` subscriptions in src/ listen to tables that are
--    not in the `supabase_realtime` publication. Establishing the channel
--    succeeds, so nothing errors and nothing logs — the callback is simply
--    never called. Verified against the real schema (the migration set applied
--    to a throwaway PostgreSQL and `pg_publication_tables` queried), not by
--    grep, because several migrations add tables from inside conditional DO
--    blocks that a grep does not see.
--
--    The two that matter:
--      * `tasks`       — the call-centre dashboard's courtesy-call list. A
--                        welfare call assigned to an operator does not appear
--                        until they reload.
--      * `shift_notes` — the handover list, whose own code comment promises
--                        "notes added/edited/deleted by other operators appear
--                        without a reload". That has never once happened, on the
--                        single screen whose whole purpose is handover.
--
-- 2. A NEW ENQUIRY TELLS NOBODY.
--    Lee sent a message from the public Contact page and found nothing in
--    Communications, Messages or notifications. The row was in `leads` the
--    whole time: `leads` has exactly one trigger, `update_leads_updated_at`.
--    The contact form meanwhile promises a reply "within 24 hours".
--
--    WHY A TRIGGER AND NOT CLIENT CODE: the contact form submits as `anon`, and
--    `notification_log` INSERT is deliberately restricted to staff and
--    service_role — so the browser cannot raise the notification, and it should
--    not be able to. A trigger also covers every route into the table at once
--    (contact form, join wizard, partner referral, a future import) instead of
--    the one caller someone remembered to wire up.
-- ============================================================================

-- ── 1. the five unpublished tables ─────────────────────────────────────────
--
-- REPLICA IDENTITY FULL is set for the same reason 20260903090000 set it on
-- `members`: Realtime applies RLS to the row it sends, and under the default
-- replica identity an UPDATE's old row carries only the primary key, so events
-- can be dropped for exactly the subscribers who were entitled to them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tasks',                 -- call-centre courtesy-call list
    'shift_notes',           -- shift handover list
    'registration_drafts',   -- abandoned-join list on /admin/leads
    'social_posts',          -- media manager post list
    'social_post_metrics'    -- media manager engagement figures
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- ── 2. a new lead reaches the bell ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_staff_of_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  who text;
  what text;
  targets int;
BEGIN
  -- Name and channel, so the bell text says what arrived and how to answer it
  -- rather than "new lead". `enquiry_type` and `source` are the two things an
  -- operator needs to decide whether to pick it up.
  who := NULLIF(TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), '');
  what := COALESCE(NULLIF(NEW.enquiry_type, ''), 'general');

  -- TARGETED, one row per active staff member, not a single broadcast row.
  -- A broadcast row (admin_user_id IS NULL) is visible to all staff but SHARED,
  -- so the first person to press "mark read" clears it for everyone — which is
  -- how an enquiry would go missing a second time, more quietly than the first.
  -- src/lib/staffNotify.ts takes the same decision for the same reason.
  INSERT INTO public.notification_log (admin_user_id, event_type, entity_type, entity_id, message, status)
  SELECT
    s.user_id,
    'message',           -- one of the four types the bell renders; routes to the
                         -- enquiry via entity_type below
    'lead',
    NEW.id,
    format('New %s enquiry from %s%s',
           what,
           COALESCE(who, 'someone who left no name'),
           CASE WHEN NEW.preferred_language IS NOT NULL AND NEW.preferred_language <> 'en'
                THEN ' (prefers ' || NEW.preferred_language || ')' ELSE '' END),
    'pending'
  FROM public.staff s
  WHERE s.is_active AND s.user_id IS NOT NULL;

  GET DIAGNOSTICS targets = ROW_COUNT;

  -- A lead that notified nobody is the original defect. If there is no active
  -- staff member to tell, say so in the log — but never abort the INSERT: losing
  -- the enquiry is strictly worse than not announcing it.
  IF targets = 0 THEN
    RAISE WARNING 'lead % saved but no active staff with a user_id to notify', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_staff_of_new_lead() IS
  'Raises a targeted bell notification per active staff member when a lead arrives. '
  'SECURITY DEFINER because the contact form submits as anon and notification_log '
  'INSERT is staff/service_role only — by design, and this is the way round it that '
  'does not widen anything: the function writes a fixed row shape and reads nothing '
  'the caller supplied beyond the new lead itself.';

DROP TRIGGER IF EXISTS notify_staff_of_new_lead ON public.leads;
CREATE TRIGGER notify_staff_of_new_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_staff_of_new_lead();

-- ── rollback ────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS notify_staff_of_new_lead ON public.leads;
-- DROP FUNCTION IF EXISTS public.notify_staff_of_new_lead();
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.tasks;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.shift_notes;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.registration_drafts;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.social_posts;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.social_post_metrics;
-- ALTER TABLE public.tasks REPLICA IDENTITY DEFAULT;  -- and the other four
