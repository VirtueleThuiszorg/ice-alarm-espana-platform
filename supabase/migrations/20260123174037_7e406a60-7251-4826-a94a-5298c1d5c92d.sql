-- Create storage bucket for partner presentations
INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-presentations', 'partner-presentations', true);

-- RLS Policies for storage: Partners can only access their own files
CREATE POLICY "Partners can view own presentations"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'partner-presentations' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Partners can upload own presentations"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'partner-presentations' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Partners can delete own presentations"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'partner-presentations' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create table to track presentation metadata
CREATE TABLE public.partner_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.partner_presentations ENABLE ROW LEVEL SECURITY;

-- Partners can view their own presentations
CREATE POLICY "Partners can view own presentations"
ON public.partner_presentations
FOR SELECT USING (partner_id = get_partner_id(auth.uid()));

-- Partners can insert their own presentations
CREATE POLICY "Partners can insert own presentations"
ON public.partner_presentations
FOR INSERT WITH CHECK (partner_id = get_partner_id(auth.uid()));

-- Partners can delete their own presentations
CREATE POLICY "Partners can delete own presentations"
ON public.partner_presentations
FOR DELETE USING (partner_id = get_partner_id(auth.uid()));

-- Staff can manage all presentations
CREATE POLICY "Staff can manage presentations"
ON public.partner_presentations
FOR ALL USING (is_staff(auth.uid()));