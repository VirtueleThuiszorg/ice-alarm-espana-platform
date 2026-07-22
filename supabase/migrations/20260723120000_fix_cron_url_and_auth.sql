-- ============================================================
-- Corrective migration — fix the two ALREADY-APPLIED broken crons
-- (STAGE_0B_PLAN.md §1)
-- ============================================================
-- `ev07b-offline-monitor` (from 20260301100000_ev07b_offline_cron.sql) and
-- `shift-daily-reminders` (from 20260301150000_staff_rota_holidays.sql) were
-- scheduled with `url := current_setting('app.settings.supabase_url') || …` and
-- `'Bearer ' || current_setting('app.settings.service_role_key')`. With those
-- GUCs unset, `current_setting()` (no missing_ok) throws "unrecognized
-- configuration parameter" on every fire — the ~694 errors/day spike.
--
-- Those two source migrations are already applied and are immutable, so we
-- correct FORWARD here: unschedule + reschedule both with the robust pattern —
-- public URL hardcoded (not secret), service-role key from Supabase Vault
-- (secret 'service_role_key', set out-of-band, NEVER in git — golden rule #9),
-- and a guard that RAISEs a WARNING + skips if the secret is missing (observable,
-- not a silent error spike). Matches the fix applied in-place to
-- 20260716120000_sos_escalation_cron.sql.
--
-- PREREQUISITE (admin, out of band, once): create the Vault secret, e.g.
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
-- Reversible. Down (rollback): unschedule both, then re-run the two original
-- migrations' schedule blocks (or leave unscheduled).
--   SELECT cron.unschedule('ev07b-offline-monitor');
--   SELECT cron.unschedule('shift-daily-reminders');
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent unschedule (never error if a job is absent).
DO $$ BEGIN PERFORM cron.unschedule('ev07b-offline-monitor'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('shift-daily-reminders'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ev07b-offline-monitor: every 2 minutes (unchanged schedule + body).
SELECT cron.schedule(
  'ev07b-offline-monitor',
  '*/2 * * * *',
  $CRON$
  DO $inner$
  DECLARE v_key text;
  BEGIN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
    IF v_key IS NULL THEN
      RAISE WARNING 'cron ev07b-offline-monitor: service_role_key missing from Vault — skipped';
      RETURN;
    END IF;
    PERFORM net.http_post(
      url := 'https://crpsuhoixfdhjugprbuc.supabase.co/functions/v1/ev07b-offline-monitor',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
      body := '{}'::jsonb
    );
  END $inner$;
  $CRON$
);

-- shift-daily-reminders: daily at 19:00 UTC (unchanged schedule + body).
SELECT cron.schedule(
  'shift-daily-reminders',
  '0 19 * * *',
  $CRON$
  DO $inner$
  DECLARE v_key text;
  BEGIN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
    IF v_key IS NULL THEN
      RAISE WARNING 'cron shift-daily-reminders: service_role_key missing from Vault — skipped';
      RETURN;
    END IF;
    PERFORM net.http_post(
      url := 'https://crpsuhoixfdhjugprbuc.supabase.co/functions/v1/shift-daily-reminders',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
      body := '{}'::jsonb
    );
  END $inner$;
  $CRON$
);
