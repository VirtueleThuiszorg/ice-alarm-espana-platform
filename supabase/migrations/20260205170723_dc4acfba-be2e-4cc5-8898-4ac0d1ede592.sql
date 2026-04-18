-- Drop the existing constraint
ALTER TABLE video_projects DROP CONSTRAINT video_projects_status_check;

-- Add updated constraint with "rendering" status
ALTER TABLE video_projects ADD CONSTRAINT video_projects_status_check 
  CHECK (status = ANY (ARRAY['draft', 'rendering', 'approved', 'archived']));