-- Fix #1: Add missing worker_job_id column to video_renders table
ALTER TABLE video_renders ADD COLUMN IF NOT EXISTS worker_job_id text;

-- Fix #2: Create video-hub-captions storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-hub-captions', 'video-hub-captions', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for video-hub-captions bucket
CREATE POLICY "Allow public read access on video-hub-captions"
ON storage.objects FOR SELECT
USING (bucket_id = 'video-hub-captions');

CREATE POLICY "Allow authenticated upload to video-hub-captions"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'video-hub-captions');

CREATE POLICY "Allow authenticated update on video-hub-captions"
ON storage.objects FOR UPDATE
USING (bucket_id = 'video-hub-captions');

CREATE POLICY "Allow authenticated delete on video-hub-captions"
ON storage.objects FOR DELETE
USING (bucket_id = 'video-hub-captions');