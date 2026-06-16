-- First-admin bootstrap (audit finding: no bootstrap mechanism existed).
--
-- is_admin()/get_staff_role() read role from public.staff, and every staff-creation
-- path (staff-send-invite / staff-register) requires an existing admin — a chicken-and-
-- egg on a fresh project. This function creates OR promotes a staff row to super_admin
-- for a given auth user, and ATOMICALLY REFUSES if any super_admin already exists, so it
-- can never be used to escalate privileges after the first admin is established.

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  -- Self-disabling guard: once ANY super_admin exists (active or not), refuse forever.
  IF EXISTS (SELECT 1 FROM public.staff WHERE role = 'super_admin') THEN
    RAISE EXCEPTION 'bootstrap_first_admin refused: a super_admin already exists'
      USING ERRCODE = 'P0001';
  END IF;

  -- Create, or promote an existing staff row for this auth user, to super_admin.
  INSERT INTO public.staff (user_id, email, first_name, last_name, role, is_active)
  VALUES (p_user_id, p_email, p_first_name, p_last_name, 'super_admin', true)
  ON CONFLICT (user_id) DO UPDATE
    SET role = 'super_admin',
        is_active = true,
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name
  RETURNING id INTO v_staff_id;

  RETURN v_staff_id;
END;
$$;

-- One-time cutover tool: callable only by the service role (which bypasses grants).
-- Never expose to anon/authenticated.
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(uuid, text, text, text) FROM authenticated;

COMMENT ON FUNCTION public.bootstrap_first_admin(uuid, text, text, text) IS
  'One-shot first-admin bootstrap. Promotes/creates a super_admin for the given auth user; '
  'raises if any super_admin already exists (self-disabling, cannot be used to escalate later). '
  'Service-role only. See CUTOVER_RUNBOOK.md Step C.';
