-- Create website_events table for tracking visitor analytics
CREATE TABLE public.website_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'page_view', 'button_click', 'form_submit', 'join_started', etc.
  page_path TEXT,
  page_title TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  device_type TEXT, -- 'desktop', 'mobile', 'tablet'
  browser TEXT,
  operating_system TEXT,
  screen_resolution TEXT,
  country_code TEXT,
  country_name TEXT,
  city TEXT,
  region TEXT,
  session_id TEXT,
  visitor_id TEXT,
  user_agent TEXT,
  language TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_website_events_created_at ON public.website_events(created_at DESC);
CREATE INDEX idx_website_events_event_type ON public.website_events(event_type);
CREATE INDEX idx_website_events_page_path ON public.website_events(page_path);
CREATE INDEX idx_website_events_session_id ON public.website_events(session_id);
CREATE INDEX idx_website_events_visitor_id ON public.website_events(visitor_id);

-- Enable Row Level Security
ALTER TABLE public.website_events ENABLE ROW LEVEL SECURITY;

-- Staff can read all website events
CREATE POLICY "Staff can read website events"
  ON public.website_events
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Anyone can insert website events (for tracking)
CREATE POLICY "Anyone can insert website events"
  ON public.website_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Enable realtime for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.website_events;