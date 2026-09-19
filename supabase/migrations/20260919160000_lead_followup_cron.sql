-- THE DAILY WAKE-UP for "Follow up today".
--
-- Scheduling only. Every decision — who is due, who must never be chased, and the mark that
-- makes it once rather than daily — lives in `lead-followup-runner` and in
-- 20260919120000_lead_working_schema.sql.
--
-- SEPARATE FROM THAT MIGRATION ON PURPOSE. `scripts/rls/run.sh` cannot install pg_cron on a
-- stock PostgreSQL, so it SKIPS the migrations that need it — and a skipped file takes its whole
-- contents with it. Putting the schedule in the schema migration would have meant the RLS
-- harness never saw `lead_communications` or any of its policies. This file therefore contains
-- ZERO `CREATE POLICY`, ZERO `ENABLE ROW LEVEL SECURITY` and ZERO `CREATE TABLE`, which is what
-- makes skipping it cost the suite nothing — and `run.sh` itself asserts that property for every
-- file on its skip list, so a future edit cannot quietly add a policy here.
--
-- 07:00 UTC — 08:00 or 09:00 in Spain, as the office opens, so the day's list is already there.
-- Deliberately AFTER the billing runner at 06:00 and clear of the SOS-escalation and
-- offline-monitor jobs, which matter more and should never be queued behind this.
--
-- ONCE A DAY, NOT MORE, and here that is load-bearing rather than tidy. The runner marks each
-- lead it bells, so a second run the same day would be harmless — but the whole purpose of this
-- feature is to produce ONE reminder, and a schedule that fires twice is a schedule somebody
-- later reads as permission to fire hourly.
--
-- IT IS SAFE TO EXIST BEFORE ANYBODY IS USING LEADS. With no open leads assigned to anybody, the
-- runner reads zero rows and returns `reminded: 0`. Nothing is sent and nothing is marked.
--
-- ROLLBACK:
--   SELECT cron.unschedule('lead-followup-runner');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unscheduled first so re-running this migration re-registers rather than erroring on a
-- duplicate job name.
SELECT cron.unschedule('lead-followup-runner')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lead-followup-runner');

SELECT cron.schedule(
  'lead-followup-runner',
  '0 7 * * *',
  $CRON$
  DO $inner$
  DECLARE v_key text;
  BEGIN
    -- The key comes from Vault, never from a GUC. `current_setting()` without `missing_ok` THROWS
    -- when the parameter is unset, and two crons scheduled that way produced ~694 errors a day
    -- until 20260723120000 corrected them. A missing secret here is a WARNING and a skip:
    -- observable, and not a silent error spike.
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
    IF v_key IS NULL THEN
      RAISE WARNING 'cron lead-followup-runner: service_role_key missing from Vault — skipped';
      RETURN;
    END IF;
    PERFORM net.http_post(
      url := 'https://crpsuhoixfdhjugprbuc.supabase.co/functions/v1/lead-followup-runner',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
      body := '{}'::jsonb
    );
  END $inner$;
  $CRON$
);
