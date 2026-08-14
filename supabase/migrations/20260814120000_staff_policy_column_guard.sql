-- Tighten the staff self-update policy so the POLICY itself refuses a role change.
--
-- Before this, "Staff update own row" was:
--
--   USING (user_id = auth.uid())  WITH CHECK (user_id = auth.uid())
--
-- with no column restriction at all. A call-centre operator updating their own
-- row could set `role = 'super_admin'` as far as RLS was concerned; the ONLY
-- thing stopping them was the `staff_self_update_guard` trigger
-- (20260724150000). That trigger works — the isolation harness proves it fires —
-- but it was the sole control on privilege escalation, and golden rule 3 ("no
-- client-writable roles") deserves better than a single point of failure. Drop
-- or disable that one trigger and the door is open.
--
-- After this the policy and the trigger are independent controls: the policy
-- refuses the write at the RLS layer, and the trigger still refuses it at the
-- row layer. Defence in depth, not a chain.
--
-- WHY A FUNCTION: a WITH CHECK expression sees only the NEW row, never OLD, so it
-- cannot say "role must not change" directly. It can, however, ask the table what
-- the stored value currently is. SECURITY DEFINER because the caller is reading a
-- row they are otherwise allowed to see anyway — their own — and the function is
-- restricted to exactly that comparison.
--
-- Super admins are unaffected: "Super admins can manage staff" is a separate
-- PERMISSIVE policy, and permissive policies are OR'd, so their writes still pass
-- without touching this one. Edge functions run as service_role and bypass RLS.

CREATE OR REPLACE FUNCTION public.staff_privileged_columns_unchanged(
  _id uuid,
  _role public.app_role,
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- True only when the incoming values for the privilege-bearing columns match
  -- what is already stored for this row. A row that does not exist yields false,
  -- so an UPDATE cannot smuggle in a new id either.
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.id = _id
      AND s.role = _role
      AND s.user_id IS NOT DISTINCT FROM _user_id
  )
$$;

COMMENT ON FUNCTION public.staff_privileged_columns_unchanged(uuid, public.app_role, uuid) IS
  'WITH CHECK helper for "Staff update own row": pins role and user_id to their stored values so the policy itself refuses privilege escalation. Complements, and does not replace, staff_self_update_guard.';

REVOKE ALL ON FUNCTION public.staff_privileged_columns_unchanged(uuid, public.app_role, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_privileged_columns_unchanged(uuid, public.app_role, uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "Staff update own row" ON public.staff;

CREATE POLICY "Staff update own row"
  ON public.staff
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND public.staff_privileged_columns_unchanged(id, role, user_id)
  );

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Restores the previous policy exactly and removes the helper. The trigger is
-- untouched by this migration in either direction, so rolling back returns to
-- "trigger is the only control" rather than to no control at all.
--
--   DROP POLICY IF EXISTS "Staff update own row" ON public.staff;
--   CREATE POLICY "Staff update own row"
--     ON public.staff
--     FOR UPDATE
--     USING (user_id = auth.uid())
--     WITH CHECK (user_id = auth.uid());
--   DROP FUNCTION IF EXISTS public.staff_privileged_columns_unchanged(uuid, public.app_role, uuid);
