-- Create storage bucket for website images
INSERT INTO storage.buckets (id, name, public)
VALUES ('website-images', 'website-images', true);

-- Storage policies for website-images bucket
CREATE POLICY "Anyone can view website images"
ON storage.objects FOR SELECT
USING (bucket_id = 'website-images');

CREATE POLICY "Admins can upload website images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'website-images' AND is_admin(auth.uid()));

CREATE POLICY "Admins can update website images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'website-images' AND is_admin(auth.uid()));

CREATE POLICY "Admins can delete website images"
ON storage.objects FOR DELETE
USING (bucket_id = 'website-images' AND is_admin(auth.uid()));

-- Create website_images table for tracking image assignments
CREATE TABLE public.website_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_key TEXT NOT NULL UNIQUE,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  updated_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.website_images ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view website images"
ON public.website_images FOR SELECT
USING (true);

CREATE POLICY "Admins can manage website images"
ON public.website_images FOR ALL
USING (is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_website_images_updated_at
BEFORE UPDATE ON public.website_images
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();