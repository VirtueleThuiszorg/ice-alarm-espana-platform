-- Add format column to video_exports to track variant format
ALTER TABLE public.video_exports
ADD COLUMN IF NOT EXISTS format text DEFAULT '16:9';

-- Update existing exports to inherit format from project
UPDATE public.video_exports e
SET format = p.format
FROM public.video_projects p
WHERE e.project_id = p.id AND e.format IS NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.video_exports.format IS 'The aspect ratio format of this export variant (9:16, 16:9, 1:1)';