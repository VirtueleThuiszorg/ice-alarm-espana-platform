-- Which wizard produced this draft.
--
-- registration_drafts.current_step is a RAW step number (useRegistrationDraft.ts). A step
-- number is meaningless without knowing which wizard wrote it: the nine-step wizard had
-- emergency contacts at 4 and medical at 5; the seven-step wizard (ONBOARDING_SPLIT.md) has
-- device at 4 and review at 5. Rows from both will sit in this table forever.
--
-- The reader is ALREADY WRONG on main, before this change: src/pages/admin/LeadsPage.tsx
-- renders "Step {n} of 8" for a NINE-step wizard (:1068-1071) and its STEP_NAMES array
-- (:114-125) lists "Medical Info" at index 4 and "Emergency Contacts" at 5 — the wizard has
-- them the other way round. So the abandoned-registration view reports the wrong step name and
-- the wrong denominator today. Versioning is what lets it be right for both.
--
-- DEFAULT 1, not 2: every row that exists now was written by the nine-step wizard, and that is
-- what 1 means. Defaulting new rows to 1 would be wrong, so the client sends 2 explicitly and
-- the column's default only ever applies to the backfill.
--
-- Version-1 drafts are deliberately NOT resumable in the new wizard: a v1 draft carries
-- contacts/medical the seven-step wizard has no screen for, and resuming it on "step 4" would
-- land the member on Device with their contacts silently discarded. Discarding is honest;
-- silently resuming is not.
--
-- ROLLBACK: ALTER TABLE public.registration_drafts DROP COLUMN schema_version;
--   One statement. No data loss — the column is additive and nothing reads it before this ships.

ALTER TABLE public.registration_drafts
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.registration_drafts.schema_version IS
  '1 = nine-step wizard (contacts 4, medical 5). 2 = seven-step wizard (device 4, review 5). '
  'current_step is only interpretable together with this. See ONBOARDING_SPLIT.md.';
