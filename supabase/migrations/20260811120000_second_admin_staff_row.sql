-- ============================================================
-- Second admin: create (or promote) one public.staff row with role='admin'.
--
-- WHY A MIGRATION, NOT A MANUAL INSERT: a hand-run INSERT against prod leaves no
-- trace in the repo, cannot be reviewed, and cannot be replayed on a rebuilt
-- environment. This is reviewable, idempotent, audited, and reversible.
--
-- NO IDENTITY IS COMMITTED. The address is supplied at apply time through the
-- `app.second_admin_email` setting, never written into this file. Names are
-- optional and default to generic placeholders the admin can edit in-app.
--
-- HOW TO APPLY (the identity stays on your machine):
--   psql "$DATABASE_URL" \
--     -c "SET app.second_admin_email = 'the-address';" \
--     -f supabase/migrations/20260811120000_second_admin_staff_row.sql
--
--   -- or, to set it for a whole `supabase db push` session:
--   ALTER DATABASE postgres SET app.second_admin_email = 'the-address';
--   -- (then RESET it afterwards: ALTER DATABASE postgres RESET app.second_admin_email;)
--
-- WITHOUT the setting this migration is a deliberate NO-OP: it emits a NOTICE and
-- changes nothing, so `db push` on CI or a fresh environment still succeeds. This
-- follows the STAGE_0B lesson (20260723120000): never let an un-guarded
-- `current_setting('app.settings.*')` throw — every read here uses missing_ok.
--
-- PRECONDITION: the auth user must already exist (created in the Supabase
-- dashboard, or by scripts/reset-staff-logins.ts). This migration only creates
-- the public.staff row that grants the admin role; it never creates auth users,
-- and it never sets a password.
--
-- is_active IS NOT TOUCHED. It is GENERATED ALWAYS AS (status = 'active') STORED
-- (20260301135110, recreated 20260303150000). Driving it directly raises
-- "cannot insert a non-DEFAULT value into column is_active" — the exact bug
-- hotfixed in 20260617130000. We set the SOURCE column, status='active', so
-- is_active computes true on both the insert and the promote path.
--
-- ROLE SAFETY: role is 'admin', not 'super_admin'. Golden rule 3 — roles are
-- assigned by trigger/admin/migration only, never by the client. This migration
-- is service-role/superuser territory (it is applied by the migration runner);
-- nothing here is reachable from the app.
--
-- Reversible. Down (rollback) — restores the exact prior state, which this
-- migration recorded in activity_logs before changing anything:
--
--   -- 1. Inspect what this migration did (newest first):
--   SELECT entity_id, old_values, new_values, created_at
--     FROM public.activity_logs
--    WHERE action = 'second_admin_provisioned'
--    ORDER BY created_at DESC;
--
--   -- 2a. If old_values->>'existed' = 'false', the row was created by this
--   --     migration — delete it:
--   DELETE FROM public.staff WHERE id = '<entity_id>';
--
--   -- 2b. If old_values->>'existed' = 'true', the row pre-existed and was
--   --     promoted — restore the recorded role and status:
--   UPDATE public.staff
--      SET role   = (old_values->>'role')::public.app_role,
--          status =  old_values->>'status'
--     FROM public.activity_logs
--    WHERE public.staff.id = public.activity_logs.entity_id
--      AND public.activity_logs.action = 'second_admin_provisioned';
--
--   -- 3. Drop the audit rows for this migration if you want a clean revert:
--   DELETE FROM public.activity_logs WHERE action = 'second_admin_provisioned';
-- ============================================================

DO $$
DECLARE
  v_email       text := nullif(trim(coalesce(current_setting('app.second_admin_email', true), '')), '');
  v_first_name  text := nullif(trim(coalesce(current_setting('app.second_admin_first_name', true), '')), '');
  v_last_name   text := nullif(trim(coalesce(current_setting('app.second_admin_last_name',  true), '')), '');
  v_user_id     uuid;
  v_staff_id    uuid;
  v_prior_role   public.app_role;
  v_prior_status text;
  v_existed      boolean;
BEGIN
  -- Guarded no-op: nothing supplied, nothing to do. Never throws.
  IF v_email IS NULL THEN
    RAISE NOTICE
      'second_admin: app.second_admin_email not set — skipping (no-op). See this migration''s header to apply.';
    RETURN;
  END IF;

  -- Generic defaults so no real name is ever required in the repo or the command.
  v_first_name := coalesce(v_first_name, 'Care');
  v_last_name  := coalesce(v_last_name,  'Administrator');

  -- The auth user must already exist. Fail loud rather than create a staff row
  -- that can never be logged into (GOALS.md G2).
  SELECT id INTO v_user_id
    FROM auth.users
   WHERE lower(email) = lower(v_email)
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'second_admin: no auth.users row matches the supplied address. Create the auth user first (dashboard or scripts/reset-staff-logins.ts), then re-run. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Capture prior state BEFORE mutating, so the documented rollback is exact.
  SELECT id, role, status INTO v_staff_id, v_prior_role, v_prior_status
    FROM public.staff
   WHERE user_id = v_user_id;

  v_existed := v_staff_id IS NOT NULL;

  IF v_existed AND v_prior_role = 'admin' AND v_prior_status = 'active' THEN
    RAISE NOTICE 'second_admin: staff row % is already an active admin — nothing to do (idempotent).', v_staff_id;
    RETURN;
  END IF;

  -- status='active' drives the GENERATED is_active column. Never write is_active.
  INSERT INTO public.staff (user_id, email, first_name, last_name, role, status)
  VALUES (v_user_id, v_email, v_first_name, v_last_name, 'admin', 'active')
  ON CONFLICT (user_id) DO UPDATE
    SET role   = 'admin',
        status = 'active',
        email  = EXCLUDED.email
  RETURNING id INTO v_staff_id;

  -- Audit trail. Records the prior state the rollback needs. No secrets: the
  -- address is already in public.staff.email, and no password exists here.
  INSERT INTO public.activity_logs (staff_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (
    v_staff_id,
    'second_admin_provisioned',
    'staff',
    v_staff_id,
    jsonb_build_object(
      'existed', v_existed,
      'role',    v_prior_role,
      'status',  v_prior_status
    ),
    jsonb_build_object(
      'role',      'admin',
      'status',    'active',
      'source',    'migration 20260811120000_second_admin_staff_row.sql'
    )
  );

  IF v_existed THEN
    RAISE NOTICE 'second_admin: promoted existing staff row % to active admin (was role=%, status=%).',
      v_staff_id, v_prior_role, v_prior_status;
  ELSE
    RAISE NOTICE 'second_admin: created staff row % as active admin.', v_staff_id;
  END IF;
END;
$$;
