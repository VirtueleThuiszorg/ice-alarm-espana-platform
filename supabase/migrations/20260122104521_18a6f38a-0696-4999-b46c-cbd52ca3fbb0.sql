-- Fix crm_events policy to be more specific - drop overly permissive one
DROP POLICY IF EXISTS "Service role full access" ON public.crm_events;

-- Allow anonymous inserts only (for edge functions to log events)
-- Edge functions use service role which bypasses RLS anyway
-- This policy allows the client-side logCrmEvent to work for staff
CREATE POLICY "Staff can manage crm events"
  ON public.crm_events
  FOR ALL
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));