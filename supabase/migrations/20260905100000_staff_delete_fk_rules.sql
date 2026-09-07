-- Foreign keys with no delete rule block every staff and admin deletion.
--
-- THE DEFECT. Columns that record WHO DID SOMETHING were declared as a bare
-- `REFERENCES public.staff(id)` / `REFERENCES auth.users(id)` with no ON DELETE clause. In
-- PostgreSQL that means NO ACTION: the referenced row cannot be deleted while any referencing
-- row survives. So a staff member who had ever sent a notification, drafted a social post, run
-- a CRM import, issued a member-update token, been assigned a task or recorded a member's
-- contacts could not be deleted at all.
--
-- THE LIST WAS LONGER THAN REPORTED. The brief named five columns. The RLS harness found a
-- sixth on the first run (`emergency_contacts.recorded_by_staff`, added in #160 — my own), and
-- a catalog sweep found roughly thirty-five. So this migration does NOT hard-code a list: it
-- finds every single-column NO ACTION foreign key pointing at `public.staff` or `auth.users`
-- and fixes the ones it safely can. A hand-written list would have been wrong the day it was
-- written and wrong again on the next migration.
--
-- SET NULL, NOT CASCADE, and the difference is the whole point. These are AUDIT rows.
-- Cascading would delete the notification log, the social posts, the import batches and the
-- tokens when the person who created them leaves — destroying the record of what happened
-- because the actor is gone. Setting the column NULL keeps the event and loses only the
-- attribution. "We no longer know who" is recoverable from backups and context; "it never
-- happened" is not.
--
-- Same reasoning already applied deliberately elsewhere in this schema:
-- `care_access_grants.grantee_user_id` is ON DELETE SET NULL so a carer deleting their account
-- LOSES access rather than gaining it; `granted_by_user_id` carries no FK at all so it can
-- never block a delete; `payers.user_id` (20260904170000) follows the same rule.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH: NOT NULL columns. `SET NULL` is impossible on one, so
-- each needs a real per-table decision (CASCADE? RESTRICT? reassign first?) — for example a
-- shift's `cover_staff_id` or a rota's `original_staff_id`, where deleting the staff member
-- should arguably be refused until the shift is reassigned. Those are listed by NOTICE at the
-- end of this migration and recorded in PENDING_FOR_LEE.md rather than swept up silently.
--
-- ROLLBACK: restores NO ACTION for every constraint this changed. Written out at the foot of
-- this file as a runnable block. No data is touched either way — only the delete rule changes.

DO $$
DECLARE
  fk        record;
  n_fixed   int := 0;
  n_skipped int := 0;
  skipped   text := '';
BEGIN
  FOR fk IN
    SELECT c.conname,
           t.relname   AS tbl,
           a.attname   AS col,
           a.attnotnull AS col_not_null,
           rn.nspname  AS ref_schema,
           rt.relname  AS ref_table
      FROM pg_constraint c
      JOIN pg_class      t  ON t.oid  = c.conrelid
      JOIN pg_namespace  tn ON tn.oid = t.relnamespace AND tn.nspname = 'public'
      JOIN pg_class      rt ON rt.oid = c.confrelid
      JOIN pg_namespace  rn ON rn.oid = rt.relnamespace
      JOIN pg_attribute  a  ON a.attrelid = t.oid
                           AND a.attnum   = c.conkey[1]
                           AND NOT a.attisdropped
     WHERE c.contype = 'f'
       AND array_length(c.conkey, 1) = 1          -- never rewrite a composite key
       AND c.confdeltype = 'a'                    -- 'a' = NO ACTION, the defect
       AND (   (rn.nspname = 'public' AND rt.relname = 'staff')
            OR (rn.nspname = 'auth'   AND rt.relname = 'users'))
     ORDER BY t.relname, a.attname
  LOOP
    IF fk.col_not_null THEN
      -- Cannot SET NULL. Needs a per-table decision, so it is reported, not guessed at.
      n_skipped := n_skipped + 1;
      skipped := skipped || fk.tbl || '.' || fk.col || ' ';
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', fk.tbl, fk.conname);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(id) ON DELETE SET NULL',
      fk.tbl, fk.conname, fk.col, fk.ref_schema, fk.ref_table);
    n_fixed := n_fixed + 1;
  END LOOP;

  RAISE NOTICE 'staff_delete_fk_rules: % nullable FK(s) -> ON DELETE SET NULL', n_fixed;
  IF n_skipped > 0 THEN
    RAISE NOTICE 'staff_delete_fk_rules: % NOT NULL FK(s) left alone, each needs its own decision: %',
      n_skipped, skipped;
  END IF;
END $$;

COMMENT ON COLUMN public.notification_log.admin_user_id IS
  'Who triggered this notification. ON DELETE SET NULL: the log survives the staff member.';
COMMENT ON COLUMN public.member_update_tokens.created_by IS
  'Which staff member issued this token. ON DELETE SET NULL: the record survives them.';


-- ── The attribution CHECK had to become a trigger ──────────────────────────
--
-- 20260904150000 added this constraint to member_update_tokens:
--
--   CHECK (submitted_via IS NULL
--          OR (submitted_via = 'member_link'       AND submitted_by_staff IS NULL)
--          OR (submitted_via = 'operator_assisted' AND submitted_by_staff IS NOT NULL))
--
-- Its purpose is real and stays: AN OPERATOR-ENTERED RECORD CANNOT BE CREATED ANONYMOUSLY.
--
-- But it also made the row permanently un-orphanable. Setting submitted_by_staff to NULL when
-- that staff member is deleted violates the third branch, so the FK fix above would fail on any
-- token an operator had ever submitted — reintroducing exactly the bug this migration exists to
-- remove. The harness caught this on the first run; it is not theoretical.
--
-- The two properties are different in TIME, which is why one constraint could not hold both:
--   * at write time  — you may not claim an operator did this without naming them
--   * ever after     — that operator's account may legitimately be deleted, and the record then
--                      degrades to "an operator, since departed", which is honest
--
-- A CHECK cannot tell those apart; it sees only the finished row. A trigger can, because it sees
-- OLD and NEW. So the CHECK keeps the half that is timeless (a member_link submission may never
-- name an operator) and the trigger takes the half that is about the act of writing.

ALTER TABLE public.member_update_tokens
  DROP CONSTRAINT IF EXISTS member_update_tokens_attribution_chk;

ALTER TABLE public.member_update_tokens
  ADD CONSTRAINT member_update_tokens_attribution_chk CHECK (
    submitted_via IS NULL
    OR (submitted_via = 'member_link' AND submitted_by_staff IS NULL)
    OR submitted_via = 'operator_assisted'
  );

CREATE OR REPLACE FUNCTION public.guard_member_update_attribution()
RETURNS trigger
LANGUAGE plpgsql
AS $guard$
BEGIN
  -- Only polices the act of ATTRIBUTING. A later UPDATE that leaves submitted_via untouched --
  -- which is what ON DELETE SET NULL performs -- is allowed through, so a departing staff
  -- member never breaks a historical record.
  IF NEW.submitted_via IS DISTINCT FROM COALESCE(OLD.submitted_via, NULL)
     AND NEW.submitted_via = 'operator_assisted'
     AND NEW.submitted_by_staff IS NULL THEN
    RAISE EXCEPTION
      'an operator_assisted submission must name the operator (submitted_by_staff is NULL)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $guard$;

CREATE TRIGGER guard_member_update_attribution
  BEFORE INSERT OR UPDATE ON public.member_update_tokens
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_update_attribution();

-- Rollback for this half:
--   DROP TRIGGER IF EXISTS guard_member_update_attribution ON public.member_update_tokens;
--   DROP FUNCTION IF EXISTS public.guard_member_update_attribution();
--   ALTER TABLE public.member_update_tokens DROP CONSTRAINT member_update_tokens_attribution_chk;
--   ALTER TABLE public.member_update_tokens ADD CONSTRAINT member_update_tokens_attribution_chk
--     CHECK (submitted_via IS NULL
--            OR (submitted_via = 'member_link' AND submitted_by_staff IS NULL)
--            OR (submitted_via = 'operator_assisted' AND submitted_by_staff IS NOT NULL));

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Restores NO ACTION (what a bare REFERENCES meant) for every nullable staff/auth.users FK:
--
-- DO $rollback$
-- DECLARE fk record;
-- BEGIN
--   FOR fk IN
--     SELECT c.conname, t.relname AS tbl, a.attname AS col,
--            rn.nspname AS ref_schema, rt.relname AS ref_table
--       FROM pg_constraint c
--       JOIN pg_class t ON t.oid = c.conrelid
--       JOIN pg_namespace tn ON tn.oid = t.relnamespace AND tn.nspname = 'public'
--       JOIN pg_class rt ON rt.oid = c.confrelid
--       JOIN pg_namespace rn ON rn.oid = rt.relnamespace
--       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1] AND NOT a.attisdropped
--      WHERE c.contype='f' AND array_length(c.conkey,1)=1 AND c.confdeltype='n'
--        AND NOT a.attnotnull
--        AND ((rn.nspname='public' AND rt.relname='staff') OR (rn.nspname='auth' AND rt.relname='users'))
--   LOOP
--     EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', fk.tbl, fk.conname);
--     EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(id)',
--                    fk.tbl, fk.conname, fk.col, fk.ref_schema, fk.ref_table);
--   END LOOP;
-- END $rollback$;
