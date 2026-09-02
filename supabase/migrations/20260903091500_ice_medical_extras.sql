-- ICE import: medical_information columns the export carries and we dropped.
--
-- Populated rows in the real export:
--   Mobility 70 · Hearing Problems 76 · Glasses 33 · Meds Location 86
--   Meds Notes 22 · Location (doctor) 27 · Private Medical 28 · Policy No 14
--
-- hearing_notes is operator-facing: it changes how the call itself is run, so
-- it belongs with the medical facts an operator reads, not in a general note.
--
-- Reverse: ALTER TABLE public.medical_information DROP COLUMN IF EXISTS <each>;

ALTER TABLE public.medical_information
  ADD COLUMN IF NOT EXISTS mobility              text,
  ADD COLUMN IF NOT EXISTS hearing_notes         text,
  ADD COLUMN IF NOT EXISTS vision_notes          text,
  ADD COLUMN IF NOT EXISTS meds_location         text,
  ADD COLUMN IF NOT EXISTS meds_notes            text,
  ADD COLUMN IF NOT EXISTS doctor_location       text,
  ADD COLUMN IF NOT EXISTS private_insurer       text,
  ADD COLUMN IF NOT EXISTS private_policy_number text;

COMMENT ON COLUMN public.medical_information.hearing_notes IS 'Affects how an operator runs the call. Operator-facing.';
COMMENT ON COLUMN public.medical_information.meds_location IS 'Where the medication is kept in the home - for responders.';
