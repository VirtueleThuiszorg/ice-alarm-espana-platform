-- SOS escalation: record per-target call outcome on the escalation row.
--
-- Fixes the "silent advance" defect — the runner previously marked a rung reached even when the
-- Twilio call failed. `call_placed` lets alert_escalations reflect reality (did this specific
-- target actually get dialled) instead of optimism.
--
-- Nullable, no default: existing rows stay NULL (outcome unknown for historical attempts); the
-- runner now always sets it explicitly (true = Twilio returned a call SID, false = call failed;
-- true for browser_alert, which is delivered client-side rather than dialled).
--
-- Reversible. Down (rollback):
--   ALTER TABLE public.alert_escalations DROP COLUMN IF EXISTS call_placed;

ALTER TABLE public.alert_escalations
  ADD COLUMN IF NOT EXISTS call_placed BOOLEAN;

COMMENT ON COLUMN public.alert_escalations.call_placed IS
  'True if the outbound Twilio call to this target connected (returned a call SID); false if it '
  'failed; true for browser_alert (client-side). NULL for pre-migration rows.';
