-- SOS-1.1: Conference rooms for Twilio-based multi-party SOS calls.
-- Each SOS alert gets a conference room bridging member, staff, and Isabella AI.
-- Conference stays open until the alert is fully resolved.

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

-- Fast lookup by alert
CREATE INDEX IF NOT EXISTS idx_conference_rooms_alert_id
  ON public.conference_rooms(alert_id);

-- Find currently active conferences
CREATE INDEX IF NOT EXISTS idx_conference_rooms_active
  ON public.conference_rooms(status) WHERE status = 'active';

-- Prevent duplicate Twilio conference SIDs
CREATE UNIQUE INDEX IF NOT EXISTS idx_conference_rooms_twilio_sid
  ON public.conference_rooms(twilio_conference_sid) WHERE twilio_conference_sid IS NOT NULL;

-- RLS
ALTER TABLE public.conference_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view conference_rooms"
  ON public.conference_rooms
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));
