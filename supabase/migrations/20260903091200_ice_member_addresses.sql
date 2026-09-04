-- ICE import: member_addresses - secondary addresses.
--
-- members holds exactly one address, which must stay the home /
-- emergency-response address so the alert path never has to join to find where
-- to send an ambulance. Everything else lives here:
--   postal      45 rows - KarmaCRM "Postal Address (If Different)"
--   legacy_home 35 rows - the old Street/City (h) block; may disagree with the
--                         Home * fields, so it is imported for review, not merged
--   work        21 rows
--   other        2 rows
--
-- Reverse: DROP TABLE public.member_addresses;

CREATE TABLE IF NOT EXISTS public.member_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  address_type text NOT NULL CHECK (address_type IN ('postal','billing','work','legacy_home','other')),
  address_line_1 text,
  address_line_2 text,
  city text,
  province text,
  county text,
  postal_code text,
  country text DEFAULT 'Spain',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_addresses_member_id ON public.member_addresses(member_id);

DROP TRIGGER IF EXISTS update_member_addresses_updated_at ON public.member_addresses;
CREATE TRIGGER update_member_addresses_updated_at
  BEFORE UPDATE ON public.member_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.member_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view member addresses" ON public.member_addresses;
CREATE POLICY "Staff can view member addresses" ON public.member_addresses
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can manage member addresses" ON public.member_addresses;
CREATE POLICY "Staff can manage member addresses" ON public.member_addresses
  FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Members can view own addresses" ON public.member_addresses;
CREATE POLICY "Members can view own addresses" ON public.member_addresses
  FOR SELECT TO authenticated USING (member_id = public.get_member_id(auth.uid()));
DROP POLICY IF EXISTS "Members can manage own addresses" ON public.member_addresses;
CREATE POLICY "Members can manage own addresses" ON public.member_addresses
  FOR ALL TO authenticated USING (member_id = public.get_member_id(auth.uid()));
