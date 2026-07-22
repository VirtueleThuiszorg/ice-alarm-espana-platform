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

-- Auth/URL pattern (STAGE_0B_PLAN.md §1): the public project URL is hardcoded
-- (not a secret); the service-role key is read from Supabase Vault (secret name
-- 'service_role_key', set out-of-band by an admin, NEVER in git — golden rule #9).
-- If the Vault secret is missing, the job RAISEs a WARNING and skips rather than
-- throwing "unrecognized configuration parameter" — so a misconfig is observable,
-- not a silent per-minute error spike. (Replaces the old
-- current_setting('app.settings.*') pattern that had no missing_ok guard.)

-- Escalation runner: per-minute wake; the function self-loops at ~10s internally.
SELECT cron.schedule(
  'sos-escalation-runner',
  '* * * * *',
  $CRON$
  DO $inner$
  DECLARE v_key text;
  BEGIN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
    IF v_key IS NULL THEN
      RAISE WARNING 'cron sos-escalation-runner: service_role_key missing from Vault — skipped';
      RETURN;
    END IF;
    PERFORM net.http_post(
      url := 'https://crpsuhoixfdhjugprbuc.supabase.co/functions/v1/sos-escalation-runner',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
      body := '{"mode":"loop"}'::jsonb
    );
  END $inner$;
  $CRON$
);

-- Shift monitor: night-cover SPOF net, every 2 minutes (TECHNICAL_SPEC.md:700).
SELECT cron.schedule(
  'staff-shift-monitor',
  '*/2 * * * *',
  $CRON$
  DO $inner$
  DECLARE v_key text;
  BEGIN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
    IF v_key IS NULL THEN
      RAISE WARNING 'cron staff-shift-monitor: service_role_key missing from Vault — skipped';
      RETURN;
    END IF;
    PERFORM net.http_post(
      url := 'https://crpsuhoixfdhjugprbuc.supabase.co/functions/v1/staff-shift-monitor',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
      body := '{}'::jsonb
    );
  END $inner$;
  $CRON$
);
