-- ============================================================
-- Staff Rota, Holidays & Shift Cover System — Cron Only
-- ============================================================
-- This migration originally created the full staff rota/holidays
-- schema. However, the SUPERSEDING migration (20260301153008_fb4926fe...)
-- creates identical tables, views, functions, and RLS policies,
-- causing "relation already exists" failures on a fresh database.
--
-- The one thing the v2 migration LEFT OUT was the daily shift
-- reminders cron job. This migration now contains ONLY that cron
-- job, so feature parity with ICE's database is preserved.
--
-- Original v1 intent: schema creation + cron
-- V2 (153008) handles:  schema creation only
-- This file now:        cron only (so both features survive)
-- ============================================================

-- Daily shift reminders at 19:00 UTC (also expires stale covers)
SELECT cron.schedule(
  'shift-daily-reminders',
  '0 19 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/shift-daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
