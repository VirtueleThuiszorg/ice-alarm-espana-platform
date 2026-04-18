-- SOS-1.6: Extend staff table with SOS escalation fields.
-- These columns support the escalation call chain when an SOS alert
-- is not accepted within the timeout window.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS personal_mobile TEXT,
  ADD COLUMN IF NOT EXISTS escalation_priority INTEGER DEFAULT 99,
  ADD COLUMN IF NOT EXISTS is_on_call BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.staff.personal_mobile IS
  'Personal mobile number for escalation calls (distinct from office phone)';
COMMENT ON COLUMN public.staff.escalation_priority IS
  'Lower number = called first in escalation chain (default 99 = low priority)';
COMMENT ON COLUMN public.staff.is_on_call IS
  'True if staff member is reachable by mobile outside their scheduled shift hours';
