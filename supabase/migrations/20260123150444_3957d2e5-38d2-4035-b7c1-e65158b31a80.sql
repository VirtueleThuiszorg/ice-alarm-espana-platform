-- =============================================
-- AI AGENT SYSTEM - PHASE 1 DATABASE SCHEMA
-- =============================================

-- 1. AI Agents Registry
CREATE TABLE public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  enabled boolean DEFAULT true,
  mode text DEFAULT 'advise_only' CHECK (mode IN ('advise_only', 'draft_only', 'auto_act')),
  instance_count int DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. AI Agent Configurations (versioned)
CREATE TABLE public.ai_agent_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  system_instruction text NOT NULL,
  business_context text,
  tool_policy jsonb DEFAULT '{}',
  language_policy jsonb DEFAULT '{"default": "auto", "strict": true}',
  read_permissions jsonb DEFAULT '[]',
  write_permissions jsonb DEFAULT '[]',
  triggers jsonb DEFAULT '[]',
  version int DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 3. AI Memory (knowledge base)
CREATE TABLE public.ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global', 'agent', 'conversation')),
  scope_id uuid,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NOT NULL,
  importance int DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 4. AI Events (trigger stream)
CREATE TABLE public.ai_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  payload jsonb DEFAULT '{}',
  processed boolean DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 5. AI Runs (execution history)
CREATE TABLE public.ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  trigger_event_id uuid REFERENCES public.ai_events(id) ON DELETE SET NULL,
  input_context jsonb,
  output jsonb,
  model_used text,
  tokens_used int,
  duration_ms int,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- 6. AI Actions (proposed/executed actions)
CREATE TABLE public.ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.ai_runs(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'executed', 'rejected')),
  executed_at timestamptz,
  executed_by uuid,
  result jsonb,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Admin access only
CREATE POLICY "Admins can manage ai_agents" ON public.ai_agents FOR ALL
  USING (get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Staff can view ai_agents" ON public.ai_agents FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage ai_agent_configs" ON public.ai_agent_configs FOR ALL
  USING (get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Staff can view ai_agent_configs" ON public.ai_agent_configs FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage ai_memory" ON public.ai_memory FOR ALL
  USING (get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Staff can view ai_memory" ON public.ai_memory FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage ai_events" ON public.ai_events FOR ALL
  USING (get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Staff can view ai_events" ON public.ai_events FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage ai_runs" ON public.ai_runs FOR ALL
  USING (get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Staff can view ai_runs" ON public.ai_runs FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage ai_actions" ON public.ai_actions FOR ALL
  USING (get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Staff can view ai_actions" ON public.ai_actions FOR SELECT
  USING (is_staff(auth.uid()));

-- Enable realtime for ai_events
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_events;

-- Create indexes for performance
CREATE INDEX idx_ai_agent_configs_agent_id ON public.ai_agent_configs(agent_id);
CREATE INDEX idx_ai_agent_configs_active ON public.ai_agent_configs(agent_id, is_active) WHERE is_active = true;
CREATE INDEX idx_ai_memory_scope ON public.ai_memory(scope, scope_id);
CREATE INDEX idx_ai_memory_agent ON public.ai_memory(agent_id);
CREATE INDEX idx_ai_events_processed ON public.ai_events(processed, created_at) WHERE processed = false;
CREATE INDEX idx_ai_events_type ON public.ai_events(event_type, created_at);
CREATE INDEX idx_ai_runs_agent ON public.ai_runs(agent_id, created_at);
CREATE INDEX idx_ai_runs_status ON public.ai_runs(status, created_at);
CREATE INDEX idx_ai_actions_run ON public.ai_actions(run_id);
CREATE INDEX idx_ai_actions_status ON public.ai_actions(status, created_at);

-- Trigger for updated_at on ai_agents
CREATE TRIGGER update_ai_agents_updated_at
  BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert the 2 Phase 1 agents
INSERT INTO public.ai_agents (agent_key, name, description, enabled, mode, instance_count) VALUES
  ('main_brain', 'Main Brain', 'Central decision-maker and orchestrator. Sees everything, decides what matters, routes work, and notifies the Admin Boss.', true, 'auto_act', 1),
  ('customer_service_expert', 'Customer Service & Sales Expert', '24/7 frontend coverage for sales enquiries, support questions, partner interest, and onboarding guidance.', true, 'draft_only', 2);

-- Insert initial configurations for both agents
INSERT INTO public.ai_agent_configs (agent_id, system_instruction, business_context, tool_policy, language_policy, read_permissions, write_permissions, triggers, version, is_active)
SELECT 
  id,
  'You are the Main Brain of ICE Alarm, an emergency alert service for elderly people in Spain. You are the central orchestrator that monitors all business activity, identifies important events, creates internal tasks, and notifies the Admin (Lee) via WhatsApp when human attention is needed. You speak in clear, concise English. Always prioritize member safety and business-critical events.',
  'ICE Alarm provides personal emergency response devices (pendants) to elderly members in Spain. Members press a button to alert our call centre. We have partners who refer new members. Focus on: new sales, partner activity, support escalations, and alerts.',
  '{"whatsapp_notify": true, "task_create": true, "note_create": true, "escalate": true}',
  '{"output": "en", "notify_language": "en"}',
  '["orders", "members", "partners", "leads", "tickets", "conversations", "alerts", "tasks", "subscriptions", "payments"]',
  '["task_create", "note_create", "whatsapp_notify", "escalate"]',
  '["sale.created", "partner.joined", "ticket.created", "conversation.escalated", "alert.created"]',
  1,
  true
FROM public.ai_agents WHERE agent_key = 'main_brain';

INSERT INTO public.ai_agent_configs (agent_id, system_instruction, business_context, tool_policy, language_policy, read_permissions, write_permissions, triggers, version, is_active)
SELECT 
  id,
  'You are a friendly and professional customer service representative for ICE Alarm Spain. You help potential customers understand our personal emergency response service, answer questions about pricing and devices, and guide existing members with support issues. CRITICAL LANGUAGE RULE: Detect the customer''s language from their FIRST message. If Spanish, respond ONLY in Spanish. If English, respond ONLY in English. Never mix languages. Be warm, patient, and reassuring - many of our customers are elderly.',
  'ICE Alarm provides emergency pendant devices for €24.99/month (or €74.99/quarter, €149.99/semi-annual, €274.99/annual). The pendant has GPS, fall detection, and 24/7 monitoring. Registration fee is €49.99. We operate in Spain with call centres speaking Spanish and English.',
  '{"chat_reply": true, "lead_create": true, "ticket_create": true, "draft_response": true, "escalate": true, "request_human": true}',
  '{"detect_first": true, "strict_separation": true, "supported": ["es", "en"]}',
  '["products", "faqs", "knowledge_base", "conversation_history"]',
  '["chat_reply", "lead_create", "ticket_create", "draft_response", "escalate", "request_human"]',
  '["conversation.started", "message.received"]',
  1,
  true
FROM public.ai_agents WHERE agent_key = 'customer_service_expert';

-- Insert some initial memory/knowledge base entries
INSERT INTO public.ai_memory (scope, agent_id, title, content, importance, tags) 
SELECT 'agent', id, 'Pricing Information', 'Monthly: €24.99/month. Quarterly: €74.99 (save €0.01/month). Semi-annual: €149.99 (save €0.01/month). Annual: €274.99 (save €2.02/month). Registration fee: €49.99 one-time. Shipping: €14.99.', 10, ARRAY['pricing', 'sales']
FROM public.ai_agents WHERE agent_key = 'customer_service_expert';

INSERT INTO public.ai_memory (scope, agent_id, title, content, importance, tags)
SELECT 'agent', id, 'Device Features', 'The ICE Alarm pendant includes: SOS button for emergencies, GPS location tracking, automatic fall detection, two-way voice communication, water-resistant design, long battery life (up to 7 days standby), works anywhere with mobile coverage in Spain.', 9, ARRAY['product', 'features']
FROM public.ai_agents WHERE agent_key = 'customer_service_expert';

INSERT INTO public.ai_memory (scope, agent_id, title, content, importance, tags)
SELECT 'agent', id, 'Escalation Criteria', 'Escalate to Main Brain when: customer requests refund, customer reports device malfunction, customer expresses dissatisfaction, legal or compliance questions arise, medical emergency is mentioned, customer requests contract cancellation.', 10, ARRAY['escalation', 'policy']
FROM public.ai_agents WHERE agent_key = 'customer_service_expert';

INSERT INTO public.ai_memory (scope, title, content, importance, tags) VALUES
('global', 'Company Values', 'ICE Alarm prioritizes: Member safety above all, Dignity and respect for elderly customers, Clear and honest communication, Quick response times, Family peace of mind.', 10, ARRAY['values', 'culture']),
('global', 'Operating Hours', 'Our call centre operates 24/7, 365 days a year. Administrative office hours are Monday-Friday 9:00-18:00 CET.', 8, ARRAY['operations', 'hours']);