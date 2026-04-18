-- Create leads table for contact form submissions
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  enquiry_type TEXT NOT NULL DEFAULT 'general',
  message TEXT,
  source TEXT DEFAULT 'contact_form',
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to UUID REFERENCES public.staff(id),
  notes TEXT,
  converted_member_id UUID REFERENCES public.members(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  contacted_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Public can insert leads (contact form submissions)
CREATE POLICY "Anyone can submit leads" 
ON public.leads 
FOR INSERT 
WITH CHECK (true);

-- Staff can view all leads
CREATE POLICY "Staff can view all leads" 
ON public.leads 
FOR SELECT 
USING (is_staff(auth.uid()));

-- Admins can manage leads
CREATE POLICY "Admins can manage leads" 
ON public.leads 
FOR ALL 
USING (is_admin(auth.uid()));

-- Staff can update leads they're assigned to
CREATE POLICY "Staff can update assigned leads" 
ON public.leads 
FOR UPDATE 
USING (is_staff(auth.uid()) AND (assigned_to IN (
  SELECT id FROM staff WHERE user_id = auth.uid()
)));

-- Create updated_at trigger
CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for leads
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- Add index for faster queries
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);