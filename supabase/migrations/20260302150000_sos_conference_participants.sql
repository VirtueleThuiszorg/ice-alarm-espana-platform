-- SOS-1.2: Conference participants — tracks who is on each SOS conference call.
-- Supports member, staff, Isabella AI, emergency contacts, and external services.

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE public.participant_type AS ENUM (
  'member', 'staff', 'ai', 'emergency_contact', 'external_service'
);

CREATE TYPE public.participant_join_method AS ENUM (
  'automatic', 'accepted_alert', 'added_by_staff', 'callback_routed'
);

-- ─── Table ────────────────────────────────────────────────────────────────────

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

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- All participants for a conference
CREATE INDEX IF NOT EXISTS idx_conf_participants_conference_id
  ON public.conference_participants(conference_id);

-- Active participants only (still on the call)
CREATE INDEX IF NOT EXISTS idx_conf_participants_active
  ON public.conference_participants(conference_id)
  WHERE left_at IS NULL;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.conference_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view conference_participants"
  ON public.conference_participants
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));
