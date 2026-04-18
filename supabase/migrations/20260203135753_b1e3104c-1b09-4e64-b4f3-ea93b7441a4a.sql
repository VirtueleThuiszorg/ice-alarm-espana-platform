-- =====================================================
-- AI OUTREACH MODULE - Isolated from Members CRM
-- =====================================================

-- Table 1: outreach_raw_leads
-- Stores discovered/imported leads before AI qualification
CREATE TABLE public.outreach_raw_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_type TEXT NOT NULL DEFAULT 'sales' CHECK (pipeline_type IN ('sales', 'partner')),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  website_url TEXT,
  phone TEXT,
  location TEXT,
  category TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- AI Rating fields
  ai_score NUMERIC(2,1) CHECK (ai_score >= 1.0 AND ai_score <= 5.0),
  ai_reasoning TEXT,
  ai_rated_at TIMESTAMP WITH TIME ZONE,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'rejected')),
  
  -- Metadata
  raw_data JSONB,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for outreach_raw_leads
CREATE INDEX idx_outreach_raw_leads_email ON public.outreach_raw_leads(email);
CREATE INDEX idx_outreach_raw_leads_pipeline ON public.outreach_raw_leads(pipeline_type);
CREATE INDEX idx_outreach_raw_leads_status ON public.outreach_raw_leads(status);
CREATE INDEX idx_outreach_raw_leads_created ON public.outreach_raw_leads(created_at DESC);

-- RLS for outreach_raw_leads
ALTER TABLE public.outreach_raw_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage outreach raw leads"
ON public.outreach_raw_leads FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Realtime for outreach_raw_leads
ALTER PUBLICATION supabase_realtime ADD TABLE public.outreach_raw_leads;

-- Table 2: outreach_crm_leads
-- Qualified leads that have passed AI scoring threshold
CREATE TABLE public.outreach_crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_lead_id UUID REFERENCES public.outreach_raw_leads(id) ON DELETE SET NULL,
  
  -- Contact info (copied for independence)
  pipeline_type TEXT NOT NULL DEFAULT 'sales' CHECK (pipeline_type IN ('sales', 'partner')),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  website_url TEXT,
  phone TEXT,
  location TEXT,
  category TEXT,
  source TEXT NOT NULL,
  
  -- AI data
  ai_score NUMERIC(2,1),
  research_summary TEXT,
  personalization_hooks JSONB,
  assigned_ai_agent TEXT,
  
  -- Pipeline status
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'replied', 'interested', 'converted', 'closed')),
  
  -- Campaign tracking
  campaign_id UUID,
  last_contacted_at TIMESTAMP WITH TIME ZONE,
  last_reply_at TIMESTAMP WITH TIME ZONE,
  email_count INTEGER DEFAULT 0,
  
  -- Conversion tracking (explicit only)
  converted_at TIMESTAMP WITH TIME ZONE,
  converted_to_member_id UUID,
  converted_to_partner_id UUID,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for outreach_crm_leads
CREATE INDEX idx_outreach_crm_leads_email ON public.outreach_crm_leads(email);
CREATE INDEX idx_outreach_crm_leads_pipeline ON public.outreach_crm_leads(pipeline_type);
CREATE INDEX idx_outreach_crm_leads_status ON public.outreach_crm_leads(status);
CREATE INDEX idx_outreach_crm_leads_created ON public.outreach_crm_leads(created_at DESC);

-- RLS for outreach_crm_leads
ALTER TABLE public.outreach_crm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage outreach CRM leads"
ON public.outreach_crm_leads FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Realtime for outreach_crm_leads
ALTER PUBLICATION supabase_realtime ADD TABLE public.outreach_crm_leads;

-- Table 3: outreach_campaigns
-- Email campaign configurations
CREATE TABLE public.outreach_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  pipeline_type TEXT NOT NULL DEFAULT 'sales' CHECK (pipeline_type IN ('sales', 'partner')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  
  -- Targeting
  target_categories TEXT[],
  target_locations TEXT[],
  min_ai_score NUMERIC(2,1) DEFAULT 3.5,
  
  -- Email sequence
  email_sequence JSONB DEFAULT '[]'::jsonb,
  days_between_emails INTEGER DEFAULT 3,
  max_emails_per_lead INTEGER DEFAULT 5,
  
  -- Stats
  leads_count INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  conversions_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for outreach_campaigns
ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage outreach campaigns"
ON public.outreach_campaigns FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Add FK constraint now that campaigns table exists
ALTER TABLE public.outreach_crm_leads 
ADD CONSTRAINT fk_outreach_crm_leads_campaign 
FOREIGN KEY (campaign_id) REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL;

-- Table 4: outreach_email_drafts
-- Email drafts and sent emails
CREATE TABLE public.outreach_email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_lead_id UUID NOT NULL REFERENCES public.outreach_crm_leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL,
  
  -- Email content
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'scheduled', 'sent', 'delivered', 'opened', 'replied', 'bounced', 'failed')),
  
  -- Scheduling
  scheduled_for TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Tracking
  sequence_number INTEGER DEFAULT 1,
  external_message_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for outreach_email_drafts
ALTER TABLE public.outreach_email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage outreach email drafts"
ON public.outreach_email_drafts FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Table 5: outreach_email_threads
-- Email conversation threads for inbox
CREATE TABLE public.outreach_email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_lead_id UUID NOT NULL REFERENCES public.outreach_crm_leads(id) ON DELETE CASCADE,
  
  -- Thread info
  subject TEXT NOT NULL,
  thread_id TEXT,
  
  -- Message content
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  message_body TEXT NOT NULL,
  
  -- Classification (for inbound)
  ai_classification TEXT CHECK (ai_classification IN ('interested', 'question', 'not_interested', 'unsubscribe')),
  ai_suggested_reply TEXT,
  
  -- Status
  requires_action BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for outreach_email_threads
ALTER TABLE public.outreach_email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage outreach email threads"
ON public.outreach_email_threads FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Realtime for inbox
ALTER PUBLICATION supabase_realtime ADD TABLE public.outreach_email_threads;

-- Add default min score threshold to system_settings
INSERT INTO public.system_settings (key, value)
VALUES ('outreach_min_score_threshold', '3.5')
ON CONFLICT (key) DO NOTHING;

-- Trigger for updated_at on outreach tables
CREATE TRIGGER update_outreach_raw_leads_updated_at
BEFORE UPDATE ON public.outreach_raw_leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_outreach_crm_leads_updated_at
BEFORE UPDATE ON public.outreach_crm_leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_outreach_campaigns_updated_at
BEFORE UPDATE ON public.outreach_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();