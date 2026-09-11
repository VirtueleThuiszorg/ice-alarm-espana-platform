-- THE BILLING MIGRATION'S PACING — the part a database can enforce.
--
-- 431 legacy members move onto Stripe over months, each on the day Santander takes their money.
-- A daily runner works out who is due and writes to them. Two things about that are the
-- database's job rather than the runner's, and this migration is both of them.
--
-- ── 1. NEVER TWICE, AS A KEY RATHER THAN A CHECK ──────────────────────────────
--
-- The runner is a cron job. It WILL be re-run by hand, it will overlap itself the day somebody
-- changes the schedule, and one day it will crash halfway through 431 members and be run again.
-- A "have we sent this already?" SELECT before each send is a race with all three, and losing
-- that race means a second text about money to an eighty-year-old — which reads as though the
-- first one failed, or worse, as though they are being charged twice.
--
-- So every send carries a DEDUPE KEY naming the member, the renewal it is about and what kind of
-- message it is, and this migration puts a UNIQUE INDEX on it. Sending twice is not prevented by
-- remembering; it is impossible. `ON CONFLICT DO NOTHING` then makes the whole run idempotent by
-- construction, which is the only thing that makes "just run it again" a safe instruction to
-- give somebody at nine at night.
--
-- PARTIAL, on purpose. Every existing notification_log row — and every row written by anything
-- that is not this runner — has a NULL key, and a plain unique index would collapse all of them
-- into one.
--
-- ── 2. THE SWITCHES, OFF ──────────────────────────────────────────────────────
--
-- `billing_migration_enabled` seeds as 'false'. A migration that starts itself on deploy is a
-- migration nobody chose, over 431 people who are all elderly and none of whom asked for it
-- today. Lee turns it on in Admin → Settings → Billing when he is ready, having looked at the
-- dry-run preview.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.notification_log_dedupe_key_idx;
--   ALTER TABLE public.notification_log DROP COLUMN IF EXISTS dedupe_key;
--   DELETE FROM public.system_settings WHERE key LIKE 'billing_migration_%';
--   -- and re-add notification_routes_event_type_check without the three runner events,
--   -- having deleted the rows this migration inserted.

-- ── the key ───────────────────────────────────────────────────────────────────
ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notification_log_dedupe_key_idx
  ON public.notification_log (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON COLUMN public.notification_log.dedupe_key IS
  'An idempotency key for a send that must happen at most once — today only the billing '
  'migration runner, whose keys are billing-switch:<member>:<renewal>:<kind>. NULL for every '
  'other notification, which is why the unique index is partial. Write with ON CONFLICT DO '
  'NOTHING: the point is that a second send is impossible, not that it is checked for.';

-- ── the switches ──────────────────────────────────────────────────────────────
--
-- Lead times as TEXT because system_settings is a text store; the runner parses them and falls
-- back to these same defaults for anything unreadable, so a row somebody empties by hand does
-- not silently become "send on the day itself".
-- `system_settings` is (key, value) and nothing else — no description column — so what each
-- key means lives here:
--
--   billing_migration_enabled               the master switch. 'false' on arrival.
--   billing_migration_monthly_lead_days     days before a MONTHLY member's Santander date to
--                                           send their switch link. 3.
--   billing_migration_annual_notice_days    days before an ANNUAL renewal for the first notice.
--                                           14 — an annual member who misses the switch waits
--                                           twelve months for another chance, which is why they
--                                           get a ladder rather than one message.
--   billing_migration_annual_reminder_days  the reminder. 7.
--   billing_migration_annual_escalate_days  the day STAFF are told to ring them. 3. Not a
--                                           message to the member.
INSERT INTO public.system_settings (key, value)
VALUES
  ('billing_migration_enabled',               'false'),
  ('billing_migration_monthly_lead_days',     '3'),
  ('billing_migration_annual_notice_days',    '14'),
  ('billing_migration_annual_reminder_days',  '7'),
  ('billing_migration_annual_escalate_days',  '3')
ON CONFLICT (key) DO NOTHING;

-- ── the events ────────────────────────────────────────────────────────────────
--
-- Re-added whole: notification_routes.event_type is CHECK-constrained to a named list with no
-- ALTER ... ADD VALUE, and an event that is not in the list cannot be routed at all.
ALTER TABLE public.notification_routes
  DROP CONSTRAINT IF EXISTS notification_routes_event_type_check;

ALTER TABLE public.notification_routes
  ADD CONSTRAINT notification_routes_event_type_check CHECK (event_type IN (
    'sale.paid',
    'lead.new',
    'payment.failed',
    'subscription.cancelled',
    'sos.opened',
    'sos.unassigned',
    'device.offline',
    'isabella.down',
    'partner.joined',
    'hot.sales',
    'ev07b.alert',
    'shift.no_show',
    'shift.no_coverage',
    'shift.disconnected',
    'shift.swap_requested',
    'shift.swap_accepted',
    'shift.swap_approved',
    'member.legacy_confirmed',
    'member.switch_link_sent',
    'member.switch_expired',
    -- NEW. The annual ladder's last rung is the one that matters: three days out, an annual
    -- member who has not switched needs a person to ring them, not another text.
    'billing.annual_switch_due',
    -- The run itself failed, or refused to start. A migration that quietly stops is 431 people
    -- nobody is moving and nobody knows it.
    'billing.migration_run_failed',
    'system.runner_failure',
    'escalation.call_failed',
    'escalation.no_emergency_contacts',
    'escalation.contacts_not_notified',
    'test'
  ));

INSERT INTO public.notification_routes (event_type, channel, enabled)
VALUES
  ('billing.annual_switch_due',    'push',     true),
  ('billing.annual_switch_due',    'sms',      false),
  ('billing.annual_switch_due',    'whatsapp', false),
  ('billing.annual_switch_due',    'email',    false),
  ('billing.migration_run_failed', 'push',     true),
  ('billing.migration_run_failed', 'sms',      false),
  ('billing.migration_run_failed', 'whatsapp', false),
  ('billing.migration_run_failed', 'email',    false)
ON CONFLICT (event_type, channel) DO NOTHING;
