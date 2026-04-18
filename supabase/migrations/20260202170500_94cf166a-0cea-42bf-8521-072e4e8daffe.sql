-- Add device_offline to alert_type enum
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'device_offline';

-- Add message column to alerts table if not exists
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS message text;