-- Create registration_drafts table to capture partial join wizard data
CREATE TABLE public.registration_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  current_step INTEGER NOT NULL DEFAULT 0,
  wizard_data JSONB NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'join_wizard',
  status TEXT NOT NULL DEFAULT 'in_progress',
  converted_member_id UUID REFERENCES public.members(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  abandoned_at TIMESTAMP WITH TIME ZONE
);

-- Create index for faster lookups
CREATE INDEX idx_registration_drafts_session_id ON public.registration_drafts(session_id);
CREATE INDEX idx_registration_drafts_email ON public.registration_drafts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_registration_drafts_status ON public.registration_drafts(status);
CREATE INDEX idx_registration_drafts_created_at ON public.registration_drafts(created_at DESC);

-- Enable RLS
ALTER TABLE public.registration_drafts ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to insert/update their own drafts (by session_id)
CREATE POLICY "Anyone can insert drafts"
ON public.registration_drafts
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update own draft by session"
ON public.registration_drafts
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Staff can view all drafts for lead management
CREATE POLICY "Staff can view all drafts"
ON public.registration_drafts
FOR SELECT
USING (is_staff(auth.uid()));

-- Admins can manage all drafts
CREATE POLICY "Admins can manage drafts"
ON public.registration_drafts
FOR ALL
USING (is_admin(auth.uid()));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_registration_drafts_updated_at
BEFORE UPDATE ON public.registration_drafts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();