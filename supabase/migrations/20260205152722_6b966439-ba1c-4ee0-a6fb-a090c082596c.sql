-- Create system_integrations table for OAuth token storage
CREATE TABLE IF NOT EXISTS public.system_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  channel_id TEXT,
  channel_name TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  scopes TEXT[],
  status TEXT NOT NULL DEFAULT 'disconnected',
  connected_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  connected_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_integration_type UNIQUE (integration_type)
);

-- Add YouTube publishing columns to video_exports
ALTER TABLE public.video_exports 
  ADD COLUMN IF NOT EXISTS youtube_video_id TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_status TEXT,
  ADD COLUMN IF NOT EXISTS youtube_error TEXT,
  ADD COLUMN IF NOT EXISTS youtube_published_at TIMESTAMPTZ;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_integrations_type ON public.system_integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_video_exports_youtube_status ON public.video_exports(youtube_status);

-- Enable RLS on system_integrations
ALTER TABLE public.system_integrations ENABLE ROW LEVEL SECURITY;

-- RLS policies - only admins can access
CREATE POLICY "Admins can view system integrations"
  ON public.system_integrations
  FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert system integrations"
  ON public.system_integrations
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update system integrations"
  ON public.system_integrations
  FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete system integrations"
  ON public.system_integrations
  FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_system_integrations_updated_at
  BEFORE UPDATE ON public.system_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();