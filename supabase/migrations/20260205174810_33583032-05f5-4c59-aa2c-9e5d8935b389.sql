-- Enable realtime for video_renders only (video_exports already enabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'video_renders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_renders;
  END IF;
END $$;