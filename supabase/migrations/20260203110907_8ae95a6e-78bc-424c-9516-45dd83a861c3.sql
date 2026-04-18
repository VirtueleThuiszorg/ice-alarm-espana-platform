-- Create table to cache Facebook engagement metrics
CREATE TABLE public.social_post_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  social_post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  facebook_post_id TEXT NOT NULL,
  reactions_total INTEGER DEFAULT 0,
  reactions_breakdown JSONB DEFAULT '{}',
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique constraint to ensure one metrics record per social post
  CONSTRAINT unique_social_post_metrics UNIQUE (social_post_id)
);

-- Enable Row Level Security
ALTER TABLE public.social_post_metrics ENABLE ROW LEVEL SECURITY;

-- Staff can read metrics
CREATE POLICY "Staff can read social post metrics"
ON public.social_post_metrics
FOR SELECT
USING (public.is_staff(auth.uid()));

-- Staff can insert/update metrics
CREATE POLICY "Staff can manage social post metrics"
ON public.social_post_metrics
FOR ALL
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Create index for faster lookups
CREATE INDEX idx_social_post_metrics_post_id ON public.social_post_metrics(social_post_id);
CREATE INDEX idx_social_post_metrics_fetched_at ON public.social_post_metrics(fetched_at);