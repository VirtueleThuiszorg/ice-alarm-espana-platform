-- EV-07B Offline Monitor Cron Job
--
-- Calls the ev07b-offline-monitor edge function every 2 minutes
-- to detect devices that haven't checked in within their expected interval.
--
-- Requires pg_cron and pg_net extensions (available on Supabase Pro+).
-- If pg_cron is not available, configure an external scheduler (e.g., cron, CloudWatch)
-- to call the edge function directly:
--   POST https://<project>.supabase.co/functions/v1/ev07b-offline-monitor
--   Headers: Authorization: Bearer <service_role_key>

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the offline monitor to run every 2 minutes
SELECT cron.schedule(
  'ev07b-offline-monitor',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/ev07b-offline-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
