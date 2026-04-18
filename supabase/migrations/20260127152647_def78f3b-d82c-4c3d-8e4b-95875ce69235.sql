-- Create table for secure member update tokens
CREATE TABLE public.member_update_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  requested_fields TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE public.member_update_tokens ENABLE ROW LEVEL SECURITY;

-- Staff can manage update tokens (create, view, etc.)
CREATE POLICY "Staff can manage update tokens"
  ON public.member_update_tokens FOR ALL
  USING (is_staff(auth.uid()));

-- Add index for faster token lookups
CREATE INDEX idx_member_update_tokens_token ON public.member_update_tokens(token);
CREATE INDEX idx_member_update_tokens_member_id ON public.member_update_tokens(member_id);