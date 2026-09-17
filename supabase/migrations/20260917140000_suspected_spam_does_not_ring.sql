-- A GUESS DOES NOT RING THE BELL.
--
-- `leads` carries two AFTER INSERT triggers, and both fire on every row:
--
--   notify_staff_of_new_lead   writes one notification_log row PER ACTIVE STAFF MEMBER
--   emit_lead_new_to_router    POSTs lead.new to notify-staff, which texts/emails admins
--
-- The enquiry that started all this was a spam submission with no name, no email and no phone.
-- It rang both. `public-submit` now sets `suspected_spam` on a submission that trips one of
-- three heuristics, and this is the one thing that flag does.
--
-- A `WHEN` CLAUSE ON THE TRIGGER, NOT AN `IF` INSIDE THE FUNCTION. The function keeps doing
-- exactly one thing, and the condition is visible in the schema — `\d leads` shows it, where an
-- early `RETURN NEW` is only visible to somebody who reads the function body. It is also
-- cheaper: PostgreSQL evaluates the WHEN before calling the function at all, so a flagged row
-- never enters plpgsql.
--
-- `IS NOT TRUE`, not `= false`. The column is NOT NULL DEFAULT false today, but a row inserted
-- by a path that predates it, or by a future `INSERT ... DEFAULT VALUES` against a changed
-- default, could hold NULL — and `NULL = false` is NULL, which is not TRUE, so the trigger would
-- silently stop firing for exactly the enquiries nobody flagged. This way NULL rings.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   * it does not stop the row being written. The enquiry is saved, in the list, in the order it
--     arrived, with a muted "Possible spam" badge and a one-press "Not spam".
--   * it does not delete, hide, or move anything.
--   * clearing the flag afterwards does not ring the bell retrospectively. These are AFTER
--     INSERT triggers and an UPDATE does not re-fire them. That is the right way round: a staff
--     member who presses "Not spam" is looking at the enquiry, so a notification telling them it
--     exists would arrive after they had already read it.
--
-- THE COST OF BEING WRONG, both ways, because that is the whole decision. A false positive means
-- a real enquiry sits in the list unannounced until somebody opens Leads — which is where every
-- lead sat before the bell existed, and the badge makes it MORE visible there, not less. A false
-- negative means one unnecessary bell. Neither is a lost enquiry, and that is the property worth
-- protecting.

DROP TRIGGER IF EXISTS notify_staff_of_new_lead ON public.leads;
CREATE TRIGGER notify_staff_of_new_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW
  WHEN (NEW.suspected_spam IS NOT TRUE)
  EXECUTE FUNCTION public.notify_staff_of_new_lead();

DROP TRIGGER IF EXISTS emit_lead_new_to_router ON public.leads;
CREATE TRIGGER emit_lead_new_to_router
  AFTER INSERT ON public.leads
  FOR EACH ROW
  WHEN (NEW.suspected_spam IS NOT TRUE)
  EXECUTE FUNCTION public.emit_lead_new_to_router();

COMMENT ON COLUMN public.leads.suspected_spam IS
  'public-submit''s guess. Suppresses BOTH new-lead triggers via their WHEN clause and does '
  'nothing else: the enquiry is saved, listed and badged, and one press clears the flag. Never a '
  'reason to hide or delete an enquiry.';

-- ── rollback ────────────────────────────────────────────────────────────────
-- Restores the unconditional triggers. The functions are untouched by this migration, so this
-- is the whole of it.
--
-- DROP TRIGGER IF EXISTS notify_staff_of_new_lead ON public.leads;
-- CREATE TRIGGER notify_staff_of_new_lead
--   AFTER INSERT ON public.leads FOR EACH ROW
--   EXECUTE FUNCTION public.notify_staff_of_new_lead();
-- DROP TRIGGER IF EXISTS emit_lead_new_to_router ON public.leads;
-- CREATE TRIGGER emit_lead_new_to_router
--   AFTER INSERT ON public.leads FOR EACH ROW
--   EXECUTE FUNCTION public.emit_lead_new_to_router();
