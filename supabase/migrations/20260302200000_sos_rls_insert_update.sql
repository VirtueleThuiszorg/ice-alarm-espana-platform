-- SOS-2.0: RLS policies for staff INSERT/UPDATE on SOS-related tables.
-- Phase 1 migrations only created SELECT policies; staff need write access
-- to accept alerts, manage conference participants, escalate, and log notes.

-- ── alerts: staff can UPDATE (accepting, resolving) ─────────────────────────
CREATE POLICY "Staff can update alerts"
  ON public.alerts
  FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ── conference_participants: staff can INSERT and UPDATE ─────────────────────
CREATE POLICY "Staff can insert conference_participants"
  ON public.conference_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update conference_participants"
  ON public.conference_participants
  FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ── alert_escalations: staff can INSERT ─────────────────────────────────────
CREATE POLICY "Staff can insert alert_escalations"
  ON public.alert_escalations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- ── isabella_assessment_notes: staff can INSERT ─────────────────────────────
CREATE POLICY "Staff can insert isabella_assessment_notes"
  ON public.isabella_assessment_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
