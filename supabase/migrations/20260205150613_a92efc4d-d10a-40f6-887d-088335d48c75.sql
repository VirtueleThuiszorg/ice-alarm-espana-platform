-- Add published_at column for tracking when videos are "published"
ALTER TABLE video_exports ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Enable realtime for video_exports table
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_exports;