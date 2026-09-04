-- Provenance for a member's health data: WHO recorded it, and by WHICH route.
--
-- WHY THIS IS A TRIGGER AND NOT A COLUMN THE APPLICATION FILLS IN.
--
-- Once the join wizard stops collecting emergency contacts and medical information
-- (ONBOARDING_SPLIT.md), those rows are created after payment by one of two routes that ALREADY
-- BOTH EXIST and write through completely different paths:
--
--   1. the member, via their update link  -> submit-member-update (edge function, service_role)
--   2. an operator, with the member on the phone -> src/components/admin/member-detail/
--      ContactsTab.tsx:145,152 and MedicalTab.tsx:116,123 write DIRECTLY to the tables from the
--      browser under the "Staff can manage emergency contacts" / medical policies, and write
--      NO activity_logs row at all.
--
-- So there is no single code path to instrument. `submit-member-update` hardcodes
-- `updated_via: "member_update_link"` in its activity log (:192-197) regardless of who actually
-- keyed the data, and the admin tabs record nothing. Attribution added in either place would be
-- bypassed by the other, and by any third path added later.
--
-- A BEFORE trigger is the only place that sees every write. It also makes provenance
-- NON-CLIENT-WRITABLE, which is golden rule 3's reasoning ("no client-writable roles or tiers")
-- applied to health-data provenance: the trigger FORCES the values from the caller's identity
-- and discards whatever the client supplied, so an operator cannot write an unattributed row and
-- cannot write one attributed to somebody else.
--
-- GOALS.md G4: "Health data about vulnerable people. Beyond 'no breach': ... every access is
-- auditable." An unattributed health record is not auditable.
--
-- ROLLBACK (reversible, no data loss):
--   DROP TRIGGER IF EXISTS set_provenance_emergency_contacts ON public.emergency_contacts;
--   DROP TRIGGER IF EXISTS set_provenance_medical_information ON public.medical_information;
--   DROP FUNCTION IF EXISTS public.set_member_data_provenance();
--   ALTER TABLE public.emergency_contacts   DROP COLUMN recorded_via, DROP COLUMN recorded_by_staff;
--   ALTER TABLE public.medical_information  DROP COLUMN recorded_via, DROP COLUMN recorded_by_staff;
--   ALTER TABLE public.member_update_tokens DROP CONSTRAINT member_update_tokens_attribution_chk,
--     DROP COLUMN submitted_via, DROP COLUMN submitted_by_staff;

-- ── the vocabulary ─────────────────────────────────────────────────────────
-- Deliberately a CHECK rather than an enum: an enum needs its own migration to extend, and the
-- routes here will grow (partner-assisted, import). A CHECK is edited in place, reversibly.
ALTER TABLE public.emergency_contacts
  ADD COLUMN IF NOT EXISTS recorded_via TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by_staff UUID REFERENCES public.staff(id);

ALTER TABLE public.medical_information
  ADD COLUMN IF NOT EXISTS recorded_via TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by_staff UUID REFERENCES public.staff(id);

-- Existing rows keep NULL: we do NOT know who recorded them, and inventing an attribution
-- would be worse than admitting the gap. NULL reads as "recorded before provenance existed".
COMMENT ON COLUMN public.emergency_contacts.recorded_via IS
  'How this row was recorded: operator_assisted | member_self | member_link | server. '
  'Forced by set_member_data_provenance(); never accepted from a client. NULL = pre-provenance.';
COMMENT ON COLUMN public.medical_information.recorded_via IS
  'How this row was recorded: operator_assisted | member_self | member_link | server. '
  'Forced by set_member_data_provenance(); never accepted from a client. NULL = pre-provenance.';

-- ── the enforcement ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_member_data_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_staff uuid;
BEGIN
  IF v_uid IS NULL THEN
    -- No JWT: this is service_role — an edge function, a migration, or the RLS harness. Trusted
    -- server code, and the ONLY branch permitted to state its own route (submit-member-update
    -- passes 'member_link' or 'operator_assisted' depending on who authenticated to IT).
    -- Anything reaching here without a route is 'server', never silently a member's own act.
    NEW.recorded_via := COALESCE(NEW.recorded_via, 'server');
    RETURN NEW;
  END IF;

  SELECT id INTO v_staff FROM public.staff WHERE user_id = v_uid AND is_active = true;

  IF v_staff IS NOT NULL THEN
    -- An operator keyed this. FORCED, so a compromised or careless client cannot claim the
    -- member did it, and cannot omit itself.
    NEW.recorded_via      := 'operator_assisted';
    NEW.recorded_by_staff := v_staff;
    RETURN NEW;
  END IF;

  -- An authenticated non-staff user. RLS has already restricted them to their own member_id, so
  -- this is the member acting on their own record.
  NEW.recorded_via      := 'member_self';
  NEW.recorded_by_staff := NULL;
  RETURN NEW;
END $$;

CREATE TRIGGER set_provenance_emergency_contacts
  BEFORE INSERT OR UPDATE ON public.emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_member_data_provenance();

CREATE TRIGGER set_provenance_medical_information
  BEFORE INSERT OR UPDATE ON public.medical_information
  FOR EACH ROW EXECUTE FUNCTION public.set_member_data_provenance();

-- ── the token's own record of how it was redeemed ───────────────────────────
ALTER TABLE public.member_update_tokens
  ADD COLUMN IF NOT EXISTS submitted_via TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by_staff UUID REFERENCES public.staff(id);

-- Shape, not presence. Legacy tokens (submitted_via NULL) are untouched and still valid; what
-- is refused is an INCOHERENT attribution: an operator submission with no operator, or a
-- member-link submission that names one. The database refuses those, not a code path.
ALTER TABLE public.member_update_tokens
  ADD CONSTRAINT member_update_tokens_attribution_chk CHECK (
    submitted_via IS NULL
    OR (submitted_via = 'member_link'       AND submitted_by_staff IS NULL)
    OR (submitted_via = 'operator_assisted' AND submitted_by_staff IS NOT NULL)
  );

-- The paid-but-not-ready queue and the member-detail view both want "was a link ever sent, and
-- what happened to it" without scanning. One partial index, dropped with the column set.
CREATE INDEX IF NOT EXISTS idx_member_update_tokens_open
  ON public.member_update_tokens (member_id, expires_at)
  WHERE used_at IS NULL;
