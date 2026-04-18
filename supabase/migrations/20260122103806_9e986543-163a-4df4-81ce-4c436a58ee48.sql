-- Enable pg_net extension for HTTP calls (pg_cron should already be available)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;