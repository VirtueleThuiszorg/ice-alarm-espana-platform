-- Staff-holiday workflow: never-silent notifications + supervisor as primary
-- owner (Lee's requirements A + B, 2026-07-24).
--
-- Context: 20260228100000 locked notification_log INSERT to service_role,
-- which silently killed every client-side notification (the hooks never
-- checked the insert error). SELECT was admin-only, so agents/supervisors
-- could never read notifications anyway, and no UPDATE policy existed so
-- mark-as-read was dead for everyone.

-- 1. Reads: the targeted user sees their own; broadcasts (admin_user_id NULL)
--    are visible to all active staff; admins keep full oversight.
DROP POLICY IF EXISTS "Admins view notification logs" ON public.notification_log;
CREATE POLICY "Notifications: target, staff broadcast, admin oversight"
ON public.notification_log FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR admin_user_id = auth.uid()
  OR (admin_user_id IS NULL AND public.is_staff(auth.uid()))
);

-- 2. Inserts: active staff may create notifications (scoped, unlike the
--    pre-0228 WITH CHECK(true) that let ANON insert). The service_role
--    policy from 20260228100000 stays for edge functions.
CREATE POLICY "Staff create notifications"
ON public.notification_log FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()));

-- 3. Mark-as-read: users on their own rows; admins on all.
--    (Broadcast rows are shared — marking one read marks it for everyone;
--    holiday/cover events are therefore always TARGETED rows.)
CREATE POLICY "Users mark own notifications read"
ON public.notification_log FOR UPDATE TO authenticated
USING (admin_user_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (admin_user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 4. Shift takeover: the covering staff member may reassign the covered
--    shift TO THEMSELVES once their cover row is accepted. Fixes the silent
--    RLS denial where an agent's Accept never actually moved the shift.
CREATE POLICY "Cover staff take over accepted shifts"
ON public.staff_shifts FOR UPDATE TO authenticated
USING (
  id IN (
    SELECT c.shift_id FROM public.staff_shift_covers c
    WHERE c.status = 'accepted'
      AND c.cover_staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
  )
)
WITH CHECK (
  staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
);

-- Rollback:
--   DROP POLICY "Notifications: target, staff broadcast, admin oversight" ON public.notification_log;
--   CREATE POLICY "Admins view notification logs" ON public.notification_log FOR SELECT USING (public.is_admin(auth.uid()));
--   DROP POLICY "Staff create notifications" ON public.notification_log;
--   DROP POLICY "Users mark own notifications read" ON public.notification_log;
--   DROP POLICY "Cover staff take over accepted shifts" ON public.staff_shifts;
