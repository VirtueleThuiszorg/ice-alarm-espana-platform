-- ICE import: member_end_of_life - funeral plan and wishes, ADMIN-RESTRICTED.
--
-- 41 funeral plans, 17 policy numbers, 17 sets of wishes in the export.
-- Sensitive and rarely needed operationally, so it follows member_access
-- rather than the broad is_staff pattern.
--
-- Reverse: DROP TABLE public.member_end_of_life;

CREATE TABLE IF NOT EXISTS public.member_end_of_life (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  funeral_plan text,
  policy_number text,
  wishes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_member_end_of_life_updated_at ON public.member_end_of_life;
CREATE TRIGGER update_member_end_of_life_updated_at
  BEFORE UPDATE ON public.member_end_of_life
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.member_end_of_life ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view end of life data" ON public.member_end_of_life;
CREATE POLICY "Admins can view end of life data" ON public.member_end_of_life
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Admins can manage end of life data" ON public.member_end_of_life;
CREATE POLICY "Admins can manage end of life data" ON public.member_end_of_life
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Members can view own end of life data" ON public.member_end_of_life;
CREATE POLICY "Members can view own end of life data" ON public.member_end_of_life
  FOR SELECT TO authenticated USING (member_id = public.get_member_id(auth.uid()));
