
-- ============================================================================
-- SOS RESPONSE SYSTEM — PHASE 1: DATABASE FOUNDATION
-- ============================================================================

-- ─── 1. CONFERENCE ROOMS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conference_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  twilio_conference_sid TEXT,
  conference_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  recording_url TEXT,
  recording_duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_conference_rooms_alert_id
  ON public.conference_rooms(alert_id);

CREATE INDEX IF NOT EXISTS idx_conference_rooms_active
  ON public.conference_rooms(status) WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_conference_rooms_twilio_sid
  ON public.conference_rooms(twilio_conference_sid)
  WHERE twilio_conference_sid IS NOT NULL;

ALTER TABLE public.conference_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view conference_rooms"
  ON public.conference_rooms
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- ─── 2. CONFERENCE PARTICIPANTS ─────────────────────────────────────────────

CREATE TYPE public.participant_type AS ENUM (
  'member', 'staff', 'ai', 'emergency_contact', 'external_service'
);

CREATE TYPE public.participant_join_method AS ENUM (
  'automatic', 'accepted_alert', 'added_by_staff', 'callback_routed'
);

CREATE TABLE IF NOT EXISTS public.conference_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conference_id UUID NOT NULL REFERENCES public.conference_rooms(id) ON DELETE CASCADE,
  participant_type public.participant_type NOT NULL,
  participant_name TEXT NOT NULL,
  phone_number TEXT,
  twilio_call_sid TEXT,
  staff_id UUID REFERENCES public.staff(id),
  emergency_contact_id UUID REFERENCES public.emergency_contacts(id),
  is_muted BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  join_method public.participant_join_method NOT NULL DEFAULT 'automatic'
);

CREATE INDEX IF NOT EXISTS idx_conference_participants_conference
  ON public.conference_participants(conference_id);

CREATE INDEX IF NOT EXISTS idx_conference_participants_active
  ON public.conference_participants(conference_id)
  WHERE left_at IS NULL;

ALTER TABLE public.conference_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view conference_participants"
  ON public.conference_participants
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- ─── 3. ALERT ESCALATIONS ──────────────────────────────────────────────────

CREATE TYPE public.escalation_target_type AS ENUM (
  'browser_alert', 'mobile_call', 'emergency_contact_call'
);

CREATE TABLE IF NOT EXISTS public.alert_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  escalation_level INTEGER NOT NULL CHECK (escalation_level BETWEEN 1 AND 5),
  target_type public.escalation_target_type NOT NULL,
  target_staff_id UUID REFERENCES public.staff(id),
  target_phone TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded BOOLEAN NOT NULL DEFAULT false,
  responded_at TIMESTAMPTZ,
  response_method TEXT
);

COMMENT ON TABLE public.alert_escalations IS
  'Escalation levels: 1=staff browser, 2=staff mobile, 3=supervisor, 4=admin, 5=emergency contacts';

CREATE INDEX IF NOT EXISTS idx_alert_escalations_alert
  ON public.alert_escalations(alert_id);

ALTER TABLE public.alert_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view alert_escalations"
  ON public.alert_escalations
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- ─── 4. ISABELLA ASSESSMENT NOTES ──────────────────────────────────────────

CREATE TYPE public.isabella_note_type AS ENUM (
  'observation', 'question_asked', 'member_response',
  'triage_decision', 'handover_briefing', 'flag'
);

CREATE TABLE IF NOT EXISTS public.isabella_assessment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  note_type public.isabella_note_type NOT NULL,
  content TEXT NOT NULL,
  is_critical BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_isabella_notes_alert_timestamp
  ON public.isabella_assessment_notes(alert_id, timestamp);

ALTER TABLE public.isabella_assessment_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view isabella_assessment_notes"
  ON public.isabella_assessment_notes
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- ─── 5. EXTEND ALERTS TABLE ────────────────────────────────────────────────

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
  'Staff member who accepted the SOS escalation';
COMMENT ON COLUMN public.alerts.accepted_at IS
  'Timestamp when staff accepted the SOS escalation';
COMMENT ON COLUMN public.alerts.is_false_alarm IS
  'Marked true when alert is resolved as a false alarm';
COMMENT ON COLUMN public.alerts.escalation_level_reached IS
  'Highest escalation level reached: 0=none, 1=browser, 2=staff mobile, 3=supervisor, 4=admin, 5=emergency contacts';

-- ─── 6. EXTEND STAFF TABLE (no-ops if columns exist) ────────────────────────

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS personal_mobile TEXT,
  ADD COLUMN IF NOT EXISTS escalation_priority INTEGER DEFAULT 99,
  ADD COLUMN IF NOT EXISTS is_on_call BOOLEAN DEFAULT false;
