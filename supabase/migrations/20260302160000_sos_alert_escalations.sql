-- SOS-1.3: Alert escalation tracking for the 5-level escalation chain.
-- Escalation levels:
--   1 = Staff browser notification (real-time alert in dashboard)
--   2 = Staff mobile call (personal phone)
--   3 = Supervisor mobile call
--   4 = Admin mobile call
--   5 = Emergency contacts called

-- ─── Enum ─────────────────────────────────────────────────────────────────────

CREATE TYPE public.escalation_target_type AS ENUM (
  'browser_alert', 'mobile_call', 'emergency_contact_call'
);

-- ─── Table ────────────────────────────────────────────────────────────────────

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

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_alert_escalations_alert_id
  ON public.alert_escalations(alert_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.alert_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view alert_escalations"
  ON public.alert_escalations
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));
