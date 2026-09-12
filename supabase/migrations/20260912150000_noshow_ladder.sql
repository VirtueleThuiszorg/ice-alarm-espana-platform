-- A no-show reaches people through the router, and the second rung has a row to sit in.
--
-- ── 1. `no_show_escalated` ──────────────────────────────────────────────────
--
-- The brief's ladder has two rungs: the operator and the supervisor at the grace period, the
-- admins fifteen minutes later IF the person is still absent. The second needs its own
-- once-per-shift row or it fires on every run for the rest of the shift — the same flood this
-- work is about, one rung up. The partial unique index from 20260912100000 covers it already:
-- it is on (alert_type, staff_id, shift_date, shift_type) WHERE resolved_at IS NULL, so a new
-- alert_type is a new dedupe key with no index change needed.
--
-- REVERSAL: drop the value from the CHECK. Rows carrying it would have to go first, which is why
-- the constraint is re-added by name rather than edited in place.
ALTER TABLE public.shift_alert_log
  DROP CONSTRAINT IF EXISTS shift_alert_log_alert_type_check;

ALTER TABLE public.shift_alert_log
  ADD CONSTRAINT shift_alert_log_alert_type_check
  CHECK (alert_type IN ('no_show', 'no_coverage', 'disconnected', 'not_on_duty', 'no_show_escalated'));

-- ── 2. SMS on, for this event only ──────────────────────────────────────────
--
-- `shift.no_show` was seeded sms=false in 20260909121500, alongside every other shift event. The
-- brief asks for SMS at the grace period — an operator who has not turned up is by definition not
-- looking at the platform, so push and in-app cannot reach them, and a bell nobody is in front of
-- is not a notification.
--
-- This raises the CEILING, not anybody's preference: `notification_routes` says which channels an
-- event MAY use, and `staff_notification_prefs` still decides per person. Nobody starts receiving
-- an SMS who has SMS switched off, and every one of these stays switchable in
-- Admin → Settings → Notifications.
--
-- `shift.no_coverage` and `shift.disconnected` are deliberately NOT changed. They are about the
-- rota and the network rather than about a person who needs waking, and widening them here would
-- be a decision nobody asked for.
--
-- REVERSAL: set enabled = false for the same row.
UPDATE public.notification_routes
   SET enabled = true
 WHERE event_type = 'shift.no_show'
   AND channel = 'sms';

INSERT INTO public.notification_routes (event_type, channel, enabled)
VALUES ('shift.no_show', 'sms', true)
ON CONFLICT (event_type, channel) DO UPDATE SET enabled = true;
