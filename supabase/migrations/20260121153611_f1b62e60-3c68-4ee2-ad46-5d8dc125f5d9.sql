-- Create member_notes table (CRM Notes)
CREATE TABLE public.member_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  note_type TEXT CHECK (note_type IN ('general', 'medical', 'payment', 'support', 'followup', 'complaint')) DEFAULT 'general',
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_private BOOLEAN DEFAULT false,
  followup_date DATE,
  followup_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create conversations table (Messaging System)
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  subject TEXT,
  status TEXT CHECK (status IN ('open', 'pending', 'resolved', 'closed')) DEFAULT 'open',
  priority TEXT CHECK (priority IN ('low', 'normal', 'high', 'urgent')) DEFAULT 'normal',
  assigned_to UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create messages table (Individual Messages)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_type TEXT CHECK (sender_type IN ('member', 'staff', 'system')) NOT NULL,
  sender_id UUID,
  content TEXT NOT NULL,
  message_type TEXT CHECK (message_type IN ('text', 'sms', 'whatsapp', 'email', 'call_log', 'system')) DEFAULT 'text',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create member_interactions table (Activity Timeline)
CREATE TABLE public.member_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  interaction_type TEXT CHECK (interaction_type IN (
    'call_inbound', 'call_outbound', 'sms_sent', 'sms_received', 
    'whatsapp_sent', 'whatsapp_received', 'email_sent', 'email_received',
    'alert_received', 'alert_resolved', 'note_added', 'profile_updated',
    'payment_received', 'payment_failed', 'subscription_changed',
    'device_assigned', 'device_issue', 'complaint', 'feedback'
  )) NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create tasks table (Follow-up Tasks)
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT CHECK (priority IN ('low', 'normal', 'high', 'urgent')) DEFAULT 'normal',
  status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.member_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for member_notes
CREATE POLICY "Staff can view all notes" ON public.member_notes FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "Staff can manage notes" ON public.member_notes FOR ALL USING (is_staff(auth.uid()));

-- RLS Policies for conversations
CREATE POLICY "Staff can view all conversations" ON public.conversations FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "Staff can manage conversations" ON public.conversations FOR ALL USING (is_staff(auth.uid()));
CREATE POLICY "Members can view own conversations" ON public.conversations FOR SELECT USING (member_id = get_member_id(auth.uid()));
CREATE POLICY "Members can create conversations" ON public.conversations FOR INSERT WITH CHECK (member_id = get_member_id(auth.uid()));

-- RLS Policies for messages
CREATE POLICY "Staff can view all messages" ON public.messages FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "Staff can manage messages" ON public.messages FOR ALL USING (is_staff(auth.uid()));
CREATE POLICY "Members can view own conversation messages" ON public.messages FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.member_id = get_member_id(auth.uid())));
CREATE POLICY "Members can send messages" ON public.messages FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.member_id = get_member_id(auth.uid())));

-- RLS Policies for member_interactions
CREATE POLICY "Staff can view all interactions" ON public.member_interactions FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "Staff can manage interactions" ON public.member_interactions FOR ALL USING (is_staff(auth.uid()));
CREATE POLICY "Members can view own interactions" ON public.member_interactions FOR SELECT USING (member_id = get_member_id(auth.uid()));

-- RLS Policies for tasks
CREATE POLICY "Staff can view all tasks" ON public.tasks FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "Staff can manage tasks" ON public.tasks FOR ALL USING (is_staff(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_member_notes_member_id ON public.member_notes(member_id);
CREATE INDEX idx_member_notes_staff_id ON public.member_notes(staff_id);
CREATE INDEX idx_member_notes_followup_date ON public.member_notes(followup_date) WHERE followup_completed = false;

CREATE INDEX idx_conversations_member_id ON public.conversations(member_id);
CREATE INDEX idx_conversations_assigned_to ON public.conversations(assigned_to);
CREATE INDEX idx_conversations_status ON public.conversations(status);
CREATE INDEX idx_conversations_last_message_at ON public.conversations(last_message_at DESC);

CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

CREATE INDEX idx_member_interactions_member_id ON public.member_interactions(member_id);
CREATE INDEX idx_member_interactions_created_at ON public.member_interactions(created_at DESC);
CREATE INDEX idx_member_interactions_type ON public.member_interactions(interaction_type);

CREATE INDEX idx_tasks_member_id ON public.tasks(member_id);
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);

-- Create triggers for updated_at
CREATE TRIGGER update_member_notes_updated_at BEFORE UPDATE ON public.member_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;