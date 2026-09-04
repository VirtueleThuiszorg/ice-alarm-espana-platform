-- A member could set their own members.status = 'active'. Measured: one row affected.
--
-- "Members can update own profile" (20260121143325) is FOR UPDATE with no column restriction,
-- and there is no guard trigger on the table. So a signed-in member could run
--
--   UPDATE public.members SET status = 'active' WHERE user_id = auth.uid();
--
-- Golden rule 4: "A member is activated by the payment webhook, never by client-side code or
-- onboarding forms." The SUBSCRIPTIONS half of that has been enforced and proven since #123 (a
-- member cannot self-activate a subscription — 0 rows). The MEMBERS.STATUS half never was, and
-- the isolation suite tested the subscription and not the member row, which is exactly the gap
-- that let it survive from the base migration to now.
--
-- WHY A TRIGGER RATHER THAN NARROWING THE POLICY. Postgres RLS is row-level, not column-level:
-- a policy cannot say "you may update these columns but not that one". Column privileges
-- (GRANT UPDATE (col,...)) could, but they would have to enumerate every currently-writable
-- column, and a future ALTER TABLE ADD COLUMN would silently become non-writable — failing in
-- the confusing direction, on a table the member self-service pages write. A BEFORE UPDATE
-- trigger sees every write, names the one column it protects, and leaves everything else alone.
--
-- Same pattern and same reasoning as the staff privilege-escalation guard (20260724150000).
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS guard_member_status_self_write ON public.members;
--   DROP FUNCTION IF EXISTS public.guard_member_status_self_write();

CREATE OR REPLACE FUNCTION public.guard_member_status_self_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nothing to guard unless status is actually changing. An ordinary profile update (phone,
  -- address, NIE) must stay exactly as cheap as it was.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- service_role (the payment webhook, submit_registration_atomic, a migration) has no
  -- auth.uid(). That is the ONLY route by which a member becomes active, which is golden
  -- rule 4 stated as a code path.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Staff may change a member's status — suspending an account is a real operator action, and
  -- staff writes are already attributed elsewhere.
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Anyone else changing status is the member changing their own, because RLS has already
  -- restricted them to their own row. Refuse loudly: a silent revert would leave the member
  -- believing they had activated themselves.
  RAISE EXCEPTION
    'members.status is not self-writable: activation is the payment webhook''s job (golden rule 4). Attempted % -> %',
    OLD.status, NEW.status
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER guard_member_status_self_write
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_status_self_write();
