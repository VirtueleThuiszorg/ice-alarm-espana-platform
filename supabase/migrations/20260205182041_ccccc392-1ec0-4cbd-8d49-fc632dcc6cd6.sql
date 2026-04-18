-- Create video-hub-thumbnails bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'video-hub-thumbnails',
  'video-hub-thumbnails',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for thumbnails bucket
CREATE POLICY "Public read for video-hub-thumbnails"
ON storage.objects FOR SELECT
USING (bucket_id = 'video-hub-thumbnails');

CREATE POLICY "Authenticated insert for video-hub-thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'video-hub-thumbnails');

CREATE POLICY "Authenticated update for video-hub-thumbnails"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'video-hub-thumbnails');

CREATE POLICY "Authenticated delete for video-hub-thumbnails"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'video-hub-thumbnails');