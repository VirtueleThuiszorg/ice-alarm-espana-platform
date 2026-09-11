-- THE DAILY WAKE-UP for the legacy→Stripe billing migration.
--
-- Scheduling only. Everything this calls — who is due, what they are sent, and the key that makes
-- a second send impossible — lives in `billing-migration-runner` and in
-- 20260911140000_billing_migration_settings.sql.
--
-- SEPARATE FROM THAT MIGRATION ON PURPOSE. `scripts/rls/run.sh` cannot install pg_cron on a
-- stock PostgreSQL, so it skips the migrations that need it — and a skipped file takes its whole
-- contents with it. Putting the dedupe-key index and the settings in the same file would have
-- meant the RLS harness never saw either. This file therefore contains ZERO `CREATE POLICY`,
-- ZERO `ENABLE ROW LEVEL SECURITY` and ZERO `CREATE TABLE`, which is the property that makes
-- skipping it cost the suite nothing — and `src/test/billingMigrationCron.test.ts` asserts that,
-- so a future edit cannot quietly add a policy to a file nothing checks.
--
-- 06:00 UTC, which is 07:00 or 08:00 in Spain. Before the office opens, so the day's list is
-- already there, and well clear of the SOS-escalation and offline-monitor jobs.
--
-- ONCE A DAY, NOT MORE. Every send is idempotent by key, so a second run the same day would be
-- harmless — but the decision is "exactly N days before the renewal", and a schedule that fires
-- twice is a schedule somebody will later read as permission to widen that to a range.
--
-- THE RUNNER REFUSES ITSELF when `billing_migration_enabled` is not 'true', so this schedule is
-- safe to exist before anybody has decided to start. It fires, the function reads the switch,
-- and nothing happens.
--
-- ROLLBACK:
--   SELECT cron.unschedule('billing-migration-runner');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unscheduled first so re-running this migration re-registers rather than erroring on a
-- duplicate job name.
SELECT cron.unschedule('billing-migration-runner')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-migration-runner');

SELECT cron.schedule(
  'billing-migration-runner',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/billing-migration-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
