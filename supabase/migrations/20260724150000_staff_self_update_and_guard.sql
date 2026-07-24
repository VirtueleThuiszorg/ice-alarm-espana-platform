-- Client-write sweep fix (2026-07-24): staff self-service writes were
-- silently RLS-denied — the ONLY write policy on public.staff is
-- super_admin-manage, so the call-centre header's on-call toggle and the
-- staff preferences page failed for every operator/supervisor/admin.
--
-- Fix: a narrow self-update policy + a BEFORE UPDATE trigger that keeps
-- privileged fields immutable for non-super-admins (golden rule #3: no
-- client-writable roles — RLS alone cannot compare OLD vs NEW).

CREATE POLICY "Staff update own row"
ON public.staff FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_staff_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (edge functions: staff-complete-invite etc.) and direct
  -- SQL/migrations bypass the guard; super admins may change anything.
  IF auth.uid() IS NULL OR auth.role() = 'service_role'
     OR public.get_staff_role(auth.uid()) = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.escalation_priority IS DISTINCT FROM OLD.escalation_priority
     OR NEW.annual_holiday_days IS DISTINCT FROM OLD.annual_holiday_days THEN
    RAISE EXCEPTION 'privileged staff fields can only be changed by a super admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_self_update_guard ON public.staff;
CREATE TRIGGER staff_self_update_guard
BEFORE UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.guard_staff_self_update();

-- Rollback:
--   DROP TRIGGER staff_self_update_guard ON public.staff;
--   DROP FUNCTION public.guard_staff_self_update();
--   DROP POLICY "Staff update own row" ON public.staff;
