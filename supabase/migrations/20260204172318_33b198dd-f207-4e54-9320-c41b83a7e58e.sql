-- ============================================================
-- Extend conversations table and add threading tables
-- ============================================================

-- Add missing columns to existing conversations table
ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS lead_id uuid,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS last_channel text;

-- Create conversation_messages table - individual messages across channels
CREATE TABLE public.conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('chat', 'voice')),
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  meta jsonb
);

-- Create conversation_calls table - tracks voice calls linked to conversations
CREATE TABLE public.conversation_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  call_sid text UNIQUE,
  direction text CHECK (direction IN ('inbound', 'outbound')),
  from_number text,
  to_number text,
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  status text
);

-- Create indexes for efficient queries
CREATE INDEX idx_conversation_messages_conversation_id ON public.conversation_messages(conversation_id);
CREATE INDEX idx_conversation_messages_created_at ON public.conversation_messages(created_at);
CREATE INDEX idx_conversation_calls_conversation_id ON public.conversation_calls(conversation_id);
CREATE INDEX idx_conversation_calls_call_sid ON public.conversation_calls(call_sid);

-- Enable Row Level Security
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_calls ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversation_messages
CREATE POLICY "Anyone can insert messages" ON public.conversation_messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read messages" ON public.conversation_messages
  FOR SELECT USING (true);

-- RLS Policies for conversation_calls
CREATE POLICY "Anyone can manage calls" ON public.conversation_calls
  FOR ALL USING (true);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;