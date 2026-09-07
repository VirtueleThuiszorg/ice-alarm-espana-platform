-- WP5 — the circle of care: who the people around a member actually are.
--
-- Design and reasoning: CIRCLE_OF_CARE.md. The distinction the whole increment turns on:
-- THIS IS WHO THE PEOPLE ARE. `care_access_grants` is WHAT THEY MAY SEE, and it is untouched.
-- A neighbour with a key may be phoned at 3am; that does not entitle them to a medical record,
-- and nothing here gives them one.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.member_care;
--   ALTER TABLE public.member_access DROP COLUMN IF EXISTS gate_code;
--   ALTER TABLE public.members
--     DROP COLUMN IF EXISTS away_from, DROP COLUMN IF EXISTS away_until,
--     DROP COLUMN IF EXISTS pendant_with_member, DROP COLUMN IF EXISTS urbanizacion,
--     DROP COLUMN IF EXISTS bloque, DROP COLUMN IF EXISTS portal, DROP COLUMN IF EXISTS escalera;
--   ALTER TABLE public.emergency_contacts
--     DROP COLUMN IF EXISTS can_attend_in_person, DROP COLUMN IF EXISTS country,
--     DROP COLUMN IF EXISTS availability_notes,
--     DROP CONSTRAINT IF EXISTS emergency_contacts_contact_type_check;
--   ALTER TABLE public.emergency_contacts ADD CONSTRAINT emergency_contacts_contact_type_check
--     CHECK (contact_type IN ('emergency','key_holder'));
--   Reversible, and narrowing the CHECK back only fails if rows already use a new value —
--   which is the correct failure: it refuses to silently invalidate real data.

-- ── 1. the contact list can describe the people it holds ───────────────────
-- Widening a CHECK is backward-compatible: every existing row stays valid and the default is
-- unchanged. Before this, a care agency, a district nurse, a social worker and the neighbour
-- with the spare key were all 'emergency' with a sentence of free text beside them.
ALTER TABLE public.emergency_contacts
  DROP CONSTRAINT IF EXISTS emergency_contacts_contact_type_check;

ALTER TABLE public.emergency_contacts
  ADD CONSTRAINT emergency_contacts_contact_type_check
  CHECK (contact_type IN (
    'emergency', 'key_holder', 'carer', 'care_agency',
    'nurse', 'social_worker', 'neighbour', 'legal_representative'
  ));

ALTER TABLE public.emergency_contacts
  -- The single most operationally useful fact about a contact, and it was not stored: a
  -- daughter in Manchester and a neighbour two doors down were indistinguishable to the
  -- escalation ladder. NULL means unknown, which is honest — it is not the same as false.
  ADD COLUMN IF NOT EXISTS can_attend_in_person boolean,
  ADD COLUMN IF NOT EXISTS country text,
  -- Free text on purpose. "Nights only", "works Tuesdays", "deaf — text first" resist an enum,
  -- and forcing one produces categories people lie to fit.
  ADD COLUMN IF NOT EXISTS availability_notes text;

COMMENT ON COLUMN public.emergency_contacts.can_attend_in_person IS
  'Can this contact physically get to the member? NULL = unknown, which is not false. '
  'Recorded by WP5; the escalation ladder does not yet order by it (SOS path, human gate).';

-- ── 2. away status and the Spanish address ─────────────────────────────────
-- On `members` because these are ordinary profile facts the member may maintain themselves.
-- "Members can update own profile" already covers them, and guard_member_status_self_write
-- (20260904180000) keeps `status` out of reach — so widening this table does not widen that.
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS away_from date,
  ADD COLUMN IF NOT EXISTS away_until date,
  -- A device gone quiet and a device in a drawer in Birmingham are different problems.
  ADD COLUMN IF NOT EXISTS pendant_with_member boolean,
  -- An ambulance crew with the street but not the portal is standing outside a gated
  -- development at night. This is where the minutes go.
  ADD COLUMN IF NOT EXISTS urbanizacion text,
  ADD COLUMN IF NOT EXISTS bloque text,
  ADD COLUMN IF NOT EXISTS portal text,
  ADD COLUMN IF NOT EXISTS escalera text;

COMMENT ON COLUMN public.members.away_from IS
  'Member-writable by design: someone going to the UK for a month should be able to say so '
  'without ringing the office.';

-- ── 3. the gate code is a credential, so it lives with the other credential ─
-- NOT on `members`: that table is readable by every is_staff policy. member_access is the
-- admin-only store that already exists for exactly this (key safe code, location, notes).
ALTER TABLE public.member_access
  ADD COLUMN IF NOT EXISTS gate_code text;

COMMENT ON COLUMN public.member_access.gate_code IS
  'Gated-development entry code. Treat as a credential, exactly like key_safe_code. '
  'Never log this value.';

-- ── 4. the care picture — special category, admin-restricted ───────────────
CREATE TABLE IF NOT EXISTS public.member_care (
  member_id                 uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  agency                    text,
  visit_schedule            text,
  day_centre                text,
  medical_equipment         text,
  -- WHERE the document is kept, deliberately not what it says. A record of refused treatment
  -- does not belong in a free-text column on an operational table.
  advance_directive_location text,
  -- Tarjeta Sanitaria Individual — the Spanish health card number.
  tsi_number                text,
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.member_care IS
  'Operational care picture: agency, visits, day centre, equipment, advance-directive location, '
  'TSI. Special-category data (GDPR art. 9). Admin-restricted, on the member_access model — '
  'NOT is_staff. See CIRCLE_OF_CARE.md §2.3.';

DROP TRIGGER IF EXISTS update_member_care_updated_at ON public.member_care;
CREATE TRIGGER update_member_care_updated_at
  BEFORE UPDATE ON public.member_care
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.member_care ENABLE ROW LEVEL SECURITY;

-- Modelled on member_access (20260903091300), not on the ordinary member tables. If a
-- call-centre operator needs an advance-directive location during an alert, that must be a
-- deliberate decision with an access log behind it, not a side effect of a broad is_staff
-- policy. That argument was made for a key safe code; it applies at least as strongly to a
-- document recording what treatment somebody has refused.
CREATE POLICY "Admins can view member care"
  ON public.member_care FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage member care"
  ON public.member_care FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- The member reads their own row. There is deliberately NO member write policy: this is
-- maintained by the office, and a member editing their own recorded equipment or directive
-- location would be a change nobody reviewed.
CREATE POLICY "Members can view own care data"
  ON public.member_care FOR SELECT TO authenticated
  USING (member_id = public.get_member_id(auth.uid()));
