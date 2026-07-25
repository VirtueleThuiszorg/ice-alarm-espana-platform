-- SECURITY (night audit 2026-07-24, BLOCKER 4): the partners own-row UPDATE
-- policy ("Partners can update own record", USING/WITH CHECK user_id =
-- auth.uid()) is COLUMN-BLIND and there is no guard trigger — so a partner
-- could self-set alert_visibility_enabled, the sole gate on the resident
-- SOS-alert stream (partner-alert-notify emission + partner_alert_
-- subscriptions RLS), plus status / partner_type / billing_model /
-- referral_code / user_id.
--
-- Fix: BEFORE UPDATE guard trigger (RLS cannot compare OLD vs NEW), same
-- pattern as guard_staff_self_update (20260724150000). Staff and the
-- service role stay exempt: the admin toggle in PartnerOrganizationTab and
-- edge functions keep working. Partner self-service that must keep working
-- and is deliberately NOT guarded: contact/facility profile fields, payout
-- fields, preferred_language, and agreement signing (agreement_signed_at).

CREATE OR REPLACE FUNCTION public.guard_partner_privileged_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (edge functions/migrations) and staff (admin UI) exempt.
  IF auth.uid() IS NULL OR auth.role() = 'service_role'
     OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.alert_visibility_enabled IS DISTINCT FROM OLD.alert_visibility_enabled
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.partner_type IS DISTINCT FROM OLD.partner_type
     OR NEW.billing_model IS DISTINCT FROM OLD.billing_model
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'privileged partner fields can only be changed by Care Conneqt staff';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_privileged_update_guard ON public.partners;
CREATE TRIGGER partner_privileged_update_guard
BEFORE UPDATE ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.guard_partner_privileged_update();

-- Rollback:
--   DROP TRIGGER partner_privileged_update_guard ON public.partners;
--   DROP FUNCTION public.guard_partner_privileged_update();
