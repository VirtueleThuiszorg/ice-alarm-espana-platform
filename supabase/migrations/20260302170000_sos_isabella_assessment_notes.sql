-- SOS-1.4: Isabella AI assessment notes during SOS triage.
-- Structured observations Isabella makes during the initial call
-- before a human staff member accepts the alert. Displayed as a
-- real-time feed in the staff SOS dashboard panel.

-- ─── Enum ─────────────────────────────────────────────────────────────────────

CREATE TYPE public.isabella_note_type AS ENUM (
  'observation', 'question_asked', 'member_response',
  'triage_decision', 'handover_briefing', 'flag'
);

-- ─── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.isabella_assessment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  note_type public.isabella_note_type NOT NULL,
  content TEXT NOT NULL,
  is_critical BOOLEAN NOT NULL DEFAULT false
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Composite index for timeline queries (notes in chronological order per alert)
CREATE INDEX IF NOT EXISTS idx_isabella_notes_alert_timestamp
  ON public.isabella_assessment_notes(alert_id, timestamp);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.isabella_assessment_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view isabella_assessment_notes"
  ON public.isabella_assessment_notes
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));
