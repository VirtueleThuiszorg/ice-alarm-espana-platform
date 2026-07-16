-- ============================================================
-- SOS escalation + shift-monitor scheduling (STEP 2B)
-- ============================================================
-- Closes the gap proven by docs/SOS_ESCALATION_SPEC.md §(b): neither
-- `sos-escalation-runner` nor `staff-shift-monitor` was scheduled, so the
-- automatic human-callout safety net never fired. This migration schedules
-- both via pg_cron → net.http_post, the exact pattern already used by
-- `ev07b-offline-monitor` and `shift-daily-reminders`.
--
-- HAZARD 1 (SOS_ESCALATION_SPEC.md §c item 1) — sub-minute cadence.
--   The ladder fires at 15/30/45/60/90s, but a classic 5-field pg_cron entry
--   runs at most once per MINUTE. We do NOT depend on pg_cron sub-minute
--   support (not guaranteed across plans/versions). Instead pg_cron wakes the
--   escalation runner every minute (`* * * * *`); the runner then drives an
--   internal sweep loop (supabase/functions/_shared/escalation-loop.ts,
--   ESCALATION_TICK_MS = 10s) for ~55s, giving an effective ~10s cadence.
--   The per-minute wake also restarts a crashed loop within one minute.
--   Effective cadence is measured in src/test/escalationLoop.test.ts.
--
-- Reversible. Down (rollback):
--   SELECT cron.unschedule('sos-escalation-runner');
--   SELECT cron.unschedule('staff-shift-monitor');
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: drop any prior job of the same name before (re)scheduling, so
-- re-running this migration never errors and never leaves a duplicate.
DO $$
BEGIN
  PERFORM cron.unschedule('sos-escalation-runner');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job did not exist yet
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('staff-shift-monitor');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Escalation runner: per-minute wake; the function self-loops at ~10s internally.
SELECT cron.schedule(
  'sos-escalation-runner',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sos-escalation-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"mode":"loop"}'::jsonb
  );
  $$
);

-- Shift monitor: night-cover SPOF net, every 2 minutes (TECHNICAL_SPEC.md:700).
SELECT cron.schedule(
  'staff-shift-monitor',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/staff-shift-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
