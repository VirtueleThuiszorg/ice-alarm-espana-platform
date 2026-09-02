-- ICE import: member_access - key safe and physical access, ADMIN-RESTRICTED.
--
-- 96 records carry a key safe entry. This is the code to the front door of an
-- occupied home, usually an older person living alone. It is deliberately NOT
-- readable by every staff role and NOT readable by the member's family.
--
-- Policy differs from the other member tables on purpose:
--   - read: admin only (is_admin), not is_staff
--   - write: admin only
--   - the member themselves may read their own row, and nothing else
-- If call-centre operators need key safe codes during an alert, that must be a
-- deliberate decision with an access log behind it, not a side effect of a
-- broad is_staff policy.
--
-- Reverse: DROP TABLE public.member_access;

CREATE TABLE IF NOT EXISTS public.member_access (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  key_safe_location text,
  key_safe_code text,
  access_notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.member_access IS 'Physical access data for occupied homes. Admin-restricted. Never log these values.';
COMMENT ON COLUMN public.member_access.key_safe_code IS 'Front-door key safe code. Treat as a credential.';

DROP TRIGGER IF EXISTS update_member_access_updated_at ON public.member_access;
CREATE TRIGGER update_member_access_updated_at
  BEFORE UPDATE ON public.member_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.member_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view member access" ON public.member_access;
CREATE POLICY "Admins can view member access" ON public.member_access
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Admins can manage member access" ON public.member_access;
CREATE POLICY "Admins can manage member access" ON public.member_access
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Members can view own access data" ON public.member_access;
CREATE POLICY "Members can view own access data" ON public.member_access
  FOR SELECT TO authenticated USING (member_id = public.get_member_id(auth.uid()));
