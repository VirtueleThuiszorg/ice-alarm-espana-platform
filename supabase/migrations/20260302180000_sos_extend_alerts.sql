-- SOS-1.5: Extend alerts table with SOS response fields.
-- NOTE: resolution_notes already exists (original schema) — not re-added.
-- NOTE: claimed_by/claimed_at already exist (general workflow).
--       accepted_by_staff_id/accepted_at are for SOS-specific escalation acceptance.

ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS is_unresponsive BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS conference_id UUID REFERENCES public.conference_rooms(id),
  ADD COLUMN IF NOT EXISTS accepted_by_staff_id UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_false_alarm BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalation_level_reached INTEGER DEFAULT 0;

COMMENT ON COLUMN public.alerts.is_unresponsive IS
  'True when member has not responded during Isabella triage';
COMMENT ON COLUMN public.alerts.conference_id IS
  'FK to the active Twilio conference room for this alert';
COMMENT ON COLUMN public.alerts.accepted_by_staff_id IS
  'Staff member who accepted the SOS escalation (distinct from claimed_by which is general workflow)';
COMMENT ON COLUMN public.alerts.accepted_at IS
  'Timestamp when staff accepted the SOS escalation';
COMMENT ON COLUMN public.alerts.is_false_alarm IS
  'Marked true when alert is resolved as a false alarm';
COMMENT ON COLUMN public.alerts.escalation_level_reached IS
  'Highest escalation level reached: 0=none, 1=browser, 2=staff mobile, 3=supervisor, 4=admin, 5=emergency contacts';
