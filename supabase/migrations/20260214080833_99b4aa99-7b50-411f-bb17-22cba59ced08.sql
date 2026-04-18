
-- Create admin_ideas table
CREATE TABLE public.admin_ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'note' CHECK (category IN ('idea', 'bug', 'feature', 'note')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  is_checklist BOOLEAN NOT NULL DEFAULT false,
  completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_ideas ENABLE ROW LEVEL SECURITY;

-- Staff can manage their own ideas
CREATE POLICY "Staff can view own ideas"
  ON public.admin_ideas FOR SELECT
  USING (staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "Admins can view all ideas"
  ON public.admin_ideas FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Staff can insert own ideas"
  ON public.admin_ideas FOR INSERT
  WITH CHECK (staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can update own ideas"
  ON public.admin_ideas FOR UPDATE
  USING (staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can delete own ideas"
  ON public.admin_ideas FOR DELETE
  USING (staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_admin_ideas_updated_at
  BEFORE UPDATE ON public.admin_ideas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_admin_ideas_staff_id ON public.admin_ideas(staff_id);
