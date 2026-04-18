-- Create enum for ticket categories
CREATE TYPE public.ticket_category AS ENUM ('pendant_help', 'technical_issue', 'member_query', 'billing_question', 'general', 'other');

-- Create enum for ticket status
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'pending', 'resolved', 'closed');

-- Create internal_tickets table
CREATE TABLE public.internal_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category public.ticket_category NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  status public.ticket_status NOT NULL DEFAULT 'open',
  created_by UUID NOT NULL REFERENCES public.staff(id),
  assigned_to UUID REFERENCES public.staff(id),
  member_id UUID REFERENCES public.members(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ticket_comments table for conversation thread
CREATE TABLE public.ticket_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.internal_tickets(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id),
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.internal_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies for internal_tickets
CREATE POLICY "Staff can view all tickets" 
ON public.internal_tickets 
FOR SELECT 
USING (is_staff(auth.uid()));

CREATE POLICY "Staff can create tickets" 
ON public.internal_tickets 
FOR INSERT 
WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Admins can manage tickets" 
ON public.internal_tickets 
FOR ALL 
USING (is_admin(auth.uid()));

CREATE POLICY "Staff can update own tickets" 
ON public.internal_tickets 
FOR UPDATE 
USING (is_staff(auth.uid()) AND (created_by IN (SELECT id FROM public.staff WHERE user_id = auth.uid())));

-- RLS policies for ticket_comments
CREATE POLICY "Staff can view ticket comments" 
ON public.ticket_comments 
FOR SELECT 
USING (is_staff(auth.uid()));

CREATE POLICY "Staff can create ticket comments" 
ON public.ticket_comments 
FOR INSERT 
WITH CHECK (is_staff(auth.uid()));

-- Enable realtime for tickets
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_comments;

-- Create trigger for updated_at
CREATE TRIGGER update_internal_tickets_updated_at
BEFORE UPDATE ON public.internal_tickets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to generate ticket number
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ticket_number := 'TKT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-generating ticket number
CREATE TRIGGER generate_ticket_number_trigger
BEFORE INSERT ON public.internal_tickets
FOR EACH ROW
EXECUTE FUNCTION public.generate_ticket_number();