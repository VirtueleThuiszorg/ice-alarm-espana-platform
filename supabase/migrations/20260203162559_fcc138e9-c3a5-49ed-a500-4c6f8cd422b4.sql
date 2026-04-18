-- Create outreach_settings table for caps and limits
CREATE TABLE public.outreach_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.outreach_settings ENABLE ROW LEVEL SECURITY;

-- Staff can read/write settings
CREATE POLICY "Staff can read outreach settings"
  ON public.outreach_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can update outreach settings"
  ON public.outreach_settings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can insert outreach settings"
  ON public.outreach_settings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid()));

-- Insert default cap settings
INSERT INTO public.outreach_settings (setting_key, setting_value, description) VALUES
  ('max_qualified_per_day', '{"value": 20, "enabled": true}', 'Maximum leads that can be qualified per day'),
  ('max_ai_ratings_per_day', '{"value": 100, "enabled": true}', 'Maximum AI rating jobs per day'),
  ('max_ai_research_per_day', '{"value": 20, "enabled": true}', 'Maximum AI research jobs per day'),
  ('max_ai_emails_per_day', '{"value": 30, "enabled": true}', 'Maximum AI-generated emails per day'),
  ('max_emails_per_inbox_per_day', '{"value": 30, "enabled": true}', 'Maximum emails sent per inbox per day');

-- Create outreach_daily_usage table to track usage
CREATE TABLE public.outreach_daily_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  usage_type text NOT NULL,
  usage_count integer NOT NULL DEFAULT 0,
  inbox_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(usage_date, usage_type, inbox_id)
);

-- Enable RLS
ALTER TABLE public.outreach_daily_usage ENABLE ROW LEVEL SECURITY;

-- Staff can read/write usage
CREATE POLICY "Staff can read outreach usage"
  ON public.outreach_daily_usage FOR SELECT
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can manage outreach usage"
  ON public.outreach_daily_usage FOR ALL
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid()));

-- Create outreach_queued_tasks table for queued items
CREATE TABLE public.outreach_queued_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL,
  entity_id uuid NOT NULL,
  entity_type text NOT NULL,
  priority integer DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  scheduled_for date NOT NULL DEFAULT CURRENT_DATE + 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  error_message text NULL
);

-- Enable RLS
ALTER TABLE public.outreach_queued_tasks ENABLE ROW LEVEL SECURITY;

-- Staff can manage queued tasks
CREATE POLICY "Staff can manage queued tasks"
  ON public.outreach_queued_tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid()));

-- Create index for queued tasks
CREATE INDEX idx_outreach_queued_tasks_scheduled ON public.outreach_queued_tasks(scheduled_for, status);
CREATE INDEX idx_outreach_daily_usage_date ON public.outreach_daily_usage(usage_date, usage_type);