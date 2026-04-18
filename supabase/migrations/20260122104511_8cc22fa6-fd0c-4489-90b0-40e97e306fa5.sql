-- Create crm_events table to log outbound CRM events
CREATE TABLE public.crm_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;

-- Only staff can view CRM events
CREATE POLICY "Staff can view crm events"
  ON public.crm_events
  FOR SELECT
  USING (is_staff(auth.uid()));

-- Staff can insert CRM events
CREATE POLICY "Staff can insert crm events"
  ON public.crm_events
  FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

-- Service role has full access (for edge functions)
CREATE POLICY "Service role full access"
  ON public.crm_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add metadata column to partner_attributions for UTM tracking
ALTER TABLE public.partner_attributions 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create index on event_type for filtering
CREATE INDEX idx_crm_events_event_type ON public.crm_events(event_type);
CREATE INDEX idx_crm_events_created_at ON public.crm_events(created_at DESC);