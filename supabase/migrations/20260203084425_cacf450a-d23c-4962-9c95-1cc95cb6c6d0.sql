-- Create documentation category enum
CREATE TYPE documentation_category AS ENUM (
  'general',
  'member_guide',
  'staff',
  'device',
  'emergency',
  'partner'
);

-- Create documentation status enum
CREATE TYPE documentation_status AS ENUM (
  'draft',
  'published'
);

-- Create documentation table
CREATE TABLE public.documentation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category documentation_category NOT NULL DEFAULT 'general',
  content TEXT NOT NULL DEFAULT '',
  visibility TEXT[] NOT NULL DEFAULT ARRAY['admin']::TEXT[],
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  status documentation_status NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES public.staff(id),
  updated_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for common queries
CREATE INDEX idx_documentation_category ON public.documentation(category);
CREATE INDEX idx_documentation_status ON public.documentation(status);
CREATE INDEX idx_documentation_language ON public.documentation(language);
CREATE INDEX idx_documentation_visibility ON public.documentation USING GIN(visibility);
CREATE INDEX idx_documentation_tags ON public.documentation USING GIN(tags);

-- Enable Row Level Security
ALTER TABLE public.documentation ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Admins have full CRUD access
CREATE POLICY "Admins can manage documentation"
ON public.documentation
FOR ALL
USING (get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

-- Staff can read docs where 'staff' is in visibility array
CREATE POLICY "Staff can view staff-visible docs"
ON public.documentation
FOR SELECT
USING (
  is_staff(auth.uid()) AND 
  'staff' = ANY(visibility) AND 
  status = 'published'
);

-- Members can read docs where 'member' is in visibility array
CREATE POLICY "Members can view member-visible docs"
ON public.documentation
FOR SELECT
USING (
  get_member_id(auth.uid()) IS NOT NULL AND 
  'member' = ANY(visibility) AND 
  status = 'published'
);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_documentation_updated_at
BEFORE UPDATE ON public.documentation
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.documentation;