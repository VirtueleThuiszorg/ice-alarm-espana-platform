-- Add new columns for campaign configuration
ALTER TABLE public.outreach_campaigns 
ADD COLUMN IF NOT EXISTS target_description TEXT,
ADD COLUMN IF NOT EXISTS default_language TEXT NOT NULL DEFAULT 'en' CHECK (default_language IN ('en', 'es')),
ADD COLUMN IF NOT EXISTS email_tone TEXT NOT NULL DEFAULT 'professional' CHECK (email_tone IN ('professional', 'friendly', 'neutral')),
ADD COLUMN IF NOT EXISTS outreach_goal TEXT NOT NULL DEFAULT 'intro' CHECK (outreach_goal IN ('intro', 'partnership', 'meeting')),
ADD COLUMN IF NOT EXISTS follow_up_enabled BOOLEAN NOT NULL DEFAULT true;

-- Add index for status to improve filtering
CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_status ON public.outreach_campaigns(status);