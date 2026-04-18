-- Video Hub Tables Migration
-- Stage 3: Database + Storage for Video Hub feature

-- 1. Create video_templates table first (referenced by video_projects)
CREATE TABLE IF NOT EXISTS public.video_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER DEFAULT 1,
  schema_json JSONB NOT NULL DEFAULT '{}',
  allowed_formats TEXT[] DEFAULT ARRAY['9:16', '16:9', '1:1'],
  allowed_durations INTEGER[] DEFAULT ARRAY[15, 30, 60],
  thumbnail_url TEXT,
  is_locked BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on video_templates
ALTER TABLE public.video_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can read templates
CREATE POLICY "Staff can read video templates" ON public.video_templates
  FOR SELECT USING (public.is_staff(auth.uid()));

-- 2. Create video_projects table
CREATE TABLE IF NOT EXISTS public.video_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_id UUID REFERENCES public.video_templates(id),
  language TEXT NOT NULL CHECK (language IN ('en', 'es', 'both')) DEFAULT 'en',
  format TEXT NOT NULL CHECK (format IN ('9:16', '16:9', '1:1')) DEFAULT '16:9',
  duration INTEGER NOT NULL DEFAULT 15,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  data_json JSONB NOT NULL DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on video_projects
ALTER TABLE public.video_projects ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can manage video projects
CREATE POLICY "Staff can manage video projects" ON public.video_projects
  FOR ALL USING (public.is_staff(auth.uid()));

-- 3. Create video_renders table
CREATE TABLE IF NOT EXISTS public.video_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.video_projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'failed', 'done')),
  progress INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on video_renders
ALTER TABLE public.video_renders ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can manage video renders
CREATE POLICY "Staff can manage video renders" ON public.video_renders
  FOR ALL USING (public.is_staff(auth.uid()));

-- 4. Create video_exports table
CREATE TABLE IF NOT EXISTS public.video_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.video_projects(id) ON DELETE CASCADE,
  render_id UUID REFERENCES public.video_renders(id),
  mp4_url TEXT,
  srt_url TEXT,
  vtt_url TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on video_exports
ALTER TABLE public.video_exports ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can manage video exports
CREATE POLICY "Staff can manage video exports" ON public.video_exports
  FOR ALL USING (public.is_staff(auth.uid()));

-- 5. Create video_brand_settings table
CREATE TABLE IF NOT EXISTS public.video_brand_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url TEXT,
  primary_color TEXT DEFAULT '#B91C1C',
  secondary_color TEXT DEFAULT '#1E3A8A',
  font_family TEXT DEFAULT 'Inter',
  watermark_enabled BOOLEAN DEFAULT true,
  disclaimers_en TEXT DEFAULT 'ICE Alarm España is a 24/7 personal alarm monitoring service providing peace of mind for elderly and vulnerable individuals.',
  disclaimers_es TEXT DEFAULT 'ICE Alarm España es un servicio de monitoreo de alarmas personales 24/7 que brinda tranquilidad a personas mayores y vulnerables.',
  default_cta_en TEXT DEFAULT 'Call Now',
  default_cta_es TEXT DEFAULT 'Llama Ahora',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on video_brand_settings
ALTER TABLE public.video_brand_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can manage video brand settings
CREATE POLICY "Staff can manage video brand settings" ON public.video_brand_settings
  FOR ALL USING (public.is_staff(auth.uid()));

-- 6. Create video_outreach_links table (for linking exports to AI Outreach)
CREATE TABLE IF NOT EXISTS public.video_outreach_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id UUID NOT NULL REFERENCES public.video_exports(id) ON DELETE CASCADE,
  campaign_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on video_outreach_links
ALTER TABLE public.video_outreach_links ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can manage video outreach links
CREATE POLICY "Staff can manage video outreach links" ON public.video_outreach_links
  FOR ALL USING (public.is_staff(auth.uid()));

-- 7. Seed initial ICE templates
INSERT INTO public.video_templates (name, description, allowed_durations, allowed_formats, schema_json) VALUES
('Calm Problem → Solution → CTA', 'A calm, reassuring template that presents a problem and offers ICE Alarm as the solution. Perfect for addressing common concerns about elderly safety.', ARRAY[15], ARRAY['9:16', '16:9', '1:1'], '{"sections": ["problem", "solution", "cta"], "fields": ["headline", "problem_text", "solution_text", "cta_text"]}'),
('How SOS Works', 'Step-by-step walkthrough of the SOS pendant functionality. Shows how easy it is to get help when needed.', ARRAY[30], ARRAY['9:16', '16:9', '1:1'], '{"sections": ["intro", "step1", "step2", "step3", "cta"], "fields": ["headline", "step1_text", "step2_text", "step3_text", "cta_text"]}'),
('Service Overview', 'Comprehensive overview of all ICE Alarm services. Great for introducing the full range of protection options.', ARRAY[45, 60], ARRAY['16:9', '1:1'], '{"sections": ["intro", "services", "benefits", "cta"], "fields": ["headline", "service1", "service2", "service3", "benefits", "cta_text"]}'),
('Device Focus', 'Highlight specific device features and capabilities. Ideal for showcasing the SOS pendant or Dosell dispenser.', ARRAY[15, 30], ARRAY['9:16', '16:9', '1:1'], '{"sections": ["device", "features", "cta"], "fields": ["headline", "device_name", "feature1", "feature2", "feature3", "cta_text"]}'),
('Reassurance / Trust', 'Build trust with reassurance messaging and credibility points. Perfect for addressing family concerns.', ARRAY[20, 30], ARRAY['9:16', '16:9', '1:1'], '{"sections": ["intro", "trust", "reassurance", "cta"], "fields": ["headline", "trust_point1", "trust_point2", "reassurance_text", "cta_text"]}');

-- 8. Insert singleton row for brand settings
INSERT INTO public.video_brand_settings (id) VALUES (gen_random_uuid());

-- 9. Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_video_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 10. Add triggers for updated_at
CREATE TRIGGER update_video_projects_updated_at
  BEFORE UPDATE ON public.video_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_video_updated_at();

CREATE TRIGGER update_video_renders_updated_at
  BEFORE UPDATE ON public.video_renders
  FOR EACH ROW EXECUTE FUNCTION public.update_video_updated_at();

CREATE TRIGGER update_video_brand_settings_updated_at
  BEFORE UPDATE ON public.video_brand_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_video_updated_at();

-- 11. Create storage bucket for video exports
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-hub-exports', 'video-hub-exports', true)
ON CONFLICT (id) DO NOTHING;

-- 12. Create storage policies for video-hub-exports bucket
CREATE POLICY "Staff can view video exports" ON storage.objects
  FOR SELECT USING (bucket_id = 'video-hub-exports' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can upload video exports" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'video-hub-exports' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can update video exports" ON storage.objects
  FOR UPDATE USING (bucket_id = 'video-hub-exports' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete video exports" ON storage.objects
  FOR DELETE USING (bucket_id = 'video-hub-exports' AND public.is_staff(auth.uid()));

CREATE POLICY "Public can view video exports" ON storage.objects
  FOR SELECT USING (bucket_id = 'video-hub-exports');