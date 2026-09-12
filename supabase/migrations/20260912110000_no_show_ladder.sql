-- THE LADDER A REAL NO-SHOW CLIMBS, and the channel it climbs it on.
--
-- The brief: *"operator SMS at grace; supervisor SMS + bell at grace; admins SMS + bell at
-- grace+15 if still absent."* Two things stood between that and the code.
--
-- ── 1. SMS WAS ROUTED OFF ───────────────────────────────────────────────────
--
-- `20260909121500` seeded `shift.no_show` as sms=false, whatsapp=true, push=true, email=false.
-- Gate 2 of the router reads a disabled route as "off", so the one channel the brief names for
-- every rung of this ladder was the one channel that could not send. Turned on here.
--
-- WhatsApp is LEFT AS IT IS. It works today and turning off a channel somebody may be relying on
-- is a product decision, not part of fixing an alert that fires wrongly. Both stay switchable in
-- Admin -> Settings -> Notifications, which is the whole point of the routes table.
--
-- The BELL needs no route row: `dispatchNotifications` writes it for every recipient before the
-- gates, because it is in-app and costs nothing. "SMS + bell" is therefore one route change.
--
-- ── 2. THE SECOND RUNG NEEDED SOMEWHERE TO BE RECORDED ──────────────────────
--
-- "Admins at grace+15 IF STILL ABSENT" has to happen exactly once, and the thing that makes
-- anything in this runner happen once is a `shift_alert_log` row. Without its own row the
-- escalation would either fire every two minutes for the rest of the shift, or not at all.
--
-- It is a new ALERT TYPE and not a new EVENT TYPE: the admins are told `shift.no_show`, which is
-- what it is. Only the log needs to tell the two rungs apart.
--
-- REVERSAL:
--   UPDATE public.notification_routes SET enabled = false
--    WHERE event_type = 'shift.no_show' AND channel = 'sms';
--   ALTER TABLE public.shift_alert_log DROP CONSTRAINT shift_alert_log_alert_type_check;
--   ALTER TABLE public.shift_alert_log ADD CONSTRAINT shift_alert_log_alert_type_check
--     CHECK (alert_type IN ('no_show','no_coverage','disconnected','not_on_duty'));
-- Any `no_show_escalated` rows must be deleted first, or the constraint will refuse to validate.

-- ── the second rung's row ───────────────────────────────────────────────────
ALTER TABLE public.shift_alert_log
  DROP CONSTRAINT IF EXISTS shift_alert_log_alert_type_check;

ALTER TABLE public.shift_alert_log
  ADD CONSTRAINT shift_alert_log_alert_type_check
  CHECK (alert_type IN (
    'no_show',
    'no_coverage',
    'disconnected',
    'not_on_duty',
    -- The same absence, fifteen minutes older and now the admins' problem. Its own row so the
    -- dedupe index makes it once per person per shift, like every other rung.
    'no_show_escalated'
  ));

-- ── the channel every rung is supposed to use ───────────────────────────────
UPDATE public.notification_routes
   SET enabled = true, updated_at = now()
 WHERE event_type = 'shift.no_show'
   AND channel = 'sms'
   AND enabled IS DISTINCT FROM true;
