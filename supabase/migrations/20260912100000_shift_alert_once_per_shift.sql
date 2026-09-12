-- ONE ALERT PER PERSON PER SHIFT, AND A WAY TO SAY IT IS OVER.
--
-- ── WHAT WAS ALREADY RIGHT, AND IS NOT DUPLICATED HERE ──────────────────────
--
-- `shift_alert_log` HAS carried a partial unique index since the table was created
-- (20260303123455):
--
--   CREATE UNIQUE INDEX shift_alert_log_dedup_idx
--     ON public.shift_alert_log
--        (alert_type, COALESCE(staff_id, '00000000-…'::uuid), shift_date, shift_type)
--     WHERE resolved_at IS NULL;
--
-- That is exactly the property the fix needs — at most one OPEN row per (type, person, date,
-- shift) — with `COALESCE` so the `no_coverage` rows, which have no staff_id, dedupe on each
-- other rather than each being distinct under NULL. A second index on the bare columns would be
-- the same constraint written twice: two indexes to maintain, two to keep in step, and a
-- `CONCURRENTLY` rebuild one day that silently only covers one of them. So this migration ADDS
-- NOTHING to the deduplication and leaves that index alone.
--
-- What the flood actually needed was for the runner to USE it. It read the table first and
-- inserted second, ignored the insert's error, and notified whether or not the row landed — so a
-- refused duplicate still sent a notification. That is a code change (`ON CONFLICT DO NOTHING`,
-- and notify only when a row comes back), not a schema one.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
--
-- 1. `resolution` — WHY a row closed, which `resolved_at` alone cannot say. "Resolved" covers
--    three different events: they signed in, an admin cleared it, or it was never real. Telling
--    them apart is the difference between "the alert worked" and "the alert was wrong", and only
--    the second one is a defect worth acting on.
--
-- 2. `not_on_duty` as an alert type. An operator at their desk who never pressed "On duty" is
--    PRESENT — not a no-show — but the alert routing reads `is_on_call`, so their shift's alerts
--    reach nobody. That deserves a nudge to them and, if it persists, one bell to the supervisor.
--    It needs a row of its own to be once-per-shift rather than once-every-two-minutes, and the
--    CHECK constraint allowed three values.
--
-- 3. Every currently open row closed as `false_positive_pre_fix`.
--
-- ── WHY CLOSING ALL OF THEM IS SAFE, NOT A COVER-UP ─────────────────────────
--
-- Every open row was produced by the definition this work replaces: presence was read from
-- `staff.is_on_call` alone, so anybody who worked a shift without pressing the button was logged
-- as absent. The rows are not evidence of who was missing; they are evidence of the defect.
--
-- And it is self-correcting. `staff-shift-monitor` runs every two minutes: if somebody really is
-- absent right now, their row is re-raised within two minutes of this migration, by the corrected
-- rule. Clearing them cannot hide a live absence — it can only clear a stale one.
--
-- REVERSAL. `resolution` is additive and nullable; dropping it loses only the reason text:
--   ALTER TABLE public.shift_alert_log DROP COLUMN resolution;
--   ALTER TABLE public.shift_alert_log DROP CONSTRAINT shift_alert_log_alert_type_check;
--   ALTER TABLE public.shift_alert_log ADD CONSTRAINT shift_alert_log_alert_type_check
--     CHECK (alert_type IN ('no_show','no_coverage','disconnected'));
-- The closed rows are NOT reopened by a reversal, deliberately: re-raising a week of retracted
-- alerts into the bell would be the flood a second time.

-- ── 1. why a row closed ─────────────────────────────────────────────────────
ALTER TABLE public.shift_alert_log
  ADD COLUMN IF NOT EXISTS resolution TEXT;

COMMENT ON COLUMN public.shift_alert_log.resolution IS
  'Why the row closed: signed_in (they turned up), cleared_by_admin, false_positive_pre_fix. '
  'NULL while the row is open. `resolved_at` says WHEN, this says WHAT HAPPENED.';

-- ── 2. the nudge needs an alert_type ────────────────────────────────────────
-- Named for the constraint Postgres generated for the original CHECK; both spellings are dropped
-- because the generated name depends on the order columns were added.
ALTER TABLE public.shift_alert_log
  DROP CONSTRAINT IF EXISTS shift_alert_log_alert_type_check;

ALTER TABLE public.shift_alert_log
  ADD CONSTRAINT shift_alert_log_alert_type_check
  CHECK (alert_type IN ('no_show', 'no_coverage', 'disconnected', 'not_on_duty'));

-- ── 3. retract what the old definition raised ───────────────────────────────
-- `resolved_at` is set to now() rather than to the row's created_at: the row was open until this
-- ran, and pretending it closed a week ago would put a false duration in any report built on it.
UPDATE public.shift_alert_log
   SET resolved_at = now(),
       resolution  = 'false_positive_pre_fix'
 WHERE resolved_at IS NULL;

-- ── 4. the two new events have to be routable, or they cannot send at all ───
--
-- `notification_routes.event_type` is CHECK-constrained to a NAMED LIST — there is no
-- `ALTER TYPE ... ADD VALUE` to lean on — so an event missing from it cannot be routed, and the
-- router's gate 2 reads a missing ROW as "off" besides. Two different silences, and a new event
-- type hits both. `src/test/notifyStaffRouter.test.ts` asserts this list equals `NOTIFY_EVENTS`,
-- which is what turned a forgotten entry here into a red test rather than a quiet non-delivery.
--
-- Re-added whole, as 20260911150000 did, because the constraint has no incremental form.
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
    -- NEW. They are AT THE DESK and the alert routing does not know it, because routing reads
    -- `is_on_call`. Goes to the operator alone: they are the only person who can fix it.
    'shift.not_on_duty',
    -- NEW. The retraction — a no-show that turned out to be somebody arriving. An alarm nobody
    -- ever hears the end of is an alarm people stop answering.
    'shift.signed_in_after_alert',
    'shift.swap_requested',
    'shift.swap_accepted',
    'shift.swap_approved',
    'member.legacy_confirmed',
    'member.switch_link_sent',
    'member.switch_expired',
    'billing.annual_switch_due',
    'billing.migration_run_failed',
    'system.runner_failure',
    'escalation.call_failed',
    'escalation.no_emergency_contacts',
    'escalation.contacts_not_notified',
    'test'
  ));

-- THE NUDGE GOES BY TEXT AND BELL, and both are on by default.
--
-- Everything else this monitor raises defaults to push only, because it is telling ADMINS about
-- somebody else. This one is telling the OPERATOR about themselves, mid-shift, about a thing only
-- they can fix — and the whole point is that they are looking at the platform and still missed
-- it, so the bell alone is the channel that has already failed. `sms` is on for that reason and
-- for no other; it stays switchable in Admin -> Settings -> Notifications like every other row.
INSERT INTO public.notification_routes (event_type, channel, enabled)
VALUES
  ('shift.not_on_duty',           'push',     true),
  ('shift.not_on_duty',           'sms',      true),
  ('shift.not_on_duty',           'whatsapp', false),
  ('shift.not_on_duty',           'email',    false),
  -- The retraction is a bell and nothing else: it is good news, and good news at 03:00 by text
  -- is how people mute the channel that also carries the bad news.
  ('shift.signed_in_after_alert', 'push',     true),
  ('shift.signed_in_after_alert', 'sms',      false),
  ('shift.signed_in_after_alert', 'whatsapp', false),
  ('shift.signed_in_after_alert', 'email',    false)
ON CONFLICT (event_type, channel) DO NOTHING;
