-- Add auto-publish toggle to media schedule settings
ALTER TABLE public.media_schedule_settings
ADD COLUMN IF NOT EXISTS auto_publish_enabled BOOLEAN DEFAULT false;
