-- Create voice call sessions table for AI-powered voice conversations
CREATE TABLE public.voice_call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid TEXT NOT NULL UNIQUE,
  caller_phone TEXT NOT NULL,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  language TEXT DEFAULT 'es-ES',
  messages JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active',
  timeout_count INTEGER DEFAULT 0,
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add comment for documentation
COMMENT ON TABLE public.voice_call_sessions IS 'Stores multi-turn AI voice conversations via Twilio';

-- Create indexes for quick lookups
CREATE INDEX idx_voice_sessions_call_sid ON public.voice_call_sessions(call_sid);
CREATE INDEX idx_voice_sessions_member ON public.voice_call_sessions(member_id);
CREATE INDEX idx_voice_sessions_status ON public.voice_call_sessions(status);
CREATE INDEX idx_voice_sessions_created ON public.voice_call_sessions(created_at DESC);

-- Enable RLS
ALTER TABLE public.voice_call_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Staff can view all sessions
CREATE POLICY "Staff can view voice sessions" ON public.voice_call_sessions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff 
    WHERE staff.user_id = auth.uid()
  )
);

-- Service role (edge functions) can do everything
CREATE POLICY "Service role full access" ON public.voice_call_sessions
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_voice_sessions_updated_at
  BEFORE UPDATE ON public.voice_call_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for dashboard monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_call_sessions;