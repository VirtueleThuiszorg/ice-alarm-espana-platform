
-- 1. Create storage buckets (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-exports', 'video-exports', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('video-thumbnails', 'video-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop existing policies to make idempotent
DROP POLICY IF EXISTS "Staff can upload video exports" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read video exports" ON storage.objects;
DROP POLICY IF EXISTS "Public can read video exports" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload video thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read video thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Public can read video thumbnails" ON storage.objects;

-- 3. RLS policies for video-exports
CREATE POLICY "Staff can upload video exports"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'video-exports' AND public.is_staff(auth.uid()));

CREATE POLICY "Public can read video exports"
ON storage.objects FOR SELECT
USING (bucket_id = 'video-exports');

-- 4. RLS policies for video-thumbnails
CREATE POLICY "Staff can upload video thumbnails"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'video-thumbnails' AND public.is_staff(auth.uid()));

CREATE POLICY "Public can read video thumbnails"
ON storage.objects FOR SELECT
USING (bucket_id = 'video-thumbnails');

-- 5. Update video_projects status constraint
ALTER TABLE public.video_projects DROP CONSTRAINT IF EXISTS video_projects_status_check;
ALTER TABLE public.video_projects ADD CONSTRAINT video_projects_status_check
  CHECK (status IN ('draft', 'approved', 'archived', 'rendering', 'failed'));

-- 6. Ensure columns exist
ALTER TABLE public.video_renders ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE public.video_renders ADD COLUMN IF NOT EXISTS worker_job_id TEXT;
ALTER TABLE public.video_exports ADD COLUMN IF NOT EXISTS format TEXT;
