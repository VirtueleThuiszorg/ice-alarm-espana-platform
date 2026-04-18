-- Stage 4-6: Content Generation, Scheduling & Publishing History

-- Add columns to media_content_calendar for generated content
ALTER TABLE public.media_content_calendar 
ADD COLUMN IF NOT EXISTS generated_post_text TEXT,
ADD COLUMN IF NOT EXISTS generated_post_text_es TEXT,
ADD COLUMN IF NOT EXISTS generated_blog_intro TEXT,
ADD COLUMN IF NOT EXISTS generated_blog_content TEXT,
ADD COLUMN IF NOT EXISTS generated_image_prompt TEXT,
ADD COLUMN IF NOT EXISTS generated_image_url TEXT,
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS publish_to_blog BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS publish_to_facebook BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS publish_to_instagram BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS blog_post_id UUID REFERENCES public.blog_posts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS facebook_post_id TEXT,
ADD COLUMN IF NOT EXISTS publish_error TEXT,
ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;

-- Update status enum to include more states
-- (Already has: planned, generating, ready, published, skipped)
-- Add 'approved' and 'failed' and 'disabled' if needed via check constraint

-- Create publishing history table for memory/anti-repetition
CREATE TABLE IF NOT EXISTS public.media_publishing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_item_id UUID REFERENCES public.media_content_calendar(id) ON DELETE SET NULL,
  goal_id UUID REFERENCES public.media_goals(id) ON DELETE SET NULL,
  audience_id UUID REFERENCES public.media_audiences(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES public.media_topics(id) ON DELETE SET NULL,
  image_style_id UUID REFERENCES public.media_image_styles(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  platform TEXT NOT NULL, -- 'blog', 'facebook', 'instagram'
  post_text TEXT,
  image_url TEXT,
  external_post_id TEXT, -- facebook_post_id, blog slug, etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media_publishing_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for staff access
CREATE POLICY "Staff can view publishing history"
ON public.media_publishing_history FOR SELECT
USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert publishing history"
ON public.media_publishing_history FOR INSERT
WITH CHECK (public.is_staff(auth.uid()));

-- Index for efficient history queries
CREATE INDEX IF NOT EXISTS idx_publishing_history_published_at 
ON public.media_publishing_history(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_publishing_history_goal 
ON public.media_publishing_history(goal_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_publishing_history_audience 
ON public.media_publishing_history(audience_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_publishing_history_topic 
ON public.media_publishing_history(topic_id, published_at DESC);