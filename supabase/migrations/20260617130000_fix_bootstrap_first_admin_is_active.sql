-- HOTFIX: bootstrap_first_admin wrote to staff.is_active, which is a GENERATED
-- column (GENERATED ALWAYS AS (status = 'active') STORED — see 20260303150000).
-- Postgres rejects it: "cannot insert a non-DEFAULT value into column is_active".
--
-- Fix: drive the SOURCE column instead. is_active = true  ⟺  status = 'active'.
-- We set status = 'active' (not is_active) in both the INSERT and the ON CONFLICT
-- UPDATE, so a bootstrapped super_admin still computes as active on BOTH paths
-- (new insert AND promotion of an existing row left in pending/suspended).
-- Everything else is identical to the original: super_admin guard / self-disable,
-- RETURNING id, SECURITY DEFINER, search_path, and the revoked grants.

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
  -- status = 'active' makes the generated is_active column compute to true.
  INSERT INTO public.staff (user_id, email, first_name, last_name, role, status)
  VALUES (p_user_id, p_email, p_first_name, p_last_name, 'super_admin', 'active')
  ON CONFLICT (user_id) DO UPDATE
    SET role = 'super_admin',
        status = 'active',
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
  'Sets status=active (is_active is a generated column). Service-role only. See CUTOVER_RUNBOOK.md Step C.';
