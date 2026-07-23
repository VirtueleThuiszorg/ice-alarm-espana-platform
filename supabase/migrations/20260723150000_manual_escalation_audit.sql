-- ============================================================
-- WP-C (STAGE_SOS_FIX.md): auditable MANUAL escalation
-- ============================================================
-- Before WP-C, manually escalating an alert only flipped alerts.status to
-- 'escalated' and told the operator "Admin has been notified" — while no
-- alert_escalations row was written and NO notification was sent. This
-- migration adds the two schema pieces the real path needs:
--
-- 1. escalation_target_type gains 'admin_notification' — the manual path
--    notifies admins via WhatsApp (notify-admin), which is neither a
--    'browser_alert' nor a call.
-- 2. alert_escalations.escalated_by — WHO escalated manually (staff id).
--    Runner-created rows leave it NULL.
--
-- Ladder-safety of manual rows (verified against sos-escalation-runner):
-- the manual row is inserted at escalation_level = 1 with call_placed = true.
-- The runner's tier check treats call_placed=true as "tier already reached a
-- human → don't redial" — and level 1 is the browser-alert tier, which IS
-- genuinely delivered (queue/dashboard toast + tone), so this is truthful and
-- can never suppress a voice-call tier (2–5).
--
-- Reversible. Down (rollback):
--   ALTER TABLE public.alert_escalations DROP COLUMN IF EXISTS escalated_by;
--   -- NOTE: PostgreSQL cannot drop enum VALUES. Rolling back the enum value
--   -- means simply not using 'admin_notification' (it is additive and inert);
--   -- full removal would require recreating the type, deliberately avoided.
-- ============================================================

ALTER TYPE public.escalation_target_type ADD VALUE IF NOT EXISTS 'admin_notification';

ALTER TABLE public.alert_escalations
  ADD COLUMN IF NOT EXISTS escalated_by UUID REFERENCES public.staff(id);

COMMENT ON COLUMN public.alert_escalations.escalated_by IS
  'Staff member who triggered a MANUAL escalation (WP-C). NULL for runner-created rows.';
